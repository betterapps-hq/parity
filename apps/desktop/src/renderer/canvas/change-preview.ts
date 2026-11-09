import type { Checkpoint } from "@parity-app/editor"
import { useEffect, useMemo } from "react"
import type { DesignStore } from "../design-store.ts"

/** What a change preview needs of the store: gestures, and taking one back. */
type GestureStore = Pick<DesignStore, "beginGesture" | "endGesture" | "checkpoint" | "revert">

/**
 * An edit shown on a design's frames before it's made, for one inline styles can't show (see `StylePreview`): a
 * component's prop, which the component has to draw again for. It shows by making the change, in a gesture of its own,
 * as a resize writes as the pointer moves. Each new preview takes the last one back first, and taking it back leaves
 * nothing to undo. Making the edit takes the preview back and makes the change, as one undo step.
 */
export class ChangePreview {
  private open: { gesture: string; checkpoint: Checkpoint | undefined } | undefined

  constructor(
    private readonly store: GestureStore,
    private readonly design: string
  ) {}

  /** Shows a change in place of what this preview showed before. `make` makes it, with the gesture it's given. */
  show(make: (gesture: string) => void): void {
    if (this.open) {
      this.takeBack()
    } else {
      const gesture = this.store.beginGesture()
      this.open = { gesture, checkpoint: this.store.checkpoint(this.design, gesture) }
    }

    make(this.open.gesture)
  }

  /** Takes the preview back, as though it never showed. */
  cancel(): void {
    if (!this.open) {
      return
    }

    this.takeBack()
    this.store.endGesture(this.open.gesture)
    this.open = undefined
  }

  /**
   * Makes a change, taking back what's previewed first. It's made with `gesture` when given, as a run of Up presses
   * gives its own, and otherwise as a step of its own.
   */
  commit(make: (gesture?: string) => void, gesture?: string): void {
    this.cancel()
    make(gesture)
  }

  private takeBack(): void {
    if (this.open?.checkpoint) {
      this.store.revert(this.open.checkpoint)
    }
  }
}

/** A change preview for a panel, taken back if the panel goes while it shows, as when the selection changes. */
export function useChangePreview(store: GestureStore, design: string): ChangePreview {
  const preview = useMemo(() => new ChangePreview(store, design), [store, design])
  useEffect(() => () => preview.cancel(), [preview])

  return preview
}
