import { useLayoutEffect, useRef } from "react"
import {
  HTMLContainer,
  Rectangle2d,
  type RecordProps,
  ShapeUtil,
  stopEventPropagation,
  T,
  type TLShape,
  useEditor,
  useValue
} from "tldraw"
import { useNotes } from "../design-store.ts"
import { useProject } from "./context.ts"
import { focusOnMount } from "./kinds.tsx"

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    "canvas-note": { w: number; h: number; key: string }
  }
}

export type NoteShape = TLShape<"canvas-note">

/** Free text on the canvas, outside any design: labels, annotations, explanations of a flow. */
export class NoteShapeUtil extends ShapeUtil<NoteShape> {
  static override type = "canvas-note" as const
  static override props: RecordProps<NoteShape> = { w: T.number, h: T.number, key: T.string }

  override getDefaultProps(): NoteShape["props"] {
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

  override getGeometry(shape: NoteShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  override component(shape: NoteShape) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", overflow: "visible" }}>
        <NoteContent shape={shape} />
      </HTMLContainer>
    )
  }

  override getIndicatorPath(shape: NoteShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }
}

function NoteContent({ shape }: { shape: NoteShape }) {
  const editor = useEditor()
  const { store } = useProject()
  const note = useNotes(store).find((entry) => entry.key === shape.props.key)?.note
  const editing = useValue("editing note", () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new ResizeObserver(() => {
      const current = editor.getShape(shape.id)
      if (current?.type !== "canvas-note") return
      const w = Math.max(element.offsetWidth, 24)
      const h = Math.max(element.offsetHeight, 24)
      if (Math.abs(current.props.w - w) < 1 && Math.abs(current.props.h - h) < 1) return
      editor.run(() => editor.updateShape({ id: shape.id, type: "canvas-note", props: { w, h } }), {
        history: "ignore"
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [editor, shape.id])

  const commit = (text: string) => {
    editor.setEditingShape(null)
    store.updateNote(shape.props.key, text.trim() ? "Edit text" : "Delete text", (current) =>
      text.trim() ? (current.text === text ? current : { ...current, text }) : undefined
    )
  }

  const style = { width: note?.width, maxWidth: note?.width ? undefined : 720 }
  return (
    <div ref={ref} className="canvas-note w-max font-sans text-2xl leading-snug text-foreground" style={style}>
      {editing ? (
        <textarea
          ref={focusOnMount}
          defaultValue={note?.text ?? ""}
          rows={Math.max(1, (note?.text ?? "").split("\n").length)}
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
          className="pointer-events-auto block w-full min-w-48 resize-none bg-transparent outline-none field-sizing-content"
        />
      ) : (
        <p className="m-0 min-h-[1lh] min-w-12 whitespace-pre-wrap">{note?.text}</p>
      )}
    </div>
  )
}
