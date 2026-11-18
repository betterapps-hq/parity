import {
  designsSelection,
  holdZoom,
  type OutlineTarget,
  referenceSize,
  type Selection,
  selectedDesigns,
  zoomHeldFrom,
  zoomSettled
} from "@parity-app/editor"
import type { Gesture } from "@parity-app/extension/internal"
import {
  containerEntries,
  noteEntries,
  referenceEntries,
  setPosition,
  updateNote,
  updateReference
} from "@parity-app/multiplayer"
import { useCallback, useEffect, useState } from "react"
import {
  type Atom,
  atom,
  type Computed,
  computed,
  DefaultBackground,
  type Editor,
  getUserPreferences,
  react,
  SelectionForegroundOverlayUtil,
  setUserPreferences,
  type TLComponents,
  Tldraw,
  useEditor
} from "tldraw"
import { holdWhileZooming } from "../replay.ts"
import { useResolvedTheme } from "../theme.ts"
import { WindowLayers } from "../window-canvas.tsx"
import { holds } from "./board-holds.ts"
import { isComponentBoard } from "./component-boards.ts"
import { ContainerUtil, designDrag } from "./ContainerUtil.tsx"
import { useProject } from "./context.ts"
import { isFarZoom } from "./frame-bitmaps.ts"
import { hiddenSleepMs } from "./frame-sleep.ts"
import { CameraGestures, countFrames, type GestureEnded, recordGesture } from "./gesture.ts"
import { drawableColor, KindOutlines, neutralSelection, outlineSources } from "./kind-outlines.ts"
import { designColor, kindColors } from "./kinds.tsx"
import { redrawLayer } from "./layer-redraw.ts"
import { LiveLayer } from "./LiveLayer.tsx"
import { NoteUtil } from "./NoteUtil.tsx"
import { sizeWhileShown } from "./overlay-canvas.ts"
import { PageLinksUtil } from "./PageLinksUtil.tsx"
import { placedBoards } from "./placed-boards.ts"
import { tellBrushing, tellGesture } from "./presence-gestures.ts"
import { ReferenceUtil } from "./ReferenceUtil.tsx"
import { recordRestedFar } from "./rested-far.ts"
import { isRoutePage, routePageLinks } from "./route-pages.ts"
import { isStoryScreen } from "./story-screens.ts"
import { startCanvasSurface } from "./surface/index.ts"
import { TitleLayer } from "./title-layer.tsx"
import { withoutPatternFills } from "./tldraw-fills.ts"
import { type CanvasId, createCanvasId, IndicatorOverlayUtil } from "./tldraw-names.ts"
import { withoutTldrawShortcuts } from "./tldraw-shortcuts.ts"

const canvasUtils = [ContainerUtil, NoteUtil, ReferenceUtil, PageLinksUtil, ...withoutPatternFills]

/** The kinds of things the project holds that tldraw draws, each as a shape following its entry. */
type ProjectedType = "canvas-container" | "canvas-note" | "canvas-reference" | "canvas-page-links"

/** A shape as the project wants it: where it is, and for a reference its size and link. */
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
 * What a canvas draws: the app's pages, drawn from its routes, with the lines of its page tree; the project's components
 * on their boards; its story files; or the rest, the designs, notes and references (lens-layout.md).
 */
export type CanvasDraws = "pages" | "components" | "stories" | "designs"

/** Where each canvas's camera was as it went, by project and what it draws, so it comes back there. */
const keptCameras = new Map<string, { x: number; y: number; z: number }>()

/** Each canvas's fit still to come as it opens, once its boards have their sizes. */
const openingFits = new WeakMap<Editor, ReturnType<typeof setTimeout>>()

/**
 * Keeps the camera where it's about to be put rather than fitting it to the canvas as it opens: a design revealed from
 * Search, a link or an extension's zoomTo, as its lens shows for the first time, stays in view.
 */
export function keepOpeningCamera(editor: Editor): void {
  clearTimeout(openingFits.get(editor))
  openingFits.delete(editor)
}

/** Whether a canvas drawing these draws this design. */
export function drawsDesign(draws: CanvasDraws, key: string): boolean {
  return canvasOf(key) === draws
}

/**
 * Which canvas draws a design, note or reference, by its key: Pages' the app's pages, Components' the boards, Stories'
 * its story files, and Screens' the rest.
 */
export function canvasOf(key: string): CanvasDraws {
  if (isRoutePage(key)) {
    return "pages"
  }

  if (isComponentBoard(key)) {
    return "components"
  }

  return isStoryScreen(key) ? "stories" : "designs"
}

/**
 * The infinite canvas. tldraw supplies the camera, dragging and snapping with its own UI hidden; the editor chrome is
 * ours. The project document is the source of truth: tldraw shapes are a projection of it, and the selection store
 * says what's selected.
 */
/**
 * tldraw's own context menu acts on tldraw shapes (copy as SVG, paste); designs have their own menus instead. Design
 * titles draw in a layer of their own, above every board.
 */
// Internal extensions' layers under the designs draw in the background, behind every shape (window-canvas.tsx).
const components: TLComponents = {
  ContextMenu: null,
  OnTheCanvas: CanvasLayers,
  Background: CanvasBackground
}

/** The layers in the canvas's page space, above every board: route boards' live frames, then designs' titles. */
function CanvasLayers() {
  return (
    <>
      <LiveLayer />
      <TitleLayer />
    </>
  )
}

/** tldraw's background, with internal extensions' layers under the designs drawn on it. */
function CanvasBackground() {
  const editor = useEditor()
  const { editor: focused } = useProject()

  // Internal extensions draw on the canvas in focus, whose editor the project holds.
  return (
    <>
      <DefaultBackground />
      {editor === focused && <WindowLayers order="underDesigns" />}
    </>
  )
}

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

const overlayUtils = [SelectionBox, KindOutlines]

/**
 * The color tldraw draws the box round several designs in, which is no one kind's (PAR-1118). tldraw draws on a canvas,
 * in its theme's colors: setting a custom property on the canvas instead changed none of them, yet restyled every
 * element of every frame each time the color did.
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

  // Not put back when this stops: tldraw runs `onMount`'s teardown only as the editor goes, and a remount sets it again.
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
 * holds its session, document and boards but not its designs' elements and React roots (see frame-sleep.ts, PAR-153).
 */
export function isTabHidden(editor: Editor): boolean {
  return hiddenTabs.get(editor)?.get() ?? false
}

/** Whether the camera has come to rest zoomed far out, by editor (see `markZoomedOut`). */
const restingFar = new WeakMap<Editor, Atom<boolean>>()

/**
 * Whether the camera has come to rest zoomed far enough out for frames to show their bitmaps. Frames showing theirs
 * then sleep (see frame-sleep.ts). It goes by the zoom once it's settled, so a zoom passing through doesn't put a
 * project's frames to sleep, and wake them, as it goes; but it ends as soon as the zoom itself is back in, so frames in
 * view swap their bitmaps for their designs while a zoom in is still going (PAR-955).
 */
export function isRestingFar(editor: Editor): boolean {
  return restingFar.get(editor)?.get() ?? false
}

/**
 * Marks the canvas while it's zoomed far out: `data-far` from `farZoom`, so boards show frames' bitmaps instead (see
 * frame-bitmaps.ts), and `data-tiny` below about 5% of the screen's own pixels, where boards and frames drop their
 * shadows. Each mark lasts a little past its line zooming back in, so a camera resting near one doesn't flip.
 */
function markZoomedOut(editor: Editor): () => void {
  const area = editor.getContainer().closest(".canvas-area")

  if (!area) {
    return () => undefined
  }

  const marks = [
    ["data-far", isFarZoom],
    ["data-tiny", (zoom: number, was: boolean) => zoom * window.devicePixelRatio <= (was ? 0.05 * 1.15 : 0.05)]
  ] as const

  const stop = react("zoomed out", () => {
    const zoom = editor.getZoomLevel()

    for (const [mark, past] of marks) {
      const on = past(zoom, area.hasAttribute(mark))

      if (area.hasAttribute(mark) !== on) {
        area.toggleAttribute(mark, on)
      }
    }
  })

  const resting = atom("resting far", isFarZoom(editor.getEfficientZoomLevel(), false))
  restingFar.set(editor, resting)

  // One signal for every board, which changes only crossing the line: a board reading the zoom itself would be checked
  // again on every frame of a zoom.
  const stopResting = react("resting far", () => {
    const settled = isFarZoom(editor.getEfficientZoomLevel(), resting.__unsafe__getWithoutCapture())
    resting.set(settled && isFarZoom(editor.getZoomLevel(), true))
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

/**
 * The boards tldraw is dragging, as a move tells them: each one's design, where it sits from the pointer, and its size
 * on the page.
 */
function boardTargets(editor: Editor): Extract<Gesture, { kind: "move" }>["targets"] {
  const pointer = editor.inputs.originPagePoint

  return editor.getSelectedShapes().flatMap((board) => {
    const bounds = editor.getShapePageBounds(board)

    if (board.type !== "canvas-container" || !bounds) {
      return []
    }

    return [
      {
        ref: { owner: "design" as const, type: "design", key: board.props.key },
        offset: { x: bounds.x - pointer.x, y: bounds.y - pointer.y },
        size: { width: bounds.w, height: bounds.h }
      }
    ]
  })
}

export function CanvasEditor({
  onEditor,
  draws = "designs",
  shown = true
}: {
  onEditor: (editor: Editor | undefined) => void
  /** What it draws: the app's pages, its components' boards, its story files, or the designs. */
  draws?: CanvasDraws
  /** The canvas's tab is the one showing. Hidden a while, its frames sleep; shown again, those near the view wake. */
  shown?: boolean
}) {
  const project = useProject()
  const { id: tab, doc, selection } = project
  // This canvas's own editor, which the project holds only while its lens is in focus.
  const [editor, setEditor] = useState<Editor>()
  const theme = useResolvedTheme()

  // tldraw draws its first frame in the app's theme, rather than in the light one it starts in until it's mounted. Its
  // preferences are every canvas's, so a tab opened later finds them set already, and nothing changes as it draws.
  useState(() => {
    if (getUserPreferences().colorScheme !== theme) {
      setUserPreferences({ ...getUserPreferences(), colorScheme: theme })
    }
  })

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
      editor.user.updateUserPreferences({ isSnapMode: true })
      // Out to 1%, past tldraw's 5%, so a project with dozens of screens fits in view at once.
      editor.setCameraOptions({ zoomSteps: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8] })
      hiddenTabs.set(editor, atom("tab hidden", false))
      setEditor(editor)

      // Designs, notes and references come and go with undo and agents, so shapes follow the document rather than
      // being made once.
      const sync = () => {
        const wanted = new Map<CanvasId, Projected>()

        for (const { key, container } of containerEntries(doc)) {
          if (!drawsDesign(draws, key)) {
            continue
          }

          // A board an agent moved stays where it was until the agent's cursor drags it over, and one someone else is
          // dragging follows their pointer (`placedBoards`).
          const at = placedBoards.at(tab, key) ?? container.position
          // A locked design's board is a locked shape, which tldraw neither selects nor moves (PAR-192).
          const locked = container.locked === true
          wanted.set(canvasIdFor(key), { type: "canvas-container", key, ...at, locked })
        }

        for (const { key, note } of draws === "designs" ? noteEntries(doc) : []) {
          wanted.set(canvasIdFor(key), { type: "canvas-note", key, ...note.position })
        }

        for (const { key, reference } of draws === "designs" ? referenceEntries(doc) : []) {
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

        // The lines of the app's page tree, behind everything (PAR-1076).
        const pageLines = createCanvasId("page-links")

        if (draws === "pages" && routePageLinks(tab).length > 0) {
          wanted.set(pageLines, { type: "canvas-page-links", key: tab, x: 0, y: 0, locked: true })
        }

        editor.run(
          () => {
            const stale = editor.getCurrentPageShapes().filter((item) => !wanted.has(item.id))

            if (stale.length > 0) {
              editor.deleteShapes(stale.map((item) => item.id))
            }

            // What the person is dragging stays under their pointer: their drag wins over a hold they grabbed.
            const dragged = new Set([
              ...(editor.isIn("select.translating") ? editor.getSelectedShapeIds() : []),
              ...[...designDrag.designs].map(canvasIdFor)
            ])

            for (const [id, { type, key, x, y, locked = false, size, link }] of wanted) {
              const placed = editor.getShape(id)
              const meta = link ? { link } : {}

              const moved =
                !dragged.has(id) && (Math.abs((placed?.x ?? x) - x) >= 1 || Math.abs((placed?.y ?? y) - y) >= 1)

              if (!placed) {
                editor.createShape({ id, type, x, y, isLocked: locked, props: { key, ...size }, meta })
              } else if (moved || placed.isLocked !== locked) {
                editor.updateShape(
                  moved
                    ? { id, type: placed.type, x, y, isLocked: locked }
                    : { id, type: placed.type, isLocked: locked }
                )
              }

              if (!placed && type === "canvas-page-links") {
                editor.sendToBack([id])
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
      const kept = keptCameras.get(`${tab}:${draws}`)
      // The canvas opens on the whole project, placed roughly by where its boards are before they've sized themselves, so
      // frames start at the zoom they're shown at: zoomed far out, a frame with a bitmap kept from an earlier session
      // sleeps on it without drawing its design first (PAR-179). It's fitted again once the boards have their sizes.
      // Boards not sized yet are small, so a small project would start zoomed in; that one starts where it did.
      // Shown again, it's where it was.
      const opening = editor.getCamera()

      if (kept) {
        editor.setCamera(kept, { immediate: true })
      } else {
        editor.zoomToFit()

        if (editor.getZoomLevel() > opening.z) {
          editor.setCamera(opening, { immediate: true })
        }
      }

      const stopZoom = settleZoom(editor)
      // The camera, following and boxes on the page, for what draws over the canvas (PAR-1236).
      const stopSurface = startCanvasSurface(editor)
      const stopZoomedOut = markZoomedOut(editor)
      const stopOverlays = sizeOverlays(editor)
      const stopDoc = doc.subscribe(() => sync())
      const stopHeld = placedBoards.subscribe(sync)

      // A pan or a zoom is a gesture of its own, recorded once the camera settles (PAR-640).
      const camera = new CameraGestures()
      const stopCamera = react("camera gestures", () => camera.moved(editor.getCamera()))
      // A box drawn on the empty canvas, told as this person's gesture (`parity.presence`).
      const stopBrushing = tellBrushing(editor, project)

      // A board or note dragged by tldraw moves in one gesture, from its first move until tldraw stops translating.
      let translation:
        | {
            gesture: string
            began: number
            moved: Set<string>
            frames: () => number | undefined
            /** The boards it moves, as `parity.presence` tells the drag, if it moves any (PAR-1268). */
            told?: Extract<Gesture, { kind: "move" }>["targets"]
          }
        | undefined

      const stopTranslation = react("translation ends", () => {
        if (editor.isIn("select.translating") || !translation) {
          return
        }

        const { gesture, began, moved, frames, told } = translation
        translation = undefined
        const result = doc.endGesture(gesture)
        const fps = frames()

        // Told after its write, so another copy settles its preview on it.
        if (told) {
          tellGesture(project, { kind: "move", phase: "end", targets: told })
        }

        const ended: GestureEnded = {
          kind: "move",
          how: "release",
          kept: true,
          durationMs: Math.round(performance.now() - began),
          designs: [...moved],
          undoStep: result.step,
          transactions: result.transactions,
          transactMs: result.transactMs
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

        if (translating && !translation) {
          const told = boardTargets(editor)
          translation = {
            gesture: doc.beginGesture(),
            began: performance.now(),
            moved: new Set(),
            frames: countFrames()
          }

          if (told.length > 0) {
            translation.told = told
            tellGesture(project, { kind: "move", phase: "start", targets: told })
          }
        }

        if (translating && translation) {
          if (next.type === "canvas-container" || next.type === "canvas-note" || next.type === "canvas-reference") {
            translation.moved.add(next.props.key)
          }
        }

        const gesture = translating ? translation?.gesture : undefined

        // The person dragging a board themselves, not a hold or preview placing it.
        const grabbed =
          next.type === "canvas-container" && translating && editor.getSelectedShapeIds().includes(next.id)

        // Grabbing a held board lets go of it, and the person's drag wins.
        if (grabbed) {
          holds.grab(tab, next.props.key)
        }

        // A placed board is drawn where it's held or previewed, which isn't written back; the person's own drag is.
        if (next.type === "canvas-container" && (grabbed || !placedBoards.at(tab, next.props.key))) {
          setPosition(doc, next.props.key, { x: next.x, y: next.y }, { gesture })
        }

        if (next.type === "canvas-note") {
          const position = { x: Math.round(next.x), y: Math.round(next.y) }
          updateNote(doc, next.props.key, "Move text", (note) => ({ ...note, position }), { gesture })
        }

        if (next.type === "canvas-reference") {
          const position = { x: Math.round(next.x), y: Math.round(next.y) }
          updateReference(doc, next.props.key, "Move reference", (reference) => ({ ...reference, position }), {
            gesture
          })
        }
      })

      // Whether what's selected is drawn here: a design on the other canvas leaves this one with nothing selected.
      const drawsSelected = (current: Selection) =>
        [current.note, current.reference, current.design, ...selectedDesigns(current)].some(
          (key) => key !== undefined && editor.getShape(canvasIdFor(key)) !== undefined
        )

      // tldraw's selection and ours stay in step, whichever side changes; one this canvas set to show ours isn't written
      // back, since a canvas drawing only some of what's selected would narrow it for every other canvas.
      let following = false

      const stopSelection = editor.sideEffects.registerAfterChangeHandler("instance_page_state", (previous, next) => {
        if (previous.selectedShapeIds === next.selectedShapeIds || following) {
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
        } else if (ids.length === 0 && drawsSelected(current)) {
          selection.set({})
        }
      })

      const selected = atom<Selection>("selection outlined", selection.get())
      const hoveredLayer = atom<OutlineTarget | undefined>("layer hovered", undefined)
      outlineSources.set(editor, {
        selection: selected,
        hoveredLayer,
        canvasIdOf: canvasIdFor,
        colorOf: (target) => {
          if (target.kind === "note") {
            return kindColors.screen
          }

          if (target.kind === "reference") {
            return kindColors.layer
          }

          return designColor(doc.design(target.design)?.kind, target.design)
        }
      })
      setSelectionColor(editor, neutralSelection)

      const followSelection = () => {
        const current = selection.get()
        selected.set(current)
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
          following = true

          try {
            editor.setSelectedShapes(wanted)
          } finally {
            following = false
          }
        }
      }

      const stopFollowing = selection.subscribe(followSelection)
      followSelection()
      // Only the Layers panel hovers a design without a layer, which outlines its board as hovering the board does.
      const rowHovered = atom<string | undefined>("design hovered in Layers", undefined)

      const stopHover = selection.subscribe(() => {
        const hover = selection.getHover()
        hoveredLayer.set(hover?.node ? { kind: "layer", design: hover.design, node: hover.node } : undefined)
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

      // Containers size themselves after their content renders, so fit once they have, unless something is revealed first.
      const fit = kept ? undefined : setTimeout(() => editor.zoomToFit({ animation: { duration: 200 } }), 400)

      if (fit) {
        openingFits.set(editor, fit)
      }

      onEditor(editor)

      return () => {
        clearTimeout(fit)
        openingFits.delete(editor)
        keptCameras.set(`${tab}:${draws}`, editor.getCamera())
        stopZoom()
        stopSurface()
        stopZoomedOut()
        stopOverlays()
        hiddenTabs.delete(editor)
        stopDoc()
        stopHeld()
        stopTranslation()
        // A drag still going as the canvas goes, as when its tab closes: its frame counter stops with it.
        translation?.frames()

        if (translation) {
          doc.endGesture(translation.gesture)

          if (translation.told) {
            tellGesture(project, { kind: "move", phase: "cancel", targets: translation.told })
          }
        }

        translation = undefined
        stopCamera()
        stopBrushing()
        camera.stop()
        stopMoves()
        stopSelection()
        stopFollowing()
        stopHover()
        stopOutline()
        outlineSources.delete(editor)
        onEditor(undefined)
      }
    },
    [project, tab, doc, selection, onEditor, draws]
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
