import type { LayerFailure } from "@parity-app/core"
import { designFailures, failureAdvice, layerFailure } from "@parity-app/editor"
import { type ConsoleMessage, consoleLog } from "./console-store.ts"
import { type Store, createStore, useStore } from "./store.ts"

/** A frame on the canvas, as its failures are kept: the state and mode it draws, and what fails in it now. */
interface FrameEntry {
  state: string
  mode: string
  failures: readonly LayerFailure[]
}

/** Each design's frames' latest failures, and what they come to. */
interface DesignEntry {
  frames: Map<WeakKey, FrameEntry>
  failures: Store<readonly LayerFailure[]>
}

const none: LayerFailure[] = []

/** By project, then design. */
const projects = new Map<string, Map<string, DesignEntry>>()

/** When each failure was first seen, by project, design, node and error, for the console's time. */
const seen = new Map<string, number>()

function entryFor(project: string, design: string): DesignEntry {
  let designs = projects.get(project)

  if (!designs) {
    projects.set(project, (designs = new Map()))
  }

  let entry = designs.get(design)

  if (!entry) {
    designs.set(design, (entry = { frames: new Map(), failures: createStore<readonly LayerFailure[]>(() => none) }))
  }

  return entry
}

/**
 * Records one frame's failing layers, as its guest reports them (PAR-165). `frame` stands for the frame while it's on
 * the canvas, asleep or awake; an empty list once it's gone, or draws without failing, takes it out. The project's
 * console shows them as errors for as long as they last.
 */
export function reportFrameFailures(
  project: string,
  design: string,
  frame: WeakKey,
  where: { state: string; mode: string },
  failures: readonly LayerFailure[]
): void {
  const entry = entryFor(project, design)
  const was = entry.frames.get(frame)

  if (sameFailures(was?.failures ?? none, failures) && (failures.length === 0 || sameWhere(was, where))) {
    return
  }

  if (failures.length === 0) {
    entry.frames.delete(frame)
  } else {
    entry.frames.set(frame, { ...where, failures })
  }

  const next = designFailures([...entry.frames.values()].map((known) => known.failures))
  entry.failures.set(next.length === 0 ? none : next)

  consoleLog(project).setFailures(failureMessages(project, Date.now()))
}

/** The design's failing layers in any of its frames, one per node. */
export function useDesignFailures(project: string, design: string): readonly LayerFailure[] {
  return useStore(entryFor(project, design).failures)
}

/** The failure a design's layer shows in Layers, if it fails in any frame. */
export function useLayerFailure(project: string, design: string, nodeId: string): LayerFailure | undefined {
  return layerFailure(useDesignFailures(project, design), nodeId)
}

/**
 * The project's failing layers as console errors: one for each layer and error, with the frames it fails in, why and
 * how to fix it. Each keeps the time it was first seen while it lasts.
 */
export function failureMessages(project: string, now: number): ConsoleMessage[] {
  const messages = new Map<string, ConsoleMessage>()
  const current = new Set<string>()

  for (const [design, entry] of projects.get(project) ?? []) {
    for (const frame of entry.frames.values()) {
      for (const failure of frame.failures) {
        const id = JSON.stringify(["failure", project, design, failure.nodeId, failure.error])
        current.add(id)
        const first = seen.get(id) ?? now
        seen.set(id, first)
        const where = { state: frame.state, mode: frame.mode }
        const known = messages.get(id)

        if (known) {
          if (!known.frames!.some((other) => sameWhere(other, where))) {
            known.frames!.push(where)
          }

          continue
        }

        const { reason, fix } = failureAdvice(failure.error)
        messages.set(id, {
          id,
          level: "error",
          text: failure.error,
          source: "",
          line: 0,
          where: "canvas",
          count: 1,
          first,
          last: first,
          design,
          frames: [where],
          failure: fix
            ? { nodeId: failure.nodeId, component: failure.component, reason, fix }
            : { nodeId: failure.nodeId, component: failure.component, reason }
        })
      }
    }
  }

  const prefix = JSON.stringify(["failure", project]).slice(0, -1)

  for (const id of seen.keys()) {
    if (id.startsWith(prefix) && !current.has(id)) {
      seen.delete(id)
    }
  }

  return [...messages.values()]
}

function sameWhere(a: { state: string; mode: string } | undefined, b: { state: string; mode: string }): boolean {
  return a?.state === b.state && a.mode === b.mode
}

function sameFailures(a: readonly LayerFailure[], b: readonly LayerFailure[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (failure, index) =>
        failure.nodeId === b[index]!.nodeId &&
        failure.component === b[index]!.component &&
        failure.error === b[index]!.error
    )
  )
}
