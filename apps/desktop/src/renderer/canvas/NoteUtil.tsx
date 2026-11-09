import { useLayoutEffect, useRef } from "react"
import { HTMLContainer, Rectangle2d, type RecordProps, stopEventPropagation, T, useEditor, useValue } from "tldraw"
import { useNotes } from "../design-store.ts"
import { useProject } from "./context.ts"
import { focusOnMount } from "./kinds.tsx"
import { type CanvasRecord, CanvasUtil } from "./tldraw-names.ts"

declare module "tldraw" {
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- tldraw names the map this augments.
  export interface TLGlobalShapePropsMap {
    "canvas-note": { w: number; h: number; key: string }
  }
}

export type NoteRecord = CanvasRecord<"canvas-note">

/** Free text on the canvas, outside any design: labels, annotations, explanations of a flow. */
export class NoteUtil extends CanvasUtil<NoteRecord> {
  static override type = "canvas-note" as const
  static override props: RecordProps<NoteRecord> = { w: T.number, h: T.number, key: T.string }

  override getDefaultProps(): NoteRecord["props"] {
    return { w: 120, h: 40, key: "" }
  }

  override canResize() {
    return false
  }

  override hideResizeHandles() {
    return true
  }

  override hideRotateHandle() {
    return true
  }

  override canEdit() {
    return true
  }

  override getGeometry(note: NoteRecord) {
    return new Rectangle2d({ width: note.props.w, height: note.props.h, isFilled: true })
  }

  override component(note: NoteRecord) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", overflow: "visible" }}>
        <NoteContent note={note} />
      </HTMLContainer>
    )
  }

  override getIndicatorPath(note: NoteRecord) {
    const path = new Path2D()
    path.rect(0, 0, note.props.w, note.props.h)

    return path
  }
}

function NoteContent({ note }: { note: NoteRecord }) {
  const editor = useEditor()
  const { store } = useProject()
  const stored = useNotes(store).find((entry) => entry.key === note.props.key)?.note
  const editing = useValue("editing note", () => editor.getEditingShapeId() === note.id, [editor, note.id])
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) {
      return undefined
    }

    const observer = new ResizeObserver(() => {
      const current = editor.getShape(note.id)

      // A note tldraw has culled, or in a tab that isn't showing, isn't drawn and has no size to give.
      if (current?.type !== "canvas-note" || element.getClientRects().length === 0) {
        return
      }

      const w = Math.max(element.offsetWidth, 24)
      const h = Math.max(element.offsetHeight, 24)

      if (Math.abs(current.props.w - w) < 1 && Math.abs(current.props.h - h) < 1) {
        return
      }

      editor.run(() => editor.updateShape({ id: note.id, type: "canvas-note", props: { w, h } }), {
        history: "ignore"
      })
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [editor, note.id])

  const commit = (text: string) => {
    editor.setEditingShape(null)
    store.updateNote(note.props.key, text.trim() ? "Edit text" : "Delete text", (current) => {
      if (!text.trim()) {
        return undefined
      }

      return current.text === text ? current : { ...current, text }
    })
  }

  const style = { width: stored?.width, maxWidth: stored?.width ? undefined : 720 }

  // A note is people's own text, so it's the font's own regular rather than the interface's 450, and its editor keeps
  // the letters the note shows in rather than a field's (docs/typography.md).
  return (
    <div
      ref={ref}
      className="canvas-note w-max font-sans text-2xl leading-snug font-[400] text-foreground"
      style={style}
    >
      {editing ? (
        <textarea
          ref={focusOnMount}
          defaultValue={stored?.text ?? ""}
          rows={Math.max(1, (stored?.text ?? "").split("\n").length)}
          onPointerDown={stopEventPropagation}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation()

            if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
              event.currentTarget.blur()
            }
          }}
          onInput={(event) => {
            const area = event.currentTarget
            area.rows = Math.max(1, area.value.split("\n").length)
          }}
          className="pointer-events-auto block w-full min-w-48 resize-none bg-transparent [font-feature-settings:normal] outline-none field-sizing-content"
        />
      ) : (
        <p className="m-0 min-h-[1lh] min-w-12 whitespace-pre-wrap">{stored?.text}</p>
      )}
    </div>
  )
}
