import {
  type ChangeStatus,
  combineChanges,
  type FrameChange,
  type FrameId,
  frameKey
} from "@parity-app/change-detection"
import { useEffect, useRef, useSyncExternalStore } from "react"
import type { RenderJob } from "../../shared/protocol.ts"
import { request } from "../service.ts"

/*
 * Whether each frame on the canvas, the nodes in it and its board changed since the frame was first looked at while its
 * project's open (PAR-997). The service compares the files each frame reads now with its baseline; the canvas only reads
 * the answers, so whether something changed is never worked out from what a bitmap or a render key says.
 */

/** A design's frames' changes, by frame, and what they add up to. */
interface DesignChanges {
  frames: Map<string, FrameChange>
  combined: ChangeStatus
  listeners: Set<() => void>
}

const unknown: ChangeStatus = { state: "unknown" }

/** Each design's frames' changes, by project and design. */
const designs = new Map<string, DesignChanges>()

const designKey = (project: string, design: string) => JSON.stringify([project, design])

function designChanges(key: string): DesignChanges {
  let found = designs.get(key)

  if (!found) {
    found = { frames: new Map(), combined: unknown, listeners: new Set() }
    designs.set(key, found)
  }

  return found
}

/** Records a frame's change, or that it's gone, and tells its design's readers. */
export function recordChange(id: FrameId, change: FrameChange | undefined): void {
  const design = designChanges(designKey(id.project, id.design))
  const key = frameKey(id)

  if (change) {
    design.frames.set(key, change)
  } else {
    design.frames.delete(key)
  }

  design.combined = combineChanges([...design.frames.values()].map((frame) => frame.status))
  design.listeners.forEach((listener) => listener())
}

/** Frames asked about in this task, waiting to be sent together once it's done. */
let asking: { id: FrameId; job: RenderJob; answer: (change: FrameChange) => void }[] = []

/**
 * Asks for a frame's change together with every other asked for in the same task, as a canvas's frames all ask at once
 * when the code changes, as JSON text, which crosses to the service as one copy. A failed request answers unknown.
 */
export function askChange(id: FrameId, job: RenderJob): Promise<FrameChange> {
  if (asking.length === 0) {
    queueMicrotask(() => {
      const asked = asking
      asking = []
      request("frames.changes", {
        frames: JSON.stringify(asked.map((frame) => ({ id: frame.id, job: frame.job })))
      }).then(
        ({ changes }) => asked.forEach(({ answer }, index) => answer(changes[index] ?? { status: unknown })),
        () => asked.forEach(({ answer }) => answer({ status: unknown }))
      )
    })
  }

  return new Promise((answer) => asking.push({ id, job, answer }))
}

/**
 * A frame's change and its nodes', asked for again whenever what it's drawn with changes, as its `key` says. Unknown
 * until the service answers.
 */
export function useFrameChange(id: FrameId, job: RenderJob, key: string): FrameChange | undefined {
  const { project, design, state, mode } = id
  const frame = frameKey(id)
  const latest = useRef(job)

  useEffect(() => {
    latest.current = job
  }, [job])

  // Asked once for each key, which changes whenever what the job draws does, not each time the job is built again.
  useEffect(() => {
    let current = true
    const which = { project, design, state, mode }
    void askChange(which, latest.current).then((change) => current && recordChange(which, change))

    return () => {
      current = false
    }
  }, [project, design, state, mode, key])

  // A frame taken off the canvas no longer counts toward its board.
  useEffect(() => () => recordChange({ project, design, state, mode }, undefined), [project, design, state, mode])

  return useSyncExternalStore(
    (listener) => subscribe(project, design, listener),
    () => designs.get(designKey(project, design))?.frames.get(frame)
  )
}

/**
 * Whether any of a design's frames on the canvas changed: changed when one did, unknown when none has said and one
 * can't, or none has an answer yet.
 */
export function designChange(project: string, design: string): ChangeStatus {
  return designs.get(designKey(project, design))?.combined ?? unknown
}

/** `designChange`, kept current. */
export function useDesignChange(project: string, design: string): ChangeStatus {
  return useSyncExternalStore(
    (listener) => subscribe(project, design, listener),
    () => designChange(project, design)
  )
}

function subscribe(project: string, design: string, listener: () => void): () => void {
  const { listeners } = designChanges(designKey(project, design))
  listeners.add(listener)

  return () => listeners.delete(listener)
}
