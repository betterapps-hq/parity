import { useCallback, useEffect } from "react"
import {
  atom,
  createShapeId,
  type Editor,
  react,
  SelectionForegroundOverlayUtil,
  type TLComponents,
  Tldraw,
  type TLShapeId
} from "tldraw"
import { heldBoards } from "../agent/held-boards.ts"
import { designsSelection, selectedDesigns } from "../selection.ts"
import { getResolvedTheme, useResolvedTheme } from "../theme.ts"
import { ContainerShapeUtil, designDrag } from "./ContainerShapeUtil.tsx"
import { useProject } from "./context.ts"
import { bitmapScale } from "./frame-bitmaps.ts"
import { designColor, kindColors } from "./kinds.tsx"
import { NoteShapeUtil } from "./NoteShapeUtil.tsx"
import { TitleLayer } from "./title-layer.tsx"
import { withoutTldrawShortcuts } from "./tldraw-shortcuts.ts"

const shapeUtils = [ContainerShapeUtil, NoteShapeUtil]

export function shapeIdFor(key: string): TLShapeId {
  return createShapeId(encodeURIComponent(key))
}

/**
 * The infinite canvas. tldraw supplies the camera, dragging and snapping with its own UI hidden; the editor chrome is
 * ours. The design store is the source of truth: tldraw shapes are a projection of it, and the selection store says
 * what's selected.
 */
/**
 * tldraw's own context menu acts on tldraw shapes (copy as SVG, paste); designs have their own menus instead. Design
 * titles draw in a layer of their own, above every board.
 */
const components: TLComponents = { ContextMenu: null, OnTheCanvas: TitleLayer }

/**
 * tldraw's selection box is a square around the shape, drawn over a design's own rounded outline, so it only shows
 * around several designs at once.
 */
class SelectionBox extends SelectionForegroundOverlayUtil {
  static override type = SelectionForegroundOverlayUtil.type

  override isActive(): boolean {
    return super.isActive() && this.editor.getSelectedShapeIds().length > 1
  }
}

const overlayUtils = [SelectionBox]

/**
 * tldraw draws outlines and handles on a canvas, in its theme's colors. Setting a custom property on the canvas
 * instead changed none of them, yet restyled every element of every frame each time the color did.
 */
function setSelectionColor(editor: Editor, color: string): void {
  const value = drawableColor(color)
  const theme = editor.getCurrentTheme()
  const { light, dark } = theme.colors
  if (light.selectionStroke === value && dark.selectionStroke === value) return
  editor.updateTheme({
    ...theme,
    colors: { ...theme.colors, light: { ...light, selectionStroke: value }, dark: { ...dark, selectionStroke: value } }
  })
}

const drawable = new Map<string, string>()

/** A color a canvas can draw with: the kinds' colors are custom properties, which only CSS resolves. */
function drawableColor(color: string): string {
  let value = drawable.get(color)
  if (value === undefined) {
    const property = /^var\((--[\w-]+)\)$/.exec(color)?.[1]
    value = (property && getComputedStyle(document.documentElement).getPropertyValue(property).trim()) || color
    drawable.set(color, value)
  }
  return value
}

/**
 * Makes the zoom tldraw writes to the page's styles (as `--tl-zoom`) change only once the camera has been still for a
 * few frames and a moment. Every element of every frame inherits it, so each change restyles them all: at 60 designs
 * that was most of each frame while zooming. tldraw's own debounce only holds while frames are quick, since a slow frame
 * outlasts its timeout and counts as the camera stopping. What has to follow the zoom live uses `useZoomStyle`.
 */
function settleZoom(editor: Editor): () => void {
  const settled = atom("settled zoom", editor.getZoomLevel())
  let last = { zoom: editor.getZoomLevel(), at: performance.now() }
  let still = 0
  let frame = 0
  const check = (now: number) => {
    const zoom = editor.getZoomLevel()
    if (zoom !== last.zoom) {
      last = { zoom, at: now }
      still = 0
    } else still++
    if (still >= 3 && now - last.at >= 150) {
      settled.set(zoom)
      frame = 0
    } else frame = requestAnimationFrame(check)
  }
  const stop = react("settle zoom", () => {
    editor.getZoomLevel()
    frame ||= requestAnimationFrame(check)
  })
  editor.getEfficientZoomLevel = () => settled.get()
  return () => {
    stop()
    cancelAnimationFrame(frame)
  }
}

/**
 * Marks the canvas while it's zoomed far out: `data-far` once frames are drawn no larger than their bitmaps, so boards
 * show those instead (see frame-bitmaps.ts), and `data-tiny` below about 5%, where boards and frames drop their
 * shadows. Each mark lasts a little past its line zooming back in, so a camera resting near one doesn't flip.
 */
function markZoomedOut(editor: Editor): () => void {
  const area = editor.getContainer().closest(".canvas-area")
  if (!area) return () => undefined
  const marks = [
    ["data-far", bitmapScale],
    ["data-tiny", 0.05]
  ] as const
  const stop = react("zoomed out", () => {
    const drawn = editor.getZoomLevel() * window.devicePixelRatio
    for (const [mark, line] of marks) {
      const on = drawn <= (area.hasAttribute(mark) ? line * 1.15 : line)
      if (area.hasAttribute(mark) !== on) area.toggleAttribute(mark, on)
    }
  })
  return () => {
    stop()
    for (const [mark] of marks) area.removeAttribute(mark)
  }
}

export function CanvasEditor({ onEditor }: { onEditor(editor: Editor | undefined): void }) {
  const { id: tab, store, selection, editor } = useProject()
  const theme = useResolvedTheme()

  // The canvas follows the app's theme; designs keep the theme their mode picks.
  useEffect(() => {
    editor?.user.updateUserPreferences({ colorScheme: theme })
  }, [editor, theme])

  const handleMount = useCallback(
    (editor: Editor) => {
      // Snapping on by default, as in Figma: dragged designs lock to the edges and centers of the ones around them.
      editor.user.updateUserPreferences({ colorScheme: getResolvedTheme(), isSnapMode: true })
      // Out to 1%, past tldraw's 5%, so a project with dozens of screens fits in view at once.
      editor.setCameraOptions({ zoomSteps: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8] })
      const stopZoom = settleZoom(editor)
      const stopZoomedOut = markZoomedOut(editor)

      // Designs and notes come and go with undo and agents, so shapes follow the store rather than being made once.
      const sync = () => {
        const wanted = new Map<
          TLShapeId,
          { type: "canvas-container" | "canvas-note"; key: string; x: number; y: number }
        >()
        for (const { key, container } of store.getEntries()) {
          // A board an agent moved stays where it was until the agent's cursor drags it over.
          const at = heldBoards.at(tab, key) ?? container.position
          wanted.set(shapeIdFor(key), { type: "canvas-container", key, ...at })
        }
        for (const { key, note } of store.getNotes())
          wanted.set(shapeIdFor(key), { type: "canvas-note", key, ...note.position })
        editor.run(
          () => {
            const stale = editor.getCurrentPageShapes().filter((shape) => !wanted.has(shape.id))
            if (stale.length > 0) editor.deleteShapes(stale.map((shape) => shape.id))
            for (const [id, { type, key, x, y }] of wanted) {
              const shape = editor.getShape(id)
              if (!shape) editor.createShape({ id, type, x, y, props: { key } })
              else if (Math.abs(shape.x - x) >= 1 || Math.abs(shape.y - y) >= 1) {
                editor.updateShape({ id, type: shape.type, x, y })
              }
            }
          },
          { history: "ignore" }
        )
      }
      sync()
      const stopStore = store.subscribe(sync)
      const stopHeld = heldBoards.subscribe(sync)

      const stopMoves = editor.sideEffects.registerAfterChangeHandler("shape", (previous, next, source) => {
        if (source !== "user" || designDrag.active || (previous.x === next.x && previous.y === next.y)) return
        if (next.type === "canvas-container" && !heldBoards.at(tab, next.props.key)) {
          store.setPosition(next.props.key, { x: next.x, y: next.y })
        }
        if (next.type === "canvas-note") {
          const position = { x: Math.round(next.x), y: Math.round(next.y) }
          store.updateNote(next.props.key, "Move text", (note) => ({ ...note, position }), {
            group: `move:${next.props.key}`
          })
        }
      })

      // tldraw's selection and ours stay in step, whichever side changes.
      const stopSelection = editor.sideEffects.registerAfterChangeHandler("instance_page_state", (previous, next) => {
        if (previous.selectedShapeIds === next.selectedShapeIds) return
        const ids = next.selectedShapeIds
        const shape = ids.length === 1 ? editor.getShape(ids[0]!) : undefined
        const current = selection.get()
        // Shift-click and dragging a box on the canvas select several designs at once.
        const designs = ids.flatMap((id) => {
          const candidate = editor.getShape(id)
          return candidate?.type === "canvas-container" ? [candidate.props.key] : []
        })
        if (designs.length > 1) {
          const wanted = designsSelection(designs)
          if (current.node || current.note || (current.designs ?? []).join() !== wanted.designs!.join()) {
            selection.set(wanted)
          }
        } else if (shape?.type === "canvas-container") {
          if (current.design !== shape.props.key || current.note) selection.set({ design: shape.props.key })
        } else if (shape?.type === "canvas-note") {
          if (current.note !== shape.props.key) selection.set({ note: shape.props.key })
        } else if (ids.length === 0 && (current.design || current.note)) selection.set({})
      })
      const followSelection = () => {
        const current = selection.get()
        const keys = current.note
          ? [current.note]
          : current.design && (current.node || current.mode)
            ? [current.design]
            : selectedDesigns(current)
        const wanted = keys.map(shapeIdFor).filter((id) => editor.getShape(id))
        const ids = editor.getSelectedShapeIds()
        if (ids.length !== wanted.length || ids.some((id, index) => id !== wanted[index])) {
          editor.setSelectedShapes(wanted)
        }
        // Each kind of thing has its own selection color.
        const entry = current.design ? store.getEntry(current.design) : undefined
        const color = current.node
          ? kindColors.layer
          : current.mode
            ? kindColors.mode
            : entry
              ? designColor(entry.container.kind)
              : kindColors.screen
        setSelectionColor(editor, color)
      }
      const stopFollowing = selection.subscribe(followSelection)
      followSelection()

      // Containers size themselves after their content renders, so fit once they have.
      const fit = setTimeout(() => editor.zoomToFit({ animation: { duration: 200 } }), 400)
      onEditor(editor)
      return () => {
        clearTimeout(fit)
        stopZoom()
        stopZoomedOut()
        stopStore()
        stopHeld()
        stopMoves()
        stopSelection()
        stopFollowing()
        onEditor(undefined)
      }
    },
    [tab, store, selection, onEditor]
  )

  return (
    <Tldraw
      hideUi
      licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
      shapeUtils={shapeUtils}
      overlayUtils={overlayUtils}
      components={components}
      overrides={withoutTldrawShortcuts}
      onMount={handleMount}
    />
  )
}
