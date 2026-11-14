import { boardLayoutAt } from "@parity-app/core"
import { designsSelection, selectedDesigns, snaps } from "@parity-app/editor"
import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  type Atom,
  atom,
  Box,
  computed,
  type Editor,
  HTMLContainer,
  Rectangle2d,
  type RecordProps,
  react,
  T,
  unsafe__withoutCapture,
  useEditor,
  useValue
} from "tldraw"
import { moveDesigns } from "../chrome/arrange.ts"
import { useContainerEntry } from "../design-store.ts"
import { getEffectivePreferences } from "../project-settings.ts"
import { isRestingFar, isTabHidden, isZoomSettled, canvasIdFor } from "./CanvasEditor.tsx"
import { ContainerView } from "./ContainerView.tsx"
import { useProject } from "./context.ts"
import { type BoardRest, boardDormant } from "./frame-sleep.ts"
import { setBoardSized } from "./free-space.ts"
import { followPress, gestures } from "./gesture.ts"
import { measureTogether } from "./measure-together.ts"
import { clearSnaps, snapPosition } from "./snap.ts"
import { useTitleLayer } from "./title-layer.tsx"
import { type CanvasRecord, CanvasUtil } from "./tldraw-names.ts"

declare module "tldraw" {
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- tldraw names the map this augments.
  export interface TLGlobalShapePropsMap {
    "canvas-container": { w: number; h: number; key: string }
  }
}

export type ContainerRecord = CanvasRecord<"canvas-container">

/** While designs are dragged by their titles, the canvas moves them and the drop saves them, all at once. */
export const designDrag = { active: false }

/**
 * A design on the tldraw canvas. tldraw owns placement and the camera; the content is ordinary DOM, sized by the
 * browser, and the shape's bounds follow it.
 */
export class ContainerUtil extends CanvasUtil<ContainerRecord> {
  static override type = "canvas-container" as const
  static override props: RecordProps<ContainerRecord> = { w: T.number, h: T.number, key: T.string }

  override getDefaultProps(): ContainerRecord["props"] {
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

  /**
   * tldraw culls a shape out of view with display: none, which throws its layout away: every frame inside it laid out
   * again when it came back, and the board and its components' resize observers saw it shrink to nothing. Boards out
   * of view skip drawing their frames instead (see ContainerContent), keeping their layout.
   */
  override canCull() {
    return false
  }

  override getGeometry(container: ContainerRecord) {
    return new Rectangle2d({ width: container.props.w, height: container.props.h, isFilled: true })
  }

  override component(container: ContainerRecord) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", overflow: "visible" }}>
        <ContainerContent container={container} />
      </HTMLContainer>
    )
  }

  /**
   * The board's outline, round its corners, which follow the zoom as its gutter does. A frame has no board, so its
   * outline is square, as the frame is.
   */
  override getIndicatorPath(container: ContainerRecord) {
    const path = new Path2D()
    const radius = frameContainers.has(container.id) ? 0 : boardLayoutAt(this.editor.getZoomLevel()).radius
    path.roundRect(0, 0, container.props.w, container.props.h, radius)

    return path
  }
}

/** The shapes that draw frames, the kind with no board, for their square outlines. */
const frameContainers = new Set<string>()

/** Each canvas's boards' measures, run together (see `measureTogether`), their sizes written as one change. */
const boardMeasures = new WeakMap<Editor, ReturnType<typeof measureTogether>>()

function boardSizes(editor: Editor): ReturnType<typeof measureTogether> {
  let measures = boardMeasures.get(editor)

  if (!measures) {
    measures = measureTogether((writes) => editor.run(writes, { history: "ignore" }))
    boardMeasures.set(editor, measures)
  }

  return measures
}

function ContainerContent({ container }: { container: ContainerRecord }) {
  const editor = useEditor()
  const session = useProject()
  const { store, selection } = session
  const entry = useContainerEntry(store, container.props.key)
  const ref = useRef<HTMLDivElement>(null)
  const hovered = useValue("board hovered", () => editor.getHoveredShapeId() === container.id, [editor, container.id])
  // Moving a board doesn't draw it again, but its title, drawn in a layer above every board, has to follow.
  const x = useValue("board x", () => editor.getShape(container.id)?.x ?? 0, [editor, container.id])
  const y = useValue("board y", () => editor.getShape(container.id)?.y ?? 0, [editor, container.id])
  const titleLayer = useTitleLayer(editor)

  // Everything else on the page, for its title to run up to zoomed out. Read as the zoom is, so the title follows when
  // something beside it moves, and only it.
  const others = useMemo(() => {
    const boxes = computed("board's neighbours", () =>
      editor
        .getCurrentPageShapes()
        .flatMap((other) => (other.id === container.id ? [] : (editor.getShapePageBounds(other) ?? [])))
    )

    return () => boxes.get()
  }, [editor, container.id])

  const frame = entry?.container.kind === "frame"
  useLayoutEffect(() => {
    if (!frame) {
      return undefined
    }

    frameContainers.add(container.id)

    return () => void frameContainers.delete(container.id)
  }, [frame, container.id])

  const [drawn, setDrawn] = useState(false)

  // Its frames sleep zoomed far out, except on the selected board, and in a tab hidden a while once they've been drawn;
  // they wake near the view (see frame-sleep.ts).
  const rest = useMemo<BoardRest & { near: Atom<boolean> }>(
    () => ({
      near: atom("board near", true),
      dormant: computed("board dormant", () =>
        boardDormant({
          hidden: isTabHidden(editor),
          drawn,
          far: isRestingFar(editor),
          selected: editor.getSelectedShapeIds().includes(container.id)
        })
      )
    }),
    [editor, container.id, drawn]
  )

  // Layout sizes are unaffected by the camera's scale, so they can be written straight to the shape. A board that isn't
  // drawn at all, in a tab that isn't showing, has no size to give, rather than a size of nothing. Once it has given
  // one, it says so, for a pasted design brought into view at its real size. Its gutter follows the zoom (PAR-602), so
  // a board changes size as the camera zooms; the shape takes its new size once the zoom settles, rather than every
  // board measuring itself and drawing again on every frame of a zoom. tldraw's camera state isn't enough: on a busy
  // machine, frames slower than its timeout had the camera stop on almost every frame (PAR-655).
  // Boards measure together, so the canvas's boards are laid out once rather than once each (PAR-726).
  useLayoutEffect(() => {
    const element = ref.current

    if (!element) {
      return undefined
    }

    const size = {
      read: () =>
        element.getClientRects().length === 0 ? undefined : { w: element.offsetWidth, h: element.offsetHeight },
      write: ({ w, h }: { w: number; h: number }) => {
        const current = editor.getShape(container.id)

        if (current?.type !== "canvas-container") {
          return
        }

        setDrawn(true)

        if (Math.abs(current.props.w - w) >= 1 || Math.abs(current.props.h - h) >= 1) {
          editor.updateShape({ id: container.id, type: "canvas-container", props: { w, h } })
        }

        setBoardSized(editor, container.id, true)
      }
    }

    let cancel: (() => void) | undefined

    const measure = () => {
      cancel = boardSizes(editor)(element, size)
    }

    const observer = new ResizeObserver(() => {
      if (isZoomSettled(editor)) {
        measure()
      }
    })

    observer.observe(element)

    const stop = react("board size once the zoom settles", () => {
      if (isZoomSettled(editor)) {
        unsafe__withoutCapture(measure)
      }
    })

    return () => {
      stop()
      observer.disconnect()
      cancel?.()
      setBoardSized(editor, container.id, false)
    }
  }, [editor, container.id])

  // Out of view, with a margin so frames are drawn before they scroll in, a board skips drawing its frames. Only once
  // they've been drawn, so they have a size to keep; and never the selected board, which outlines and panels measure,
  // so it's also drawn live when zoomed far enough out for the others to show bitmaps.
  const present = !!entry
  useLayoutEffect(() => {
    const element = ref.current

    if (!element || !drawn) {
      return undefined
    }

    const stop = react("board out of view", () => {
      const bounds = editor.getShapePageBounds(container.id)
      const viewport = editor.getViewportPageBounds()
      const near = Box.ExpandBy(viewport, Math.max(viewport.w, viewport.h) / 4)
      const selected = editor.getSelectedShapeIds().includes(container.id)
      const away = !!bounds && !Box.Collides(near, bounds) && !selected

      if (element.hasAttribute("data-away") !== away) {
        element.toggleAttribute("data-away", away)
      }

      if (element.hasAttribute("data-live") !== selected) {
        element.toggleAttribute("data-live", selected)
      }

      rest.near.set(!away)
    })

    return () => {
      stop()
      element.removeAttribute("data-away")
      element.removeAttribute("data-live")
    }
  }, [editor, container.id, drawn, present, rest])

  /**
   * Selects the design and drags it by its title, like a frame's name in Figma, along with every other selected
   * design. Shift adds it to the selection or takes it out. The move is one undo step, saved when the drag ends; Escape
   * puts the designs back where they were and saves nothing (see `gestures.titleDrag`).
   */
  const dragByTitle = (event: ReactPointerEvent<HTMLElement>) => {
    // A locked design's title is left to the canvas, as its board is: it's selected and moved only from Layers.
    if (session.store.getEntry(container.props.key)?.container.locked) {
      return
    }

    event.stopPropagation()

    if (event.button !== 0) {
      return
    }

    const key = container.props.key
    const current = selection.get()

    const group = selectedDesigns(current).filter(
      (candidate) => candidate === key || !session.store.getEntry(candidate)?.container.locked
    )

    if (event.shiftKey) {
      const next = group.includes(key) ? group.filter((candidate) => candidate !== key) : [...group, key]
      selection.set(designsSelection(next))

      return
    }

    const moving = group.includes(key) ? group : [key]

    if (!group.includes(key)) {
      selection.set({ design: key })
    }

    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const start = editor.screenToPage({ x: event.clientX, y: event.clientY })

    const origins = new Map(
      moving.flatMap((candidate) => {
        const found = editor.getShape(canvasIdFor(candidate))

        return found ? [[candidate, { x: found.x, y: found.y }] as const] : []
      })
    )

    const origin = origins.get(key) ?? { x: container.x, y: container.y }
    const others = new Set(moving.map(canvasIdFor))

    const place = (dx: number, dy: number) =>
      editor.run(
        () => {
          for (const [candidate, position] of origins) {
            editor.updateShape({
              id: canvasIdFor(candidate),
              type: "canvas-container",
              x: position.x + dx,
              y: position.y + dy
            })
          }
        },
        { history: "ignore" }
      )

    followPress(gestures.titleDrag, session.store, event, {
      moves: { designs: moving },
      cursor: "grabbing",
      start() {
        designDrag.active = true
        // The title has the pointer captured, so it's given the cursor too, besides the layer over the window.
        target.style.cursor = "grabbing"
      },
      move(moveEvent) {
        const point = editor.screenToPage({ x: moveEvent.clientX, y: moveEvent.clientY })
        const free = { x: origin.x + point.x - start.x, y: origin.y + point.y - start.y }
        // It locks to the edges and centers of the designs around it; Ctrl or Cmd moves freely.
        const snapping = snaps(moveEvent, getEffectivePreferences(session.store).snapping)
        const next = snapping ? snapPosition(editor, container.id, free, others) : free

        if (!snapping) {
          clearSnaps(editor)
        }

        place(next.x - origin.x, next.y - origin.y)
      },
      end(kept) {
        clearSnaps(editor)
        target.style.cursor = ""

        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId)
        }

        // Put back while the canvas still knows the move is the title's, so it isn't saved.
        if (!kept) {
          place(0, 0)
        }

        designDrag.active = false

        if (!kept) {
          return
        }

        const positions = new Map(
          [...origins.keys()].flatMap((candidate) => {
            const found = editor.getShape(canvasIdFor(candidate))

            return found ? [[candidate, { x: found.x, y: found.y }] as const] : []
          })
        )

        moveDesigns(session.store, positions, `Move ${session.store.designsLabel(positions.keys())}`)
      }
    })
  }

  if (!entry) {
    return (
      <div ref={ref} className="rounded-xl border bg-card p-5 text-sm text-destructive">
        Nothing called {container.props.key} in the project
      </div>
    )
  }

  return (
    <ContainerView
      ref={ref}
      entry={entry}
      hovered={hovered}
      onTitlePointerDown={dragByTitle}
      title={titleLayer && { layer: titleLayer, x, y, width: container.props.w, height: container.props.h, others }}
      rest={rest}
    />
  )
}
