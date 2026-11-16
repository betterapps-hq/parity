import {
  openingSelection,
  type TextRange,
  textFrameRenamed,
  textSizing,
  textToEdit,
  withEditedText
} from "@parity-app/editor"
import { updateContainer } from "@parity-app/multiplayer"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import type { Attributes } from "../chrome/event-attributes.ts"
import type { Typing } from "../live-room.ts"
import { libraryOf } from "../project-doc.ts"
import { track } from "../report-error.ts"
import { useProject } from "./context.ts"
import { type AreaSpace, areaSpace, type ElementGeometry, frameGeometry } from "./frame-geometry.ts"
import { nodeInFrames, type Point, selectionFrame } from "./hit.ts"
import { LiveText } from "./live-text.ts"
import { scheduleOverlay } from "./overlay-scheduler.ts"
import { drawnText, textNodes } from "./text-caret.ts"

/** How far letters can reach past their line, above and below, in the text's own size. */
const glyphRoom = "0.3em"

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
 * Edits a text layer in place, over the rendered text, writing it to the state it was picked in as it's typed (see
 * `LiveText`), so others in a live room see it. It opens with the double-clicked word selected, or the whole text;
 * follows the text with the canvas's other overlays, so it moves and scales with the camera; and wraps where the text
 * wraps, at its own width. Escape and Enter close it, keeping the edit, as clicking away does, except while an input
 * method is composing, which uses those keys itself.
 */
export function TextEditor() {
  const session = useProject()
  const { selection, doc } = session
  const editing = selection.getEditing()!
  const ref = useRef<HTMLTextAreaElement>(null)
  const [layout, setLayout] = useState<EditorLayout>()
  /** The text it opened on, and what it selects once it shows. */
  const opened = useRef<{ text: string; range: TextRange }>(undefined)
  const composing = useRef(false)
  const done = useRef(false)
  /** Writes what's typed as it's typed, and takes in others' changes to the text. */
  const live = useRef<LiveText>(undefined)
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
    const design = doc.design(editing.design)
    // The text as the frame shows it: the state's and the variant's, or the param's default it's bound to.
    const shown = design && textToEdit(design, editing.state, editing.node, libraryOf(session, editing.design))

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
    // The text a frame named after its text was named for, which it follows (see `textFrameRenamed`).
    let namedFor = text

    const writer = new LiveText(text, {
      doc,
      read: () => {
        const now = doc.design(editing.design)

        return now && textToEdit(now, editing.state, editing.node, libraryOf(session, editing.design))?.text
      },
      write: (typed, gesture) =>
        updateContainer(
          doc,
          editing.design,
          "Edit text",
          (container) => {
            const edited = withEditedText(
              container,
              editing.state,
              editing.node,
              typed,
              libraryOf(session, editing.design)
            )

            const renamed = textFrameRenamed(edited, editing.node, namedFor, typed)

            if (renamed !== edited) {
              namedFor = typed
            }

            return renamed
          },
          { gesture }
        )
    })

    live.current = writer

    // Someone else changed the text, as in a live room: it's taken in, and the caret stays where it was among the
    // characters. Not while an input method is composing, which owns the text until it's done.
    const unsubscribe = doc.subscribe(() => {
      if (!composing.current) {
        takeIn(textarea, writer)
      }
    })

    // The text itself is hidden while the editor draws it, and measured whenever the canvas area's overlays are
    // (PAR-986, see `overlay-scheduler.ts`): in the frame the camera moves, and after anything that can move the text,
    // such as typing, the layout around it or a font loading, so the editor stays on it as the canvas pans and zooms.
    let hidden = hide(found.element)
    let { host } = found

    const stop = scheduleOverlay(area, session, {
      showing: () => true,
      designs: () => new Set([editing.design]),
      measure: () => {
        const now = find()
        const current = now?.element ?? hidden.element
        host = now?.host ?? host

        // The frame drew the text anew: the new element is hidden in place of the old. It's the one write a measure
        // makes, and only when the text is drawn again, which doesn't happen while the camera moves.
        if (current !== hidden.element) {
          hidden.restore()
          hidden = hide(current)
        }

        return editorLayout(current, frameGeometry(host).element(current), areaSpace(area), grows, hidden.color)
      },
      draw: setLayout
    })

    return () => {
      unsubscribe()
      stop()
      hidden.restore()
      // Closed some other way than `commit`, as when the layer goes: what's typed is kept.
      writer.close()
      session.room?.setTyping(undefined)
    }
  }, [editing, selection, doc, session])

  // Where this person is typing, for the others in a live room to draw in their color (see `RoomTyping`).
  const tellRoom = () => {
    const textarea = ref.current

    if (textarea && !done.current) {
      const forward = textarea.selectionDirection !== "backward"

      const typing: Typing = {
        design: editing.design,
        node: editing.node,
        anchor: forward ? textarea.selectionStart : textarea.selectionEnd,
        focus: forward ? textarea.selectionEnd : textarea.selectionStart
      }

      if (editing.state !== undefined) {
        typing.state = editing.state
      }

      session.room?.setTyping(typing)
    }
  }

  const shown = layout !== undefined
  useEffect(() => {
    const textarea = ref.current
    const range = opened.current?.range

    if (!shown || !textarea || !range) {
      return
    }

    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(range.start, range.end)
    tellRoom()
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Once it shows; `tellRoom` reads the textarea as it is.
  }, [shown])

  const commit = (how: TextEditEnd) => {
    if (done.current) {
      return
    }

    done.current = true
    const text = ref.current?.value ?? ""
    // What's typed and not yet written is written, to the state it was read from by the same rule (see `textToEdit`),
    // and the last pause's step ends.
    live.current?.close(text)
    session.room?.setTyping(undefined)
    selection.setEditing(undefined)
    const original = opened.current?.text

    if (original === undefined || !doc.design(editing.design)) {
      return record("cancelled", how, text.length)
    }

    record(text === original ? "unchanged" : "committed", how, text.length)
  }

  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      rows={1}
      spellCheck={false}
      className="text-editor pointer-events-auto absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none field-sizing-content"
      style={
        layout
          ? {
              ...layout.style,
              left: layout.box.x,
              // Room above and below the lines for letters taller than them, as a heading set solid has, which the
              // textarea would otherwise cut off and scroll to the caret; the text stays where the frame draws it.
              top: `calc(${layout.box.y}px - ${glyphRoom})`,
              paddingBlock: glyphRoom,
              ...(layout.grows ? { minWidth: layout.box.w } : { width: layout.box.w }),
              minHeight: `calc(${layout.box.h}px + 2 * ${glyphRoom})`
            }
          : { display: "none" }
      }
      onBlur={() => commit("blur")}
      // A caret moved by a key or a click, as well as a selection made, since `select` fires only for the latter.
      onSelect={tellRoom}
      onKeyUp={tellRoom}
      onMouseUp={tellRoom}
      onInput={(event) => {
        if (!composing.current) {
          live.current?.input(event.currentTarget.value)
          tellRoom()
        }
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        const writer = live.current

        if (writer) {
          writer.input(event.currentTarget.value)
          takeIn(event.currentTarget, writer)
        }
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

/** Takes the document's text into the editor if someone else changed it, keeping the caret among its characters. */
function takeIn(textarea: HTMLTextAreaElement, writer: LiveText): void {
  const { selectionStart, selectionEnd, selectionDirection } = textarea
  const rebased = writer.received(textarea.value, { start: selectionStart, end: selectionEnd })

  if (rebased && rebased.text !== textarea.value) {
    textarea.value = rebased.text
    textarea.setSelectionRange(rebased.selection.start, rebased.selection.end, selectionDirection)
  }
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
