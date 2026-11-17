import { type RebasedText, rebaseText, type TextRange } from "@parity-app/editor"
import type { GestureEnded, GestureId, ProjectDoc } from "@parity-app/multiplayer"

/** How long typing has to stop for its undo step to end, so the next keys start another. */
export const typingPause = 1000

/** The most often typing is written to the document: a few times a second, not on every key. */
export const typingBatch = 150

export interface LiveTextOptions {
  doc: Pick<ProjectDoc, "beginGesture" | "endGesture">
  /** The text the document holds now, as the editor shows it. */
  read: () => string | undefined
  /** Writes the text to the document, in the gesture given. */
  write: (text: string, gesture: GestureId) => void
}

/**
 * Text written as it's typed (docs/proposals/extensions-in-the-window.md, Live text). Typing is written a few times a
 * second, in a gesture that ends once typing pauses, so Undo takes back a pause's worth of typing, not each key. When
 * the document's text changes under the editor, as someone else in a live room types, the change is taken into what's
 * typed and the caret moves with it.
 */
export class LiveText {
  /** The text the document holds, as far as the editor knows: what it last wrote or took in. */
  private base: string
  /** What's typed, written or not. */
  private value: string
  private gesture: GestureId | undefined
  private batch: ReturnType<typeof setTimeout> | undefined
  private pause: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(
    text: string,
    private readonly options: LiveTextOptions
  ) {
    this.base = text
    this.value = text
  }

  /** The person typed: the editor now holds `value`. It's written within `typingBatch`. */
  input(value: string): void {
    if (this.closed) {
      return
    }

    this.value = value
    this.gesture ??= this.options.doc.beginGesture()
    this.batch ??= setTimeout(() => this.flush(), typingBatch)
    clearTimeout(this.pause)
    this.pause = setTimeout(() => this.endStep(), typingPause)
  }

  /**
   * The document changed. If its text did, other than by this editor, it's taken into `value`, what the editor holds,
   * and the text and selection the editor should show are returned. What's typed and not yet written is kept.
   */
  received(value: string, selection: TextRange): RebasedText | undefined {
    const remote = this.options.read()

    if (this.closed || remote === undefined || remote === this.base) {
      return undefined
    }

    const rebased = rebaseText(this.base, value, remote, selection)
    this.base = remote
    this.value = rebased.text

    if (rebased.text !== remote) {
      this.input(rebased.text)
    }

    return rebased
  }

  /** Writes what's typed and ends its step. Nothing more is written after. */
  close(value = this.value): GestureEnded | undefined {
    if (this.closed) {
      return undefined
    }

    this.value = value
    const ended = this.endStep()
    this.closed = true

    return ended
  }

  /** Writes what's typed and not yet written. */
  private flush(): void {
    clearTimeout(this.batch)
    this.batch = undefined

    if (this.value === this.base) {
      return
    }

    this.gesture ??= this.options.doc.beginGesture()
    // Set first, since the write tells the document's subscribers, who call `received`, before it returns.
    this.base = this.value
    this.options.write(this.value, this.gesture)
  }

  /** Typing paused or the editor closed: what's typed is written and its undo step ends. */
  private endStep(): GestureEnded | undefined {
    clearTimeout(this.pause)
    this.pause = undefined
    this.flush()
    const gesture = this.gesture
    this.gesture = undefined

    return gesture === undefined ? undefined : this.options.doc.endGesture(gesture)
  }
}
