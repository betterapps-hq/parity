import { type Checkpoint, dragThreshold } from "@parity-app/editor"
import type { DesignStore } from "../design-store.ts"

/**
 * One lifecycle for every gesture on the canvas, so a fix to how one starts or ends reaches them all. A pointer gesture
 * is a press that becomes a drag once the pointer has gone `dragThreshold` pixels, a rule of `@parity-app/editor`'s
 * (`followPress`): from then it's one undo gesture, holds its cursor, and ends at the release, the pointer cancelled,
 * the window losing focus or Escape, as its entry in `gestures` says. A run is a series of presses on one selection,
 * such as arrow presses nudging it, which is one undo gesture while the selection stays (`GestureRun`).
 */

/**
 * How a pointer gesture on the canvas ended: the pointer released, Escape pressed, or cut short, by the pointer being
 * cancelled or the window losing focus, after which no release comes.
 */
export type GestureEnd = "release" | "escape" | "interrupted"

/**
 * Calls `onEnd` once, the first way the pointer gesture under way ends (see `GestureEnd`), and stops listening for the
 * others then, so nothing is left listening whichever way it ends. Escape goes no further than the gesture. `target`
 * is the window. Returns a function that stops listening without calling `onEnd`.
 */
export function onGestureEnd(target: EventTarget, onEnd: (how: GestureEnd) => void): () => void {
  const capture = { capture: true }
  const stop = () => {
    target.removeEventListener("pointerup", release, capture)
    target.removeEventListener("pointercancel", interrupt, capture)
    target.removeEventListener("blur", interrupt)
    target.removeEventListener("keydown", key, capture)
  }
  const end = (how: GestureEnd) => {
    stop()
    onEnd(how)
  }
  const release = () => end("release")
  const interrupt = () => end("interrupted")
  const key = (event: Event) => {
    if (!("key" in event) || event.key !== "Escape") return
    event.preventDefault()
    event.stopImmediatePropagation()
    end("escape")
  }
  target.addEventListener("pointerup", release, capture)
  target.addEventListener("pointercancel", interrupt, capture)
  // Not capturing, so it's the window's own focus going, not a field's inside it.
  target.addEventListener("blur", interrupt)
  target.addEventListener("keydown", key, capture)
  return stop
}

/**
 * What a drag does when Escape ends it, or when it's cut short. `keep` ends it as a release does, keeping what it did.
 * `revert` takes back everything it wrote to its design, leaving nothing to undo. `cancel` calls it off: it writes
 * only when it's kept, so there's nothing in the design to take back, and it puts back whatever it showed meanwhile.
 */
export type GestureOutcome = "keep" | "revert" | "cancel"

export interface GesturePolicy {
  /** What Escape does. */
  readonly escape: GestureOutcome
  /** What the pointer being cancelled or the window losing focus does. */
  readonly interrupted: GestureOutcome
}

/** Each canvas gesture's policy, which it's followed by (see `followPress`). */
export const gestures = {
  /** A resize writes as the pointer moves. Escape takes it all back; cut short, it keeps what it did. */
  resize: { escape: "revert", interrupted: "keep" },
  /** Layers dragged in a layout move when they're dropped, so Escape and being cut short call the drag off. */
  layerDrag: { escape: "cancel", interrupted: "cancel" },
  /** An absolutely placed layer moves as the pointer does. Escape and being cut short take it back. */
  absoluteDrag: { escape: "revert", interrupted: "revert" },
  /**
   * Designs dragged by a title move on the canvas, and are saved where they are when it ends. Escape puts them back
   * where they were; cut short, they're saved where they are.
   */
  titleDrag: { escape: "cancel", interrupted: "keep" },
  /** A box drawn on a frame's background selects as it goes. Escape and being cut short put back what was selected. */
  boxSelect: { escape: "cancel", interrupted: "cancel" },
  /** A frame drawn with the frame tool is made when it's released. Escape and being cut short draw nothing. */
  frameDraw: { escape: "cancel", interrupted: "cancel" }
} as const satisfies Record<string, GesturePolicy>

/** What a gesture needs of the store: an undo gesture, and a checkpoint of its design to take it back to. */
export type GestureStore = Pick<DesignStore, "beginGesture" | "endGesture" | "checkpoint" | "revert" | "getEntry">

/** A press that's become a drag. */
export interface Drag {
  /** The undo gesture the drag writes in, so everything it writes is one undo step. */
  readonly gesture: string
  /** Takes back what the drag has written to its design so far, as though it never wrote it. */
  revert(): void
}

/** What a press does as it goes. `PointerEvent`s here are the window's, after the press. */
export interface Press {
  /** The design the drag writes to as the pointer moves, which `revert` takes back. */
  design?: string
  /** The cursor shown wherever the pointer goes, from when the press becomes a drag until it ends. */
  cursor?: string
  /** The press became a drag. */
  start?(drag: Drag, event: PointerEvent): void
  /** The pointer moved, once the press is a drag. */
  move(event: PointerEvent, drag: Drag): void
  /**
   * The drag is over. `kept` when it was released, or ended by an outcome that keeps it, so what it did stands; when
   * not, the design is already reverted if the policy said so, and what the drag showed itself is its to put back.
   */
  end?(kept: boolean, drag: Drag): void
  /** Released before it became a drag. */
  click?(): void
}

/** Where a gesture hears the pointer and keys, and shows its cursor: the window. */
export interface GestureWindow {
  target: EventTarget
  holdCursor(cursor: string): () => void
}

/**
 * Follows a press from `start`, by `policy`. It becomes a drag once the pointer has gone `dragThreshold` pixels: then,
 * and not before, it begins the undo gesture, takes a checkpoint of its design and holds its cursor. A release before
 * that is a click. Once it's a drag, it ends at the release, which keeps it, or as the policy says at Escape, the
 * pointer cancelled or the window losing focus; it lets the cursor go and ends the undo gesture then, whichever way.
 */
export function followPress(
  policy: GesturePolicy,
  store: GestureStore,
  start: { clientX: number; clientY: number },
  press: Press,
  at: GestureWindow = { target: window, holdCursor }
): void {
  let drag: Drag | undefined
  let checkpoint: Checkpoint | undefined
  let releaseCursor: (() => void) | undefined
  // Only once the design has changed, since a revert writes its file again.
  const revert = () => {
    if (!checkpoint || press.design === undefined) return
    if (store.getEntry(press.design)?.container !== checkpoint.container) store.revert(checkpoint)
  }

  const onMove = (event: Event) => {
    if (!isPointer(event)) return
    if (!drag) {
      if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < dragThreshold) return
      const gesture = store.beginGesture()
      checkpoint = press.design === undefined ? undefined : store.checkpoint(press.design, gesture)
      releaseCursor = press.cursor === undefined ? undefined : at.holdCursor(press.cursor)
      drag = { gesture, revert }
      press.start?.(drag, event)
    }
    event.preventDefault()
    press.move(event, drag)
  }
  // As an object, since Node's EventTarget, which the tests use, doesn't match `true` to remove it.
  const capture = { capture: true }
  at.target.addEventListener("pointermove", onMove, capture)
  onGestureEnd(at.target, (how) => {
    at.target.removeEventListener("pointermove", onMove, capture)
    if (!drag) {
      if (how === "release") press.click?.()
      return
    }
    const outcome = how === "release" ? "keep" : policy[how]
    if (outcome === "revert") revert()
    releaseCursor?.()
    press.end?.(outcome === "keep", drag)
    store.endGesture(drag.gesture)
  })
}

function isPointer(event: Event): event is PointerEvent {
  return "clientX" in event && "clientY" in event
}

/**
 * The cursor a gesture shows wherever the pointer goes until it ends: grabbing while layers or designs are dragged, the
 * handle's arrows while resizing. A cursor set on the page's body was hidden over the canvas, whose own elements set
 * tldraw's cursor, and over a title, which sets its own. So the cursor is held by a transparent layer over the whole
 * window, above everything, for as long as the gesture lasts. The gesture follows the pointer through window
 * listeners, and finds what's under it by layout boxes, so the layer takes nothing from it; and while it's there,
 * nothing under the pointer reacts to being hovered.
 *
 * Returns what lets it go. Letting go twice is harmless.
 */
export function holdCursor(cursor: string): () => void {
  const layer = document.createElement("div")
  layer.dataset.heldCursor = cursor
  layer.style.cssText = `position: fixed; inset: 0; z-index: 2147483647; cursor: ${cursor}`
  document.body.append(layer)
  return () => layer.remove()
}

/**
 * A run of presses on one selection: arrow presses nudging it on the canvas, or Up and Down in a field. A run is one
 * undo gesture, however long it takes. Runs are keyed by the selection's `selectionKey`, so a press on another
 * selection starts a run of its own, and a run ends as soon as the selection changes, even back to what it was.
 */
export class GestureRun {
  private open: { key: string | undefined; gesture: string; stop?: () => void } | undefined

  constructor(private readonly store: Pick<DesignStore, "beginGesture" | "endGesture">) {}

  /**
   * The gesture a press on the selection `key` is in: the run's while it's on that selection, else a new run's, which
   * ends the last. `watch`, called as a new run begins, follows the selection for it, usually by calling `select` as
   * the selection changes, and returns what stops following it.
   */
  gesture(key: string | undefined, watch?: () => () => void): string {
    if (this.open && this.open.key === key) return this.open.gesture
    this.end()
    const gesture = this.store.beginGesture()
    this.open = { key, gesture }
    this.open.stop = watch?.()
    return gesture
  }

  /** The selection is now `key`: a run on another one ends, so its step takes nothing more. */
  select(key: string | undefined): void {
    if (this.open && this.open.key !== key) this.end()
  }

  /** Ends the run, so the next press starts another. */
  end(): void {
    const open = this.open
    if (!open) return
    this.open = undefined
    open.stop?.()
    this.store.endGesture(open.gesture)
  }
}
