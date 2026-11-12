import {
  openingSelection,
  type TextRange,
  textFrameRenamed,
  textSizing,
  textToEdit,
  withEditedText
} from "@parity-app/editor"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import type { Attributes } from "../chrome/event-attributes.ts"
import { track } from "../report-error.ts"
import { useProject } from "./context.ts"
import { type AreaSpace, areaSpace, type ElementGeometry, frameGeometry } from "./frame-geometry.ts"
import { nodeInFrames, type Point, selectionFrame } from "./hit.ts"
import { kindColors } from "./kinds.tsx"

/** What closed the editor: Enter, Escape, or clicking away. */
type TextEditEnd = "enter" | "escape" | "blur"

/** Where the editor draws, in the canvas area's pixels, and how its text looks there. */
interface EditorLayout {
  box: { x: number; y: number; w: number; h: number }
  /** Whether it grows along its line, as auto width text and text that doesn't wrap do, or wraps at its width. */
  grows: boolean
  style: CSSProperties
}

/**
 * Edits a text layer in place, over the rendered text, then writes it to the state it was picked in. It opens with the
 * double-clicked word selected, or the whole text; follows the text every frame, so it moves and scales with the
 * camera; and wraps where the text wraps, at its own width. Escape and Enter keep the edit, as clicking away does,
 * except while an input method is composing, which uses those keys itself.
 */
export function TextEditor() {
  const session = useProject()
  const { selection, store } = session
  const editing = selection.getEditing()!
  const ref = useRef<HTMLTextAreaElement>(null)
  const [layout, setLayout] = useState<EditorLayout>()
  /** The text it opened on, and what it selects once it shows. */
  const opened = useRef<{ text: string; range: TextRange }>(undefined)
  const composing = useRef(false)
  const done = useRef(false)
  const [openedAt] = useState(() => performance.now())

  /** Records how the edit ended, as `text.edited` (PAR-640). */
  const record = (outcome: "committed" | "unchanged" | "cancelled", how?: TextEditEnd, length = 0) => {
    const edited: Attributes<"text.edited"> = {
      design: editing.design,
      layer: editing.node,
      outcome,
      durationMs: Math.round(performance.now() - openedAt),
      length
    }

    if (how) {
      edited.how = how
    }

    track("text.edited", edited)
  }

  // Closed without being committed, as when the layer goes or the editor can't find its text. Checked a tick after it
  // unmounts, since a development build mounts it twice. It's keyed by its layer, so the layer stays the one it opened on.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
      setTimeout(() => {
        if (!mounted.current && !done.current) {
          record("cancelled")
        }
      })
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Once per mount, for the layer it opened on.
  }, [])

  useEffect(() => {
    const textarea = ref.current
    const area = textarea?.closest<HTMLElement>(".canvas-area")
    const entry = store.getEntry(editing.design)
    // The text as the frame shows it: the state's and the variant's, or the param's default it's bound to.
    const shown = entry && textToEdit(entry.container, editing.state, editing.node, store.getLibrary(editing.design))

    const find = () => {
      const host = area && selectionFrame(area, editing.design, editing)

      const element =
        host && nodeInFrames(area, editing.design, editing.node, host).find((item) => item.picked)?.element

      return element && { host, element }
    }

    const found = find()

    if (!textarea || !area || !found || !shown) {
      selection.setEditing(undefined)

      return undefined
    }

    const { node, text } = shown
    const autoWidth = node.type === "text" && textSizing(node.style ?? {}) === "auto-width"
    const grows = autoWidth || noWrap(getComputedStyle(found.element))
    const offset = editing.at && drawnText(found.element) === text ? offsetAt(found.element, editing.at) : undefined
    opened.current = { text, range: openingSelection(text, offset) }
    textarea.value = text

    // The text itself is hidden while the editor draws it, and measured every frame, so the editor stays on it as the
    // camera pans and zooms, and as the layout around it moves.
    let hidden = hide(found.element)
    let { host } = found
    let last = ""
    let frame = 0

    const tick = () => {
      const now = find()
      const current = now?.element ?? hidden.element
      host = now?.host ?? host

      if (current !== hidden.element) {
        hidden.restore()
        hidden = hide(current)
      }

      const next = editorLayout(current, frameGeometry(host).element(current), areaSpace(area), grows, hidden.color)
      const serialized = JSON.stringify(next)

      if (serialized !== last) {
        last = serialized
        setLayout(next)
      }

      frame = requestAnimationFrame(tick)
    }

    tick()

    return () => {
      cancelAnimationFrame(frame)
      hidden.restore()
    }
  }, [editing, selection, store])

  const shown = layout !== undefined
  useEffect(() => {
    const textarea = ref.current
    const range = opened.current?.range

    if (!shown || !textarea || !range) {
      return
    }

    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(range.start, range.end)
  }, [shown])

  const commit = (how: TextEditEnd) => {
    if (done.current) {
      return
    }

    done.current = true
    const text = ref.current?.value ?? ""
    selection.setEditing(undefined)
    const original = opened.current?.text

    // Written to the state it was read from, by the same rule (see `textToEdit`).
    if (original === undefined || !store.getEntry(editing.design)) {
      return record("cancelled", how, text.length)
    }

    if (text === original) {
      return record("unchanged", how, text.length)
    }

    record("committed", how, text.length)
    // A text frame named after its text follows it (see `textFrameRenamed`), in the same step.
    store.updateContainer(editing.design, "Edit text", (container) =>
      textFrameRenamed(
        withEditedText(container, editing.state, editing.node, text, store.getLibrary(editing.design)),
        editing.node,
        original,
        text
      )
    )
  }

  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      rows={1}
      spellCheck={false}
      className="text-editor pointer-events-auto absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-2 outline-offset-2 field-sizing-content"
      style={
        layout
          ? {
              ...layout.style,
              left: layout.box.x,
              top: layout.box.y,
              ...(layout.grows ? { minWidth: layout.box.w } : { width: layout.box.w }),
              minHeight: layout.box.h,
              outlineColor: kindColors.text,
              outlineStyle: "solid"
            }
          : { display: "none" }
      }
      onBlur={() => commit("blur")}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onKeyDown={(event) => {
        event.stopPropagation()

        // An input method uses Enter and Escape itself while composing, to take or drop what's being composed.
        if (composing.current || event.nativeEvent.isComposing) {
          return
        }

        if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault()
          commit(event.key === "Escape" ? "escape" : "enter")
        }
      }}
    />
  )
}

/** Whether text in an element stays on one line, as a button's label usually does. */
function noWrap(style: CSSStyleDeclaration): boolean {
  return style.whiteSpace === "nowrap" || style.whiteSpace === "pre"
}

/** An element whose text is hidden, the color its text had, and how to show it again. */
interface HiddenText {
  element: HTMLElement
  color: string
  restore: () => void
}

/** Hides an element's text, keeping the color it had for the editor to draw in. */
function hide(element: HTMLElement): HiddenText {
  const color = getComputedStyle(element).color
  const previous = element.style.color
  element.style.color = "transparent"

  return { element, color, restore: () => (element.style.color = previous) }
}

/**
 * Where the editor goes over an element's text, measured as it's drawn now. Text that wraps is edited in its content
 * box, at its width; text that grows along its line is edited where its characters are, growing from there, up to a
 * maximum width if it has one.
 */
function editorLayout(
  element: HTMLElement,
  drawn: ElementGeometry,
  space: AreaSpace,
  grows: boolean,
  color: string
): EditorLayout {
  const computed = getComputedStyle(element)
  // The element's own scale: the camera's, the frame's and any transform the design gives it together.
  const { scale, border, padding } = drawn
  const text = space.box(grows ? (textBounds(element) ?? drawn.contentBox) : drawn.contentBox)
  const scaled = (value: string) => (value === "normal" ? "normal" : `${parseFloat(value) * scale}px`)

  const style: CSSProperties = {
    fontFamily: computed.fontFamily,
    fontSize: parseFloat(computed.fontSize) * scale,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    // The text's own letters, so a field's rules (no contextual alternates, a name's ss04) don't change them mid-edit.
    fontFeatureSettings: computed.fontFeatureSettings,
    fontVariantLigatures: computed.fontVariantLigatures,
    fontVariationSettings: computed.fontVariationSettings,
    // SAFETY: the browser computes only valid values for this property.
    fontKerning: computed.fontKerning as CSSProperties["fontKerning"],
    lineHeight: scaled(computed.lineHeight),
    letterSpacing: scaled(computed.letterSpacing),
    color,
    caretColor: color,
    // SAFETY: the browser computes only valid values for this property.
    textAlign: computed.textAlign as CSSProperties["textAlign"],
    // SAFETY: the browser computes only valid values for this property.
    textTransform: computed.textTransform as CSSProperties["textTransform"],
    textDecorationLine: computed.textDecorationLine,
    whiteSpace: noWrap(computed) ? "pre" : "pre-wrap",
    // SAFETY: the browser computes only valid values for this property.
    overflowWrap: computed.overflowWrap as CSSProperties["overflowWrap"],
    // SAFETY: the browser computes only valid values for this property.
    wordBreak: computed.wordBreak as CSSProperties["wordBreak"]
  }

  // A maximum width still wraps auto width text, as in Figma.
  if (grows && computed.maxWidth !== "none" && computed.maxWidth.endsWith("px")) {
    const borderBox = computed.boxSizing === "border-box"
    const sides = (border.left + border.right + padding.left + padding.right) * scale
    style.maxWidth = parseFloat(computed.maxWidth) * scale - (borderBox ? sides : 0)
  }

  return {
    box: { ...text, w: Math.max(text.w, grows ? 24 : 0) },
    grows,
    style
  }
}

/** The text an element draws, from its text nodes in order. */
function drawnText(element: Element): string {
  let text = ""

  for (const node of textNodes(element)) {
    text += node.data
  }

  return text
}

/** The box around the characters an element draws, leaving out icons beside them. */
function textBounds(element: Element): DOMRect | undefined {
  const range = document.createRange()
  let bounds: { left: number; top: number; right: number; bottom: number } | undefined

  for (const node of textNodes(element)) {
    range.selectNodeContents(node)
    const rect = range.getBoundingClientRect()

    if (rect.width === 0 && rect.height === 0) {
      continue
    }

    bounds = bounds
      ? {
          left: Math.min(bounds.left, rect.left),
          top: Math.min(bounds.top, rect.top),
          right: Math.max(bounds.right, rect.right),
          bottom: Math.max(bounds.bottom, rect.bottom)
        }
      : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  }

  return bounds && new DOMRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top)
}

/** Which character of an element's text is drawn under a point, counted across its text nodes. */
function offsetAt(element: Element, point: Point): number | undefined {
  const range = document.createRange()
  let before = 0

  for (const node of textNodes(element)) {
    for (let index = 0; index < node.length; index++) {
      range.setStart(node, index)
      range.setEnd(node, index + 1)

      for (const rect of range.getClientRects()) {
        if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
          return before + index
        }
      }
    }

    before += node.length
  }

  return undefined
}

function textNodes(element: Element): Text[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) {
      nodes.push(node)
    }
  }

  return nodes
}
