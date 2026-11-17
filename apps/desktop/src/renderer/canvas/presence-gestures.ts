import { type DesignNode, locateNode } from "@parity-app/core"
import type { Edge } from "@parity-app/editor"
import type { NodeRef } from "@parity-app/extension"
import type { Gesture, Handle, InFrame, Rect } from "@parity-app/extension/internal"
import type { ProjectSession } from "../workspace.ts"
import type { Press } from "./gesture.ts"

/*
 * This person's gestures on a project's canvas, as `parity.presence.onGesture` tells them (PAR-1257): a drag of layers
 * or boards, a resize, a box drawn to select, and typing. Each place a gesture starts tells it here; the tab's window
 * modules hear it through `renderer/window-seams.ts`. A gesture says what it does and where it started, never where
 * the pointer is each frame.
 */

/** A pointer gesture as it starts: what it does, without its phase. */
export type Started =
  | Omit<Extract<Gesture, { kind: "move" }>, "phase">
  | Omit<Extract<Gesture, { kind: "resize" }>, "phase">
  | Omit<Extract<Gesture, { kind: "marquee" }>, "phase">

/** Where dragged layers would land, as a move tells it. */
export type Drop = NonNullable<Extract<Gesture, { kind: "move" }>["drop"]>

/** The project whose canvas a gesture is on: its session, known by its document. */
export type GestureProject = Pick<ProjectSession, "doc">

const listeners = new WeakMap<GestureProject, Set<(gesture: Gesture) => void>>()

/** Hears the gestures on a project's canvas, until the function it gives is called. */
export function onGestures(project: GestureProject, listener: (gesture: Gesture) => void): () => void {
  const set = listeners.get(project) ?? new Set()
  listeners.set(project, set)
  set.add(listener)

  return () => set.delete(listener)
}

/** Tells a gesture on a project's canvas to whoever hears them. */
export function tellGesture(project: GestureProject, gesture: Gesture): void {
  for (const listener of listeners.get(project) ?? []) {
    listener(gesture)
  }
}

/**
 * `press`, telling the gesture it makes: started once the press becomes a drag (`describe` says what it does then,
 * or nothing to tell nothing), each change of where a move's layers would land (`drop`), and ended or called off once
 * the press has done what it does as it ends, so a move's write is committed before its end is told.
 */
export function telling(
  project: GestureProject,
  press: Press,
  describe: (event: PointerEvent) => Started | undefined,
  drop?: () => Drop | undefined
): Press {
  let started: Started | undefined
  let dropped: string | undefined

  const tell = (phase: "start" | "drop" | "end" | "cancel", landing?: Drop) => {
    if (!started) {
      return
    }

    if (started.kind === "move") {
      const gesture: Gesture = { ...started, phase }

      if (landing) {
        gesture.drop = landing
      }

      tellGesture(project, gesture)
    } else if (phase !== "drop") {
      tellGesture(project, { ...started, phase })
    }
  }

  return {
    ...press,
    start(drag, event) {
      press.start?.(drag, event)
      started = describe(event)
      tell("start")
    },
    move(event, drag) {
      press.move(event, drag)
      const landing = drop?.()
      const key = landing && JSON.stringify(landing)

      if (started?.kind === "move" && key !== dropped) {
        dropped = key
        tell("drop", landing)
      }
    },
    end(kept, drag) {
      press.end?.(kept, drag)
      tell(kept ? "end" : "cancel", drop?.())
      started = undefined
    }
  }
}

/** A design's layer, as `parity.selection` names it: its type in the design, and `designKey/layerId`. */
export function layerRef(
  doc: { design(key: string): { root: DesignNode } | undefined },
  design: string,
  node: string
): NodeRef {
  const root = doc.design(design)?.root
  const type = (root && locateNode(root, node)?.node.type) ?? "layer"

  return { owner: "design", type, key: `${design}/${node}` }
}

/**
 * Where a move's layers would land: before the child at `index` of `parent`, in the frame of `landing`, the host they'd
 * land in, which may be another state or mode than the one they were dragged from.
 */
export function dropIn(
  doc: Parameters<typeof layerRef>[0],
  landing: Pick<HTMLElement, "dataset">,
  target: { design: string; parent: string; index: number }
): Drop {
  const { state, mode } = landing.dataset

  return {
    ...inFrame(state || undefined, mode || undefined),
    parent: layerRef(doc, target.design, target.parent),
    index: target.index
  }
}

/** The frame something's drawn in, by state and mode, leaving out what isn't known. */
export function inFrame(state: string | undefined, mode: string | undefined): InFrame {
  const frame: InFrame = {}

  if (state !== undefined) {
    frame.state = state
  }

  if (mode !== undefined) {
    frame.mode = mode
  }

  return frame
}

/** Each resize handle, as a gesture names it. */
const handles: Record<Edge, Handle> = {
  n: "top",
  e: "right",
  s: "bottom",
  w: "left",
  ne: "topRight",
  se: "bottomRight",
  sw: "bottomLeft",
  nw: "topLeft"
}

/** A resize as it starts: what's resized, by which handle, from its box on screen as the window gives it. */
export function resizing(
  editor: { screenToPage(point: { x: number; y: number }): { x: number; y: number } },
  ref: NodeRef,
  frame: InFrame,
  edge: Edge,
  box: { left: number; top: number; right: number; bottom: number }
): Started {
  const from = editor.screenToPage({ x: box.left, y: box.top })
  const to = editor.screenToPage({ x: box.right, y: box.bottom })
  const rect: Rect = { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y }

  return { kind: "resize", ref, frame, handle: handles[edge], from: rect }
}
