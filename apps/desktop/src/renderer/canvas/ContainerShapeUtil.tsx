import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef } from "react"
import { HTMLContainer, Rectangle2d, type RecordProps, ShapeUtil, T, type TLShape, useEditor, useValue } from "tldraw"
import { moveDesigns } from "../chrome/arrange.ts"
import { useContainerEntry } from "../design-store.ts"
import { designsSelection, selectedDesigns } from "../selection.ts"
import { shapeIdFor } from "./CanvasEditor.tsx"
import { ContainerView } from "./ContainerView.tsx"
import { useProject } from "./context.ts"
import { clearSnaps, snapPosition } from "./snap.ts"
import { useTitleLayer } from "./title-layer.tsx"

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    "canvas-container": { w: number; h: number; key: string }
  }
}

export type ContainerShape = TLShape<"canvas-container">

/** While designs are dragged by their titles, the canvas moves them and the drop saves them, all at once. */
export const designDrag = { active: false }

/**
 * A design on the tldraw canvas. tldraw owns placement and the camera; the content is ordinary DOM, sized by the
 * browser, and the shape's bounds follow it.
 */
export class ContainerShapeUtil extends ShapeUtil<ContainerShape> {
  static override type = "canvas-container" as const
  static override props: RecordProps<ContainerShape> = { w: T.number, h: T.number, key: T.string }

  override getDefaultProps(): ContainerShape["props"] {
    return { w: 320, h: 200, key: "" }
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
    return false
  }

  override getGeometry(shape: ContainerShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  override component(shape: ContainerShape) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", overflow: "visible" }}>
        <ContainerContent shape={shape} />
      </HTMLContainer>
    )
  }

  override getIndicatorPath(shape: ContainerShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 20)
    return path
  }
}

function ContainerContent({ shape }: { shape: ContainerShape }) {
  const editor = useEditor()
  const session = useProject()
  const { store, selection } = session
  const entry = useContainerEntry(store, shape.props.key)
  const ref = useRef<HTMLDivElement>(null)
  const hovered = useValue("board hovered", () => editor.getHoveredShapeId() === shape.id, [editor, shape.id])
  // Moving a board doesn't draw it again, but its title, drawn in a layer above every board, has to follow.
  const x = useValue("board x", () => editor.getShape(shape.id)?.x ?? 0, [editor, shape.id])
  const y = useValue("board y", () => editor.getShape(shape.id)?.y ?? 0, [editor, shape.id])
  const titleLayer = useTitleLayer(editor)

  // Layout sizes are unaffected by the camera's scale, so they can be written straight to the shape.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new ResizeObserver(() => {
      const current = editor.getShape(shape.id)
      if (current?.type !== "canvas-container") return
      const w = element.offsetWidth
      const h = element.offsetHeight
      if (Math.abs(current.props.w - w) < 1 && Math.abs(current.props.h - h) < 1) return
      editor.run(() => editor.updateShape({ id: shape.id, type: "canvas-container", props: { w, h } }), {
        history: "ignore"
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [editor, shape.id])

  /**
   * Selects the design and drags it by its title, like a frame's name in Figma, along with every other selected
   * design. Shift adds it to the selection or takes it out. The move is one undo step, saved on release.
   */
  const dragByTitle = (event: ReactPointerEvent) => {
    event.stopPropagation()
    if (event.button !== 0) return
    const key = shape.props.key
    const current = selection.get()
    const group = selectedDesigns(current)
    if (event.shiftKey) {
      const next = group.includes(key) ? group.filter((candidate) => candidate !== key) : [...group, key]
      selection.set(designsSelection(next))
      return
    }
    const moving = group.includes(key) ? group : [key]
    if (!group.includes(key)) selection.set({ design: key })
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const start = editor.screenToPage({ x: event.clientX, y: event.clientY })
    const origins = new Map(
      moving.flatMap((candidate) => {
        const found = editor.getShape(shapeIdFor(candidate))
        return found ? [[candidate, { x: found.x, y: found.y }] as const] : []
      })
    )
    const origin = origins.get(key) ?? { x: shape.x, y: shape.y }
    const others = new Set(moving.map(shapeIdFor))
    let moved = false
    designDrag.active = true
    const move = (moveEvent: PointerEvent) => {
      const point = editor.screenToPage({ x: moveEvent.clientX, y: moveEvent.clientY })
      const free = { x: origin.x + point.x - start.x, y: origin.y + point.y - start.y }
      // It locks to the edges and centers of the designs around it; Ctrl or Cmd moves freely.
      const next = moveEvent.ctrlKey || moveEvent.metaKey ? free : snapPosition(editor, shape.id, free, others)
      if (moveEvent.ctrlKey || moveEvent.metaKey) clearSnaps(editor)
      const dx = next.x - origin.x
      const dy = next.y - origin.y
      moved ||= Math.abs(dx) >= 1 || Math.abs(dy) >= 1
      editor.run(
        () => {
          for (const [candidate, position] of origins) {
            editor.updateShape({
              id: shapeIdFor(candidate),
              type: "canvas-container",
              x: position.x + dx,
              y: position.y + dy
            })
          }
        },
        { history: "ignore" }
      )
    }
    const end = () => {
      clearSnaps(editor)
      designDrag.active = false
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
      if (!moved) return
      const positions = new Map(
        [...origins.keys()].flatMap((candidate) => {
          const found = editor.getShape(shapeIdFor(candidate))
          return found ? [[candidate, { x: found.x, y: found.y }] as const] : []
        })
      )
      moveDesigns(session, positions, positions.size === 1 ? "Move design" : `Move ${positions.size} designs`)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }

  if (!entry) {
    return (
      <div ref={ref} className="rounded-xl border bg-card p-5 text-sm text-destructive">
        Missing design {shape.props.key}
      </div>
    )
  }
  return (
    <ContainerView
      ref={ref}
      entry={entry}
      hovered={hovered}
      onTitlePointerDown={dragByTitle}
      title={titleLayer && { layer: titleLayer, x, y, width: shape.props.w }}
    />
  )
}
