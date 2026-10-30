import { boardTarget, layerOnBoard } from "@parity-app/core"
import { openingSelection, type TextRange, textSizing } from "@parity-app/editor"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { editingState } from "../chrome/LayerPanel.tsx"
import { useProject } from "./context.ts"
import { nodeInFrames, type Point, selectionFrame } from "./hit.ts"
import { kindColors } from "./kinds.tsx"
import { editLayer, findLayer } from "./layers.ts"
import { editableText } from "./pick.ts"

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

  useEffect(() => {
    const textarea = ref.current
    const area = textarea?.closest<HTMLElement>(".canvas-area")
    const entry = store.getEntry(editing.design)
    // The text as the frame shows it: the state's and the variant's, or the param's default it's bound to.
    const node =
      entry &&
      layerOnBoard(
        entry.container,
        editing.node,
        store.getLibrary(entry.key),
        editingState(entry.container, editing.state)
      )
    const find = () => {
      const host = area && selectionFrame(area, editing.design, editing)
      return host && nodeInFrames(area, editing.design, editing.node, host).find((item) => item.picked)?.element
    }
    const element = find()
    const text = node && editableText(node)
    if (!textarea || !area || !element || !node || text === undefined) {
      selection.setEditing(undefined)
      return undefined
    }
    const autoWidth = node.type === "text" && textSizing(node.style ?? {}) === "auto-width"
    const grows = autoWidth || noWrap(getComputedStyle(element))
    const offset = editing.at && drawnText(element) === text ? offsetAt(element, editing.at) : undefined
    opened.current = { text, range: openingSelection(text, offset) }
    textarea.value = text

    // The text itself is hidden while the editor draws it, and measured every frame, so the editor stays on it as the
    // camera pans and zooms, and as the layout around it moves.
    let hidden = hide(element)
    let last = ""
    let frame = 0
    const tick = () => {
      const current = find() ?? hidden.element
      if (current !== hidden.element) {
        hidden.restore()
        hidden = hide(current)
      }
      const next = editorLayout(current, area.getBoundingClientRect(), grows, hidden.color)
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
    if (!shown || !textarea || !range) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(range.start, range.end)
  }, [shown])

  const commit = () => {
    if (done.current) return
    done.current = true
    const text = ref.current?.value ?? ""
    selection.setEditing(undefined)
    const original = opened.current?.text
    if (original === undefined || text === original) return
    const entry = store.getEntry(editing.design)
    const node = entry && findLayer(store, entry.container, editing.node)
    if (!entry || !node) return
    const state = editing.state ?? entry.container.view?.state ?? entry.container.states[0]!.id
    const change = node.type === "text" ? { text } : { props: { children: text } }
    store.updateContainer(entry.key, "Edit text", (container) =>
      editLayer(store, container, boardTarget(container, state), editing.node, change)
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
              outlineColor: kindColors.layer,
              outlineStyle: "solid"
            }
          : { display: "none" }
      }
      onBlur={commit}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        // An input method uses Enter and Escape itself while composing, to take or drop what's being composed.
        if (composing.current || event.nativeEvent.isComposing) return
        if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault()
          commit()
        }
      }}
    />
  )
}

/** Whether text in an element stays on one line, as a button's label usually does. */
function noWrap(style: CSSStyleDeclaration): boolean {
  return style.whiteSpace === "nowrap" || style.whiteSpace === "pre"
}

/** Hides an element's text, keeping the color it had for the editor to draw in. */
function hide(element: HTMLElement): { element: HTMLElement; color: string; restore: () => void } {
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
function editorLayout(element: HTMLElement, area: DOMRect, grows: boolean, color: string): EditorLayout {
  const rect = element.getBoundingClientRect()
  const computed = getComputedStyle(element)
  // The element's own scale, the camera's and the frame's together.
  const scale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1
  const side = (name: string) => (parseFloat(computed.getPropertyValue(name)) || 0) * scale
  const inset = {
    left: side("border-left-width") + side("padding-left"),
    right: side("border-right-width") + side("padding-right"),
    top: side("border-top-width") + side("padding-top"),
    bottom: side("border-bottom-width") + side("padding-bottom")
  }
  const content = new DOMRect(
    rect.left + inset.left,
    rect.top + inset.top,
    Math.max(0, rect.width - inset.left - inset.right),
    Math.max(0, rect.height - inset.top - inset.bottom)
  )
  const text = grows ? (textBounds(element) ?? content) : content
  const scaled = (value: string) => (value === "normal" ? "normal" : `${parseFloat(value) * scale}px`)
  const style: CSSProperties = {
    fontFamily: computed.fontFamily,
    fontSize: parseFloat(computed.fontSize) * scale,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    lineHeight: scaled(computed.lineHeight),
    letterSpacing: scaled(computed.letterSpacing),
    color,
    caretColor: color,
    textAlign: computed.textAlign as CSSProperties["textAlign"],
    textTransform: computed.textTransform as CSSProperties["textTransform"],
    textDecorationLine: computed.textDecorationLine,
    whiteSpace: noWrap(computed) ? "pre" : "pre-wrap",
    overflowWrap: computed.overflowWrap as CSSProperties["overflowWrap"],
    wordBreak: computed.wordBreak as CSSProperties["wordBreak"]
  }
  // A maximum width still wraps auto width text, as in Figma.
  if (grows && computed.maxWidth !== "none" && computed.maxWidth.endsWith("px")) {
    const borderBox = computed.boxSizing === "border-box"
    style.maxWidth = parseFloat(computed.maxWidth) * scale - (borderBox ? inset.left + inset.right : 0)
  }
  return {
    box: {
      x: text.left - area.left,
      y: text.top - area.top,
      w: Math.max(text.width, grows ? 24 : 0),
      h: text.height
    },
    grows,
    style
  }
}

/** The text an element draws, from its text nodes in order. */
function drawnText(element: Element): string {
  let text = ""
  for (const node of textNodes(element)) text += node.data
  return text
}

/** The box around the characters an element draws, leaving out icons beside them. */
function textBounds(element: Element): DOMRect | undefined {
  const range = document.createRange()
  let bounds: { left: number; top: number; right: number; bottom: number } | undefined
  for (const node of textNodes(element)) {
    range.selectNodeContents(node)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
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
    if (node instanceof Text) nodes.push(node)
  }
  return nodes
}
