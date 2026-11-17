import { type RebasedText, rebaseText, spliceAt, type TextRange, type TextSplice } from "@parity-app/editor"
import type { GestureEnded, GestureId, ProjectDoc } from "@parity-app/multiplayer"

/** How long typing has to stop for its undo step to end, so the next keys start another. */
export const typingPause = 1000

export interface LiveTextOptions {
  doc: Pick<ProjectDoc, "beginGesture" | "endGesture">
  /** The text the document holds now, as the editor shows it. */
  read: () => string | undefined
  /** Writes `text` to the document, in the gesture given: `splice` is the change typed, from the text it held. */
  write: (text: string, splice: TextSplice, gesture: GestureId) => void
}

/**
 * Text written as it's typed (docs/proposals/extensions-in-the-window.md, Live text). Each key is written as it's
 * typed, as the change it made at the caret, in a gesture that ends once typing pauses, so Undo takes back a pause's
 * worth of typing, not each key. Nothing typed waits to be written, so when the document's text changes under the
 * editor, as someone else in a live room types, the editor takes the text as it is and only the caret is moved; and
 * two people typing in one text at once both keep every letter (PAR-1238).
 */
export class LiveText {
  /** The text the document holds, as far as the editor knows: what it last wrote or took in. */
  private base: string
  private gesture: GestureId | undefined
  private pause: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(
    text: string,
    private readonly options: LiveTextOptions
  ) {
    this.base = text
  }

  /** The person typed: the editor now holds `value`, with the caret at `caret`. It's written at once. */
  input(value: string, caret?: number): void {
    if (this.closed || value === this.base) {
      return
    }

    const splice = spliceAt(this.base, value, caret)
    this.gesture ??= this.options.doc.beginGesture()
    // Set first, since the write tells the document's subscribers, who call `received`, before it returns.
    this.base = value
    this.options.write(value, splice, this.gesture)
    clearTimeout(this.pause)
    this.pause = setTimeout(() => this.endStep(), typingPause)
  }

  /**
   * The document changed. If its text did, other than by this editor, the text and selection the editor should show
   * are returned: the document's text, with the selection moved with the characters around it. Should the editor hold
   * typing that isn't written, as an input method's once it's done, it's kept and written.
   */
  received(value: string, selection: TextRange): RebasedText | undefined {
    const remote = this.options.read()

    if (this.closed || remote === undefined || remote === this.base) {
      return undefined
    }

    const rebased = rebaseText(this.base, value, remote, selection)
    this.base = remote
    this.input(rebased.text, rebased.selection.end)

    return rebased
  }

  /** Writes what the editor holds and ends its step. Nothing more is written after. */
  close(value?: string): GestureEnded | undefined {
    if (this.closed) {
      return undefined
    }

    if (value !== undefined) {
      this.input(value)
    }

    const ended = this.endStep()
    this.closed = true

    return ended
  }

  /** Typing paused or the editor closed: its undo step ends. */
  private endStep(): GestureEnded | undefined {
    clearTimeout(this.pause)
    this.pause = undefined
    const gesture = this.gesture
    this.gesture = undefined

    return gesture === undefined ? undefined : this.options.doc.endGesture(gesture)
  }
}
