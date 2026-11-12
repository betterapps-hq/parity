import {
  designsSelection,
  holdZoom,
  referenceSize,
  selectedDesigns,
  zoomHeldFrom,
  zoomSettled
} from "@parity-app/editor"
import { useCallback, useEffect } from "react"
import {
  type Atom,
  atom,
  type Computed,
  computed,
  type Editor,
  react,
  SelectionForegroundOverlayUtil,
  type TLComponents,
  Tldraw
} from "tldraw"
import { heldBoards } from "../agent/held-boards.ts"
import { holdWhileZooming } from "../replay.ts"
import { getResolvedTheme, useResolvedTheme } from "../theme.ts"
import { ContainerUtil, designDrag } from "./ContainerUtil.tsx"
import { useProject } from "./context.ts"
import { bitmapScale } from "./frame-bitmaps.ts"
import { hiddenSleepMs } from "./frame-sleep.ts"
import { CameraGestures, countFrames, type GestureEnded, recordGesture } from "./gesture.ts"
import { designColor, kindColors } from "./kinds.tsx"
import { redrawLayer } from "./layer-redraw.ts"
import { NoteUtil } from "./NoteUtil.tsx"
import { sizeWhileShown } from "./overlay-canvas.ts"
import { ReferenceUtil } from "./ReferenceUtil.tsx"
import { recordRestedFar } from "./rested-far.ts"
import { TitleLayer } from "./title-layer.tsx"
import { withoutPatternFills } from "./tldraw-fills.ts"
import { type CanvasId, createCanvasId, IndicatorOverlayUtil } from "./tldraw-names.ts"
import { withoutTldrawShortcuts } from "./tldraw-shortcuts.ts"

const canvasUtils = [ContainerUtil, NoteUtil, ReferenceUtil, ...withoutPatternFills]

/** The kinds of things the store holds that tldraw draws, each as a shape following its entry. */
type ProjectedType = "canvas-container" | "canvas-note" | "canvas-reference"

/** A shape as the store wants it: where it is, and for a reference its size and link. */
interface Projected {
  type: ProjectedType
  key: string
  x: number
  y: number
  locked?: boolean
  size?: { w: number; h: number }
  link?: string
}

export function canvasIdFor(key: string): CanvasId {
  return createCanvasId(encodeURIComponent(key))
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

/** Whether the canvas is hovering a layer inside a design, by editor (see `HoverOutlines`). */
const hoveringLayer = new WeakMap<Editor, Atom<boolean>>()

/**
 * Hovering outlines only what a click would select. With the pointer on a layer inside a design, a click selects that
 * layer, which the canvas's overlay outlines, so tldraw doesn't outline the board around it as hovered. Over the board's
 * background, or a frame's, it does.
 */
class HoverOutlines extends IndicatorOverlayUtil {
  static override type = IndicatorOverlayUtil.type

  override getOverlays() {
    const overlays = super.getOverlays()
    const hovered = this.editor.getHoveredShapeId()

    if (!hovered || !hoveringLayer.get(this.editor)?.get() || this.editor.getSelectedShapeIds().includes(hovered)) {
      return overlays
    }

    return overlays.flatMap((overlay) => {
      const idsToDisplay = overlay.props.idsToDisplay.filter((id) => id !== hovered)

      return idsToDisplay.length > 0 || overlay.props.hintingShapeIds.length > 0
        ? [{ ...overlay, props: { ...overlay.props, idsToDisplay } }]
        : []
    })
  }
}

const overlayUtils = [SelectionBox, HoverOutlines]

/**
 * tldraw draws outlines and handles on a canvas, in its theme's colors. Setting a custom property on the canvas
 * instead changed none of them, yet restyled every element of every frame each time the color did.
 */
function setSelectionColor(editor: Editor, color: string): void {
  const value = drawableColor(color)
  const theme = editor.getCurrentTheme()
  const { light, dark } = theme.colors

  if (light.selectionStroke === value && dark.selectionStroke === value) {
    return
  }

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
 * Makes the zoom tldraw writes to the page's styles (as `--tl-zoom`) change only once the zoom has settled (see
 * `zoomSettle`). Every element of every frame inherits it, so each change restyles them all: at 60 designs that was most
 * of each frame while zooming. tldraw's own debounce only holds while frames are quick, since a slow frame outlasts its
 * timeout and counts as the camera stopping. What has to follow the zoom live uses `useZoomStyle`. A zoom that settles
 * somewhere new also draws the camera's layer again, sharp at that zoom (see layer-redraw.ts). Session Replay doesn't
 * record the page while the zoom is on its way (see `holdWhileZooming`).
 */
function settleZoom(editor: Editor): () => void {
  const settled = atom("settled zoom", editor.getZoomLevel())
  let held = zoomHeldFrom(editor.getZoomLevel(), performance.now())
  let frame = 0
  let endRedraw: (() => void) | undefined
  const recording = holdWhileZooming()

  const check = (now: number) => {
    const zoom = editor.getZoomLevel()
    held = holdZoom(held, zoom, now)

    if (zoomSettled(held, now)) {
      if (zoom !== settled.get()) {
        const layer = editor.getContainer().querySelector(".tl-html-layer")
        endRedraw?.()
        endRedraw = layer ? redrawLayer(layer) : undefined
      }

      settled.set(zoom)
      recording.settled()
      frame = 0
    } else {
      if (zoom !== settled.get()) {
        recording.zooming()
      }

      frame = requestAnimationFrame(check)
    }
  }

  const stop = react("settle zoom", () => {
    editor.getZoomLevel()
    frame ||= requestAnimationFrame(check)
  })

  editor.getEfficientZoomLevel = () => settled.get()

  return () => {
    stop()
    cancelAnimationFrame(frame)
    endRedraw?.()
    recording.end()
  }
}

/** Whether the zoom has settled, by editor (see `isZoomSettled`). */
const zoomSettledness = new WeakMap<Editor, Computed<boolean>>()

/**
 * Whether the zoom has settled where it is (see `settleZoom`), rather than still on its way: the zoom it settled at
 * last has caught up with it. Panning leaves it settled.
 */
export function isZoomSettled(editor: Editor): boolean {
  let settled = zoomSettledness.get(editor)

  if (!settled) {
    settled = computed("zoom settled", () => editor.getZoomLevel() === editor.getEfficientZoomLevel())
    zoomSettledness.set(editor, settled)
  }

  return settled.get()
}

/** Whether the editor's tab has been hidden for a while (see `hiddenSleepMs`), by editor. */
const hiddenTabs = new WeakMap<Editor, Atom<boolean>>()

/**
 * Whether the canvas's tab has been hidden for `hiddenSleepMs`. Its frames then sleep, so a tab that isn't showing
 * holds its session, store and boards but not its designs' elements and React roots (see frame-sleep.ts, PAR-153).
 */
export function isTabHidden(editor: Editor): boolean {
  return hiddenTabs.get(editor)?.get() ?? false
}

/** Whether the camera has come to rest zoomed far out, by editor (see `markZoomedOut`). */
const restingFar = new WeakMap<Editor, Atom<boolean>>()

/**
 * Whether the camera has come to rest zoomed far enough out for frames to show their bitmaps. Frames showing theirs
 * then sleep (see frame-sleep.ts). It goes by the zoom once it's settled, so a zoom passing through doesn't put a
 * project's frames to sleep, and wake them, as it goes.
 */
export function isRestingFar(editor: Editor): boolean {
  return restingFar.get(editor)?.get() ?? false
}

/**
 * Marks the canvas while it's zoomed far out: `data-far` once frames are drawn no larger than their bitmaps, so boards
 * show those instead (see frame-bitmaps.ts), and `data-tiny` below about 5%, where boards and frames drop their
 * shadows. Each mark lasts a little past its line zooming back in, so a camera resting near one doesn't flip.
 */
function markZoomedOut(editor: Editor): () => void {
  const area = editor.getContainer().closest(".canvas-area")

  if (!area) {
    return () => undefined
  }

  const marks = [
    ["data-far", bitmapScale],
    ["data-tiny", 0.05]
  ] as const

  const far = (zoom: number, before: boolean) =>
    zoom * window.devicePixelRatio <= (before ? bitmapScale * 1.15 : bitmapScale)

  const stop = react("zoomed out", () => {
    const drawn = editor.getZoomLevel() * window.devicePixelRatio

    for (const [mark, line] of marks) {
      const on = drawn <= (area.hasAttribute(mark) ? line * 1.15 : line)

      if (area.hasAttribute(mark) !== on) {
        area.toggleAttribute(mark, on)
      }
    }
  })

  const resting = atom("resting far", far(editor.getEfficientZoomLevel(), false))
  restingFar.set(editor, resting)

  const stopResting = react("resting far", () => {
    resting.set(far(editor.getEfficientZoomLevel(), resting.__unsafe__getWithoutCapture()))
  })

  const stopRecording = recordRestedFar(editor, area, resting)

  return () => {
    stop()
    stopResting()
    stopRecording()
    restingFar.delete(editor)

    for (const [mark] of marks) {
      area.removeAttribute(mark)
    }
  }
}

/**
 * Whether tldraw draws anything on its overlay canvas. An overlay util that's active draws even with no overlays of its
 * own: the selection box draws from the selection, and its overlays are only the handles, which it can leave out (as
 * when Shift is held down on the empty canvas). The shape indicators are always active and draw only the overlays they
 * list.
 */
function overlaysShow(editor: Editor): boolean {
  return editor.overlays
    .getActiveOverlayEntries()
    .some(({ util, overlays }) => overlays.length > 0 || !(util instanceof IndicatorOverlayUtil))
}

/** tldraw's overlay canvas only holds a bitmap while an overlay shows (see `sizeWhileShown`). */
function sizeOverlays(editor: Editor): () => void {
  const canvas = editor.getContainer().querySelector<HTMLCanvasElement>("canvas.tl-canvas-overlays")

  if (!canvas) {
    return () => undefined
  }

  const sizing = sizeWhileShown(canvas, () => overlaysShow(editor))
  sizing.release()

  const stop = react("overlay canvas size", () => {
    if (!overlaysShow(editor)) {
      sizing.release()
    }
  })

  return () => {
    stop()
    sizing.restore()
  }
}

export function CanvasEditor({
  onEditor,
  shown = true
}: {
  onEditor: (editor: Editor | undefined) => void
  /** The canvas's tab is the one showing. Hidden a while, its frames sleep; shown again, those near the view wake. */
  shown?: boolean
}) {
  const { id: tab, store, selection, editor } = useProject()
  const theme = useResolvedTheme()

  // The canvas follows the app's theme; designs keep the theme their mode picks.
  useEffect(() => {
    editor?.user.updateUserPreferences({ colorScheme: theme })
  }, [editor, theme])

  // Shown, the tab's frames may wake at once; hidden, they sleep only once it's stayed hidden a moment.
  useEffect(() => {
    const hidden = editor && hiddenTabs.get(editor)

    if (!hidden) {
      return undefined
    }

    if (shown) {
      hidden.set(false)

      return undefined
    }

    const timer = setTimeout(() => hidden.set(true), hiddenSleepMs)

    return () => clearTimeout(timer)
  }, [editor, shown])

  const handleMount = useCallback(
    (editor: Editor) => {
      // Snapping on by default, as in Figma: dragged designs lock to the edges and centers of the ones around them.
      editor.user.updateUserPreferences({ colorScheme: getResolvedTheme(), isSnapMode: true })
      // Out to 1%, past tldraw's 5%, so a project with dozens of screens fits in view at once.
      editor.setCameraOptions({ zoomSteps: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8] })
      hiddenTabs.set(editor, atom("tab hidden", false))

      // Designs, notes and references come and go with undo and agents, so shapes follow the store rather than being
      // made once.
      const sync = () => {
        const wanted = new Map<CanvasId, Projected>()

        for (const { key, container } of store.getEntries()) {
          // A board an agent moved stays where it was until the agent's cursor drags it over.
          const at = heldBoards.at(tab, key) ?? container.position
          // A locked design's board is a locked shape, which tldraw neither selects nor moves (PAR-192).
          const locked = container.locked === true
          wanted.set(canvasIdFor(key), { type: "canvas-container", key, ...at, locked })
        }

        for (const { key, note } of store.getNotes()) {
          wanted.set(canvasIdFor(key), { type: "canvas-note", key, ...note.position })
        }

        for (const { key, reference } of store.getReferences()) {
          const { width: w, height: h } = referenceSize(reference)
          const size = { w, h }
          wanted.set(canvasIdFor(key), {
            type: "canvas-reference",
            key,
            ...reference.position,
            size,
            link: reference.link
          })
        }

        editor.run(
          () => {
            const stale = editor.getCurrentPageShapes().filter((item) => !wanted.has(item.id))

            if (stale.length > 0) {
              editor.deleteShapes(stale.map((item) => item.id))
            }

            for (const [id, { type, key, x, y, locked = false, size, link }] of wanted) {
              const placed = editor.getShape(id)
              const meta = link ? { link } : {}

              if (!placed) {
                editor.createShape({ id, type, x, y, isLocked: locked, props: { key, ...size }, meta })
              } else if (Math.abs(placed.x - x) >= 1 || Math.abs(placed.y - y) >= 1 || placed.isLocked !== locked) {
                editor.updateShape({ id, type: placed.type, x, y, isLocked: locked })
              }

              if (placed?.type === "canvas-reference" && size) {
                const { w, h } = placed.props

                if (w !== size.w || h !== size.h || placed.meta.link !== link) {
                  editor.updateShape({ id, type: "canvas-reference", props: size, meta })
                }
              }
            }
          },
          { history: "ignore" }
        )
      }

      sync()
      // The canvas opens on the whole project, placed roughly by where its boards are before they've sized themselves, so
      // frames start at the zoom they're shown at: zoomed far out, a frame with a bitmap kept from an earlier session
      // sleeps on it without drawing its design first (PAR-179). It's fitted again once the boards have their sizes.
      // Boards not sized yet are small, so a small project would start zoomed in; that one starts where it did.
      const opening = editor.getCamera()
      editor.zoomToFit()

      if (editor.getZoomLevel() > opening.z) {
        editor.setCamera(opening, { immediate: true })
      }

      const stopZoom = settleZoom(editor)
      const stopZoomedOut = markZoomedOut(editor)
      const stopOverlays = sizeOverlays(editor)
      const stopStore = store.subscribe(sync)
      const stopHeld = heldBoards.subscribe(sync)

      // A pan or a zoom is a gesture of its own, recorded once the camera settles (PAR-640).
      const camera = new CameraGestures()
      const stopCamera = react("camera gestures", () => camera.moved(editor.getCamera()))

      // A board or note dragged by tldraw moves in one gesture, from its first move until tldraw stops translating.
      let translation:
        | { gesture: string; began: number; moved: Set<string>; frames: () => number | undefined }
        | undefined

      const stopTranslation = react("translation ends", () => {
        if (editor.isIn("select.translating") || !translation) {
          return
        }

        const { gesture, began, moved, frames } = translation
        translation = undefined
        const undoStep = store.endGesture(gesture)
        const fps = frames()

        const ended: GestureEnded = {
          kind: "move",
          how: "release",
          kept: true,
          durationMs: Math.round(performance.now() - began),
          designs: [...moved],
          undoStep
        }

        if (fps !== undefined) {
          ended.fps = fps
        }

        recordGesture(ended)
      })

      const stopMoves = editor.sideEffects.registerAfterChangeHandler("shape", (previous, next, source) => {
        if (source !== "user" || designDrag.active || (previous.x === next.x && previous.y === next.y)) {
          return
        }

        const translating = editor.isIn("select.translating")

        if (translating) {
          translation ??= {
            gesture: store.beginGesture(),
            began: performance.now(),
            moved: new Set(),
            frames: countFrames()
          }

          if (next.type === "canvas-container" || next.type === "canvas-note" || next.type === "canvas-reference") {
            translation.moved.add(next.props.key)
          }
        }

        const gesture = translating ? translation?.gesture : undefined

        if (next.type === "canvas-container" && !heldBoards.at(tab, next.props.key)) {
          store.setPosition(next.props.key, { x: next.x, y: next.y }, { gesture })
        }

        if (next.type === "canvas-note") {
          const position = { x: Math.round(next.x), y: Math.round(next.y) }
          store.updateNote(next.props.key, "Move text", (note) => ({ ...note, position }), { gesture })
        }

        if (next.type === "canvas-reference") {
          const position = { x: Math.round(next.x), y: Math.round(next.y) }
          store.updateReference(next.props.key, "Move reference", (reference) => ({ ...reference, position }), {
            gesture
          })
        }
      })

      // tldraw's selection and ours stay in step, whichever side changes.
      const stopSelection = editor.sideEffects.registerAfterChangeHandler("instance_page_state", (previous, next) => {
        if (previous.selectedShapeIds === next.selectedShapeIds) {
          return
        }

        const ids = next.selectedShapeIds
        const picked = ids.length === 1 ? editor.getShape(ids[0]!) : undefined
        const current = selection.get()

        // Shift-click and dragging a box on the canvas select several designs at once.
        const designs = ids.flatMap((id) => {
          const candidate = editor.getShape(id)

          return candidate?.type === "canvas-container" ? [candidate.props.key] : []
        })

        if (designs.length > 1) {
          const wanted = designsSelection(designs)

          if (
            current.node ||
            current.note ||
            current.reference ||
            (current.designs ?? []).join() !== wanted.designs!.join()
          ) {
            selection.set(wanted)
          }
        } else if (picked?.type === "canvas-container") {
          if (current.design !== picked.props.key || current.note || current.reference) {
            selection.set({ design: picked.props.key })
          }
        } else if (picked?.type === "canvas-note") {
          if (current.note !== picked.props.key) {
            selection.set({ note: picked.props.key })
          }
        } else if (picked?.type === "canvas-reference") {
          if (current.reference !== picked.props.key) {
            selection.set({ reference: picked.props.key })
          }
        } else if (ids.length === 0 && (current.design || current.note || current.reference)) {
          selection.set({})
        }
      })

      const followSelection = () => {
        const current = selection.get()
        let keys: string[]

        if (current.note) {
          keys = [current.note]
        } else if (current.reference) {
          keys = [current.reference]
        } else if (current.design && (current.node || current.mode)) {
          keys = [current.design]
        } else {
          keys = selectedDesigns(current)
        }

        const wanted = keys.map(canvasIdFor).filter((id) => editor.getShape(id))
        const ids = editor.getSelectedShapeIds()

        if (ids.length !== wanted.length || ids.some((id, index) => id !== wanted[index])) {
          editor.setSelectedShapes(wanted)
        }

        // Each kind of thing has its own selection color.
        const entry = current.design ? store.getEntry(current.design) : undefined
        let color: string = kindColors.screen

        if (current.node || current.reference) {
          color = kindColors.layer
        } else if (current.mode) {
          color = kindColors.mode
        } else if (entry) {
          color = designColor(entry.container.kind)
        }

        setSelectionColor(editor, color)
      }

      const stopFollowing = selection.subscribe(followSelection)
      followSelection()
      const layerHovered = atom("hovering a layer", false)
      hoveringLayer.set(editor, layerHovered)
      // Only the Layers panel hovers a design without a layer, which outlines its board as hovering the board does.
      const rowHovered = atom<string | undefined>("design hovered in Layers", undefined)

      const stopHover = selection.subscribe(() => {
        const hover = selection.getHover()
        layerHovered.set(!!hover?.node)
        rowHovered.set(hover && !hover.node ? hover.design : undefined)
      })

      // tldraw takes its hover away as it handles the pointer leaving the canvas, a tick after the row is entered, so the
      // board's is put back whenever it changes while the row stays hovered (PAR-187).
      let outlined: CanvasId | undefined

      const stopOutline = react("outline the design hovered in Layers", () => {
        const design = rowHovered.get()
        const hovered = editor.getHoveredShapeId()

        if (design) {
          outlined = canvasIdFor(design)

          if (hovered !== outlined) {
            editor.setHoveredShape(outlined)
          }
        } else if (outlined) {
          if (hovered === outlined) {
            editor.setHoveredShape(null)
          }

          outlined = undefined
        }
      })

      // Containers size themselves after their content renders, so fit once they have.
      const fit = setTimeout(() => editor.zoomToFit({ animation: { duration: 200 } }), 400)
      onEditor(editor)

      return () => {
        clearTimeout(fit)
        stopZoom()
        stopZoomedOut()
        stopOverlays()
        hiddenTabs.delete(editor)
        stopStore()
        stopHeld()
        stopTranslation()
        // A drag still going as the canvas goes, as when its tab closes: its frame counter stops with it.
        translation?.frames()

        if (translation) {
          store.endGesture(translation.gesture)
        }

        translation = undefined
        stopCamera()
        camera.stop()
        stopMoves()
        stopSelection()
        stopFollowing()
        stopHover()
        stopOutline()
        hoveringLayer.delete(editor)
        onEditor(undefined)
      }
    },
    [tab, store, selection, onEditor]
  )

  return (
    <Tldraw
      hideUi
      licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- tldraw names this prop.
      shapeUtils={canvasUtils}
      overlayUtils={overlayUtils}
      components={components}
      overrides={withoutTldrawShortcuts}
      onMount={handleMount}
    />
  )
}
