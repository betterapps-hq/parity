import type { LayerFailure } from "@parity-app/core"
import { designFailures, layerFailure } from "@parity-app/editor"
import { useSyncExternalStore } from "react"
import type { LoadedGuest } from "./guest.ts"

/** Each design's frames' latest failures, and what they come to, kept until one of its frames reports again. */
interface DesignEntry {
  frames: Map<object, readonly LayerFailure[]>
  failures: LayerFailure[]
  listeners: Set<() => void>
}

const none: LayerFailure[] = []

/** By the guest that draws them, so a project closed or loaded again at a new address starts with none. */
const guests = new WeakMap<LoadedGuest, Map<string, DesignEntry>>()

function entryFor(loaded: LoadedGuest, design: string): DesignEntry {
  let designs = guests.get(loaded)
  if (!designs) guests.set(loaded, (designs = new Map()))
  let entry = designs.get(design)
  if (!entry) designs.set(design, (entry = { frames: new Map(), failures: none, listeners: new Set() }))
  return entry
}

/**
 * Records one frame's failing layers, as its guest reports them. `frame` stands for the frame while it's on the
 * canvas, asleep or awake; an empty list once it's gone, or draws without failing, takes it out.
 */
export function reportFrameFailures(
  loaded: LoadedGuest,
  design: string,
  frame: object,
  failures: readonly LayerFailure[]
): void {
  const entry = entryFor(loaded, design)
  if (sameFailures(entry.frames.get(frame) ?? none, failures)) return
  if (failures.length === 0) entry.frames.delete(frame)
  else entry.frames.set(frame, failures)
  const next = designFailures(entry.frames.values())
  entry.failures = next.length === 0 ? none : next
  for (const listener of entry.listeners) listener()
}

/** The design's failing layers in any of its frames, one per node, for its board's badge. */
export function useDesignFailures(loaded: LoadedGuest, design: string): readonly LayerFailure[] {
  const entry = entryFor(loaded, design)
  return useSyncExternalStore(
    (listener) => {
      entry.listeners.add(listener)
      return () => entry.listeners.delete(listener)
    },
    () => entry.failures
  )
}

/** The failure a design's layer shows in Layers and the inspector, if it fails in any frame. */
export function useLayerFailure(loaded: LoadedGuest, design: string, nodeId: string): LayerFailure | undefined {
  return layerFailure(useDesignFailures(loaded, design), nodeId)
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
