import type { Length, NodeStyle, Size } from "@parity-app/core"

/**
 * Editing text in place and sizing text layers, as Figma does. The app measures and draws; these take what it measured
 * and return what to select or set.
 */

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
  if (text.length === 0) return { start: 0, end: 0 }
  const at = Math.max(0, Math.min(offset, text.length - 1))
  const segments = new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)
  const segment = segments.containing(at)
  if (!segment) return { start: 0, end: text.length }
  return { start: segment.index, end: segment.index + segment.segment.length }
}

/**
 * What the editor selects when it opens: the word under a double-click, or the whole text when it was opened with
 * Enter, by inserting text, or at a point that isn't on a character of it.
 */
export function openingSelection(text: string, offset: number | undefined): TextRange {
  if (offset === undefined || offset < 0 || offset >= text.length) return { start: 0, end: text.length }
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
  if (style.height !== undefined && style.height !== "hug") return "fixed"
  if (style.width === "hug") return "auto-width"
  return "auto-height"
}

/** Style properties to set; `undefined` clears one. */
export type TextSizingValues = Pick<{ [K in keyof NodeStyle]: NodeStyle[K] | undefined }, "width" | "height" | "grow">

/**
 * The style that puts a text layer in a mode, keeping it the size it's drawn at, in spacing steps (`measured`): auto
 * width hugs its text and drops a fixed height; auto height fixes a hugging width where it is and drops the height;
 * fixed also fixes the height. A width that fills or that its layout gives it is kept.
 *
 * In a state, a variant or an instance, dropping a value would only take back that state's change and leave the
 * design's own height or `grow` showing, so with `explicit` they're set over it instead: the height to hug, which reads
 * as not fixed, and `grow` to false.
 */
export function withTextSizing(
  style: NodeStyle,
  sizing: TextSizing,
  measured: { width?: number; height?: number },
  { explicit = false }: { explicit?: boolean } = {}
): TextSizingValues {
  const noHeight = explicit && style.height !== undefined ? "hug" : undefined
  if (sizing === "auto-width") {
    return { width: "hug", height: noHeight, ...(style.grow ? { grow: explicit ? false : undefined } : {}) }
  }
  const width = style.width === "hug" ? measured.width : style.width
  if (sizing === "auto-height") return { width, height: noHeight }
  return { width, height: fixedLength(style.height) ?? measured.height }
}

function fixedLength(size: Size | undefined): Length | undefined {
  return size === "hug" ? undefined : size
}
