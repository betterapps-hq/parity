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
export interface TextSplice {
  start: number
  end: number
  insert: string
}

/**
 * The one change that turns `before` into `after`, where the caret ended up at `caret` in `after`: typing ends at the
 * caret, so where the change could be in more than one place, as a letter typed beside the same letter, it's the one
 * that ends there. Without a caret it's the first place it could be.
 */
export function spliceAt(before: string, after: string, caret?: number): TextSplice {
  const most = Math.min(before.length, after.length)
  // What the two end with in common can't reach back past the caret.
  const tailRoom = caret === undefined ? most : Math.min(most, Math.max(0, after.length - caret))
  let tail = 0

  while (tail < tailRoom && before[before.length - 1 - tail] === after[after.length - 1 - tail]) {
    tail++
  }

  let start = 0

  while (start < most - tail && before[start] === after[start]) {
    start++
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
 * is the text both started from, `local` what's typed since, and `remote` the text with the other's changes. Both are
 * kept, the typing placed where it was among the other's, and the selection moves with the characters around it, so
 * the caret stays where the person is typing. Each character of `base` is followed to where it is in `remote`
 * (`keptCharacters`), so the other's changes on both sides of the typing stay apart (PAR-1238). Where the two change
 * the same characters, what either removed goes and the typing follows what the other wrote; where both only write at
 * one place, the typing comes first.
 */
export function rebaseText(base: string, local: string, remote: string, selection: TextRange): RebasedText {
  const mine = spliceAt(base, local, selection.end)
  const where = keptCharacters(base, remote)
  const typedEnd = mine.start + mine.insert.length
  // Where the characters the typing replaced still are in `remote`.
  const replaced = where.slice(mine.start, mine.end).filter((at) => at >= 0)
  const gone = new Set(replaced)

  // The other changed the characters the typing replaced: removed some, or wrote between them.
  const overlap =
    replaced.length < mine.end - mine.start ||
    replaced.some((at, index) => index > 0 && at !== replaced[index - 1]! + 1)

  // Where a place in `base` is in `remote`: just after the last character before it that's still there.
  const after = (at: number) => {
    for (let index = at - 1; index >= 0; index--) {
      if (where[index]! >= 0) {
        return where[index]! + 1
      }
    }

    return 0
  }

  // Where the first character after the typing that's still there is in `remote`.
  const before = () => {
    for (let index = mine.end; index < base.length; index++) {
      if (where[index]! >= 0) {
        return where[index]!
      }
    }

    return remote.length
  }

  const insertAt = overlap ? before() : after(mine.start)
  let text = ""

  for (let at = 0; at <= remote.length; at++) {
    if (at === insertAt) {
      text += mine.insert
    }

    if (at < remote.length && !gone.has(at)) {
      text += remote[at]
    }
  }

  // Where a place in `remote` is in the result, before the typing when it's where the typing goes.
  const shown = (at: number) => {
    let removed = 0

    for (const position of gone) {
      if (position < at) {
        removed++
      }
    }

    return at - removed + (insertAt < at ? mine.insert.length : 0)
  }

  const typing = shown(insertAt)

  // Where a place in `local` is in the result: before the typing, in it, or after it.
  const place = (at: number) => {
    if (at <= mine.start) {
      return Math.min(shown(after(at)), typing)
    }

    if (at <= typedEnd) {
      return typing + at - mine.start
    }

    return Math.max(shown(after(at - typedEnd + mine.end)), typing + mine.insert.length)
  }

  return { text, selection: { start: place(selection.start), end: place(selection.end) } }
}

/**
 * Where each character of `before` is in `after`, or -1 for one that's gone: the longest run of characters they share,
 * in order, after what they start and end with.
 */
export function keptCharacters(before: string, after: string): number[] {
  let head = 0

  while (head < before.length && head < after.length && before[head] === after[head]) {
    head++
  }

  let tail = 0

  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++
  }

  const where = Array.from({ length: before.length }, () => -1)

  for (let index = 0; index < head; index++) {
    where[index] = index
  }

  for (let index = 0; index < tail; index++) {
    where[before.length - 1 - index] = after.length - 1 - index
  }

  // The middles, by Myers' difference: its cost grows with how much others changed, not with the text's length.
  const a = before.slice(head, before.length - tail)
  const b = after.slice(head, after.length - tail)

  for (const [i, j] of sharedRun(a, b)) {
    where[head + i] = head + j
  }

  // A character written as two code units is kept whole or not at all, so a change never splits it.
  for (let index = 0; index + 1 < before.length; index++) {
    const pair = /[\uD800-\uDBFF]/.test(before[index]!) && /[\uDC00-\uDFFF]/.test(before[index + 1]!)
    const whole = where[index]! >= 0 && where[index + 1] === where[index]! + 1

    if (pair && !whole) {
      where[index] = -1
      where[index + 1] = -1
    }
  }

  return where
}

/** The most changes `sharedRun` looks through before it gives up and treats the rest as changed. */
const mostChanges = 2000

/**
 * The characters `a` and `b` share, in order, as pairs of positions: Myers' O(ND) difference, which keeps one row per
 * change it looks through. Past `mostChanges` it gives up and shares nothing, so a far-apart pair costs no more than that.
 */
function sharedRun(a: string, b: string): [number, number][] {
  const offset = Math.min(a.length + b.length, mostChanges) + 1
  const furthest = new Int32Array(2 * offset + 1)
  const rows: Int32Array[] = []

  for (let changes = 0; changes < offset; changes++) {
    rows.push(furthest.slice())

    for (let diagonal = -changes; diagonal <= changes; diagonal += 2) {
      const down =
        diagonal === -changes ||
        (diagonal !== changes && furthest[offset + diagonal - 1]! < furthest[offset + diagonal + 1]!)

      let x = down ? furthest[offset + diagonal + 1]! : furthest[offset + diagonal - 1]! + 1
      let y = x - diagonal

      while (x < a.length && y < b.length && a[x] === b[y]) {
        x++
        y++
      }

      furthest[offset + diagonal] = x

      if (x >= a.length && y >= b.length) {
        return backtrack(rows, offset, a.length, b.length, a, b)
      }
    }
  }

  return []
}

/** The shared pairs on the path `sharedRun` found, walked back from the end through the rows it kept. */
function backtrack(rows: Int32Array[], offset: number, n: number, m: number, a: string, b: string): [number, number][] {
  const pairs: [number, number][] = []
  let x = n
  let y = m

  for (let changes = rows.length - 1; changes >= 0; changes--) {
    const row = rows[changes]!
    const diagonal = x - y

    const down =
      diagonal === -changes || (diagonal !== changes && row[offset + diagonal - 1]! < row[offset + diagonal + 1]!)

    const previous = down ? diagonal + 1 : diagonal - 1
    const fromX = row[offset + previous]!
    const fromY = fromX - previous

    while (x > fromX && y > fromY && a[x - 1] === b[y - 1]) {
      x--
      y--
      pairs.push([x, y])
    }

    x = fromX
    y = fromY
  }

  return pairs.reverse()
}
