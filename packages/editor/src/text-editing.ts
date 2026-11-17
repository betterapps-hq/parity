import {
  boardTarget,
  type ComponentLibrary,
  type ContainerSpec,
  type DesignNode,
  editInner,
  editNode,
  isHug,
  isInnerPath,
  layerOnBoard,
  type NodeStyle,
  type Size
} from "@parity-app/core"
import { z } from "zod"
import { editingState } from "./edit-frame.ts"

/**
 * Editing text in place and sizing text layers, as Figma does. The app measures and draws; these take what it measured
 * and return what to select or set.
 */

/** A component's child when it's a string. */
const textChild = z.string()

/** The text a layer shows, when it's editable in place: a text layer, or a component whose child is a string. */
export function editableText(node: DesignNode): string | undefined {
  if (node.type === "text") {
    return node.text
  }

  if (node.type === "component") {
    const child = textChild.safeParse(node.props?.children)

    return child.success ? child.data : undefined
  }

  return undefined
}

/**
 * What the text editor opens on: the layer `id`, one of the design's own or one inside an instance, as the board shows
 * it in the state edits go to (`editingState` of `picked`), and its text. Undefined when it isn't editable text.
 */
export function textToEdit(
  container: ContainerSpec,
  picked: string | undefined,
  id: string,
  library: ComponentLibrary
): { node: DesignNode; text: string } | undefined {
  const node = layerOnBoard(container, id, library, editingState(container, picked))
  const text = node && editableText(node)

  return node && text !== undefined ? { node, text } : undefined
}

/**
 * The design with layer `id`'s text set to `text`, written to the state `textToEdit` read it from, by the same rule,
 * so a picked state that's gone writes to the one the editor showed (PAR-585). In a state other than the base, or
 * with a variant shown, it's that state's or variant's change; inside an instance, only that copy's. Unchanged when
 * the layer is gone or isn't editable text.
 */
export function withEditedText(
  container: ContainerSpec,
  picked: string | undefined,
  id: string,
  text: string,
  library: ComponentLibrary
): ContainerSpec {
  const shown = textToEdit(container, picked, id, library)

  if (!shown) {
    return container
  }

  const target = boardTarget(container, editingState(container, picked).id)
  const change = shown.node.type === "text" ? { text } : { props: { children: text } }

  return isInnerPath(id) ? editInner(container, target, id, change, library) : editNode(container, target, id, change)
}

/** Where a selection starts and ends in a text, as a textarea counts them. */
export interface TextRange {
  start: number
  end: number
}

/**
 * The word a double-click at `offset` selects, as a browser does: the word holding that character, or the run of
 * spaces or the punctuation there when it isn't a word. An offset at the very end selects the last word.
 */
export function wordAt(text: string, offset: number): TextRange {
  if (text.length === 0) {
    return { start: 0, end: 0 }
  }

  const at = Math.max(0, Math.min(offset, text.length - 1))
  const segments = new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)
  const segment = segments.containing(at)

  if (!segment) {
    return { start: 0, end: text.length }
  }

  return { start: segment.index, end: segment.index + segment.segment.length }
}

/**
 * What the editor selects when it opens: the word under a double-click, or the whole text when it was opened with
 * Enter, by inserting text, or at a point that isn't on a character of it.
 */
export function openingSelection(text: string, offset: number | undefined): TextRange {
  if (offset === undefined || offset < 0 || offset >= text.length) {
    return { start: 0, end: text.length }
  }

  return wordAt(text, offset)
}

/**
 * Figma's three ways a text layer sizes: auto width grows along its line and never wraps for its parent; auto height
 * wraps at its width and grows down; fixed keeps its height whatever the text. They're read from its width and height,
 * so a resize handle changes the mode as Figma's do: a side handle fixes the width (auto height), the bottom fixes the
 * height (fixed).
 */
export type TextSizing = "auto-width" | "auto-height" | "fixed"

/** The mode a text layer's style is in. A width it doesn't set is the one its layout gives it, so it's auto height. */
export function textSizing(style: NodeStyle): TextSizing {
  if (style.height !== undefined && !isHug(style.height)) {
    return "fixed"
  }

  if (isHug(style.width)) {
    return "auto-width"
  }

  return "auto-height"
}

/**
 * Every style property switching modes can write. Resizing shows as changed when any of them is, and resetting it
 * resets all of them, so a reset in a state doesn't leave the `grow: false` a switch set behind.
 */
export const textSizingKeys = ["width", "height", "grow"] as const satisfies readonly (keyof NodeStyle)[]

/** Style properties to set; `undefined` clears one. */
export type TextSizingValues = Pick<
  { [K in keyof NodeStyle]: NodeStyle[K] | undefined },
  (typeof textSizingKeys)[number]
>

/**
 * The style that puts a text layer in a mode, keeping it the size it's drawn at, in spacing steps (`measured`): auto
 * width hugs its text and drops a fixed height; auto height fixes a hugging width where it is and drops the height;
 * fixed also fixes the height. A width that fills or that its layout gives it is kept.
 *
 * In a state, a variant or an instance, dropping a value would only take back that state's change and leave the
 * design's own height or `grow` showing, so with `explicit` they're set over it instead: the height to hug, which reads
 * as not fixed, and `grow` to false.
 *
 * `grow` fills along the parent's direction, so in a `column` it fills the height and goes for every mode; in a row it
 * fills the width, which auto height and fixed keep.
 */
export function withTextSizing(
  style: NodeStyle,
  sizing: TextSizing,
  measured: { width?: number; height?: number },
  { explicit = false, column = false }: { explicit?: boolean; column?: boolean } = {}
): TextSizingValues {
  const noHeight: Size | undefined = explicit && style.height !== undefined ? { size: "hug" } : undefined
  const noGrow = style.grow ? { grow: explicit ? false : undefined } : {}

  if (sizing === "auto-width") {
    return { width: { size: "hug" }, height: noHeight, ...noGrow }
  }

  const width = isHug(style.width) ? steps(measured.width) : style.width
  const grow = column ? noGrow : {}

  if (sizing === "auto-height") {
    return { width, height: noHeight, ...grow }
  }

  return {
    width,
    height: isHug(style.height) ? steps(measured.height) : (style.height ?? steps(measured.height)),
    ...grow
  }
}

/** A measured length as a size, when the layer was measured. */
function steps(measured: number | undefined): Size | undefined {
  return measured === undefined ? undefined : { step: measured }
}

/** One change to a text: the characters from `start` to `end` replaced by `insert`. */
interface TextSplice {
  start: number
  end: number
  insert: string
}

/** The one change that turns `before` into `after`, around what they start and end with in common. */
function spliceBetween(before: string, after: string): TextSplice {
  const most = Math.min(before.length, after.length)
  let start = 0

  while (start < most && before[start] === after[start]) {
    start++
  }

  let tail = 0

  while (tail < most - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) {
    tail++
  }

  return { start, end: before.length - tail, insert: after.slice(start, after.length - tail) }
}

/** A text with someone else's change taken in, and where the selection is in it. */
export interface RebasedText {
  text: string
  selection: TextRange
}

/**
 * Someone else's change to a text being typed, taken in (docs/proposals/extensions-in-the-window.md, Live text). `base`
 * is the text both started from, `local` what's typed since, and `remote` the text with the other change. Both changes
 * are kept, the typing placed where it was among the other's, and the selection moves with the characters around it,
 * so the caret stays where the person is typing. Where the two change the same characters, what either removed goes
 * and the typing follows what the other wrote.
 */
export function rebaseText(base: string, local: string, remote: string, selection: TextRange): RebasedText {
  const mine = spliceBetween(base, local)
  const theirs = spliceBetween(base, remote)
  const typedEnd = mine.start + mine.insert.length
  // What they wrote where the person's replacing starts counts as the same characters, so it's kept, not replaced.
  const overlap = (mine.start < theirs.end || mine.start === theirs.start) && theirs.start < mine.end
  // The characters of `base` the two changes replace between them, and where what replaces them starts in the result.
  const from = overlap ? Math.min(mine.start, theirs.start) : mine.start
  const to = overlap ? Math.max(mine.end, theirs.end) : mine.end

  // Where a place in `base` outside the changes is in the result. Inside what the other replaced, it's the end of what
  // they wrote.
  const moved = (at: number) => {
    if (at <= theirs.start) {
      return at
    }

    return at >= theirs.end
      ? at + theirs.insert.length - (theirs.end - theirs.start)
      : theirs.start + theirs.insert.length
  }

  const start = overlap ? from + theirs.insert.length : moved(from)
  const after = start + mine.insert.length

  // Where a place in `local` is in the result: before the typing, in it, or after it.
  const place = (at: number) => {
    if (at < mine.start) {
      return Math.min(moved(at), start)
    }

    if (at <= typedEnd) {
      return start + at - mine.start
    }

    return Math.max(moved(at - typedEnd + mine.end), moved(to)) - moved(to) + after
  }

  return {
    text:
      (overlap ? base.slice(0, from) + theirs.insert : remote.slice(0, start)) + mine.insert + remote.slice(moved(to)),
    selection: { start: place(selection.start), end: place(selection.end) }
  }
}
