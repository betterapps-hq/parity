import { boardTarget, designSlots, editNode, isInnerPath, locateNode, resolveModes } from "@parity-app/core"
import {
  distancesBetween,
  drawsOver,
  type Edge,
  editableText,
  frameResize,
  frameSizeReset,
  layerResize,
  layerSizeReset,
  layersResize,
  type SpacingEdit,
  isLocked,
  measuresNext,
  movesOnlyTheView,
  overlayDesigns,
  pasteHere,
  resizeStart,
  selectedNodes,
  settleUntil,
  spacingHandles,
  textLayer,
  toggleLayer,
  withFrame
} from "@parity-app/editor"
import { SquareDashed } from "lucide-react"
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { react, type TLRecord } from "tldraw"
import { gestures as held } from "../chrome/keymap.ts"
import { holds } from "../chrome/keys.ts"
import { Name } from "../chrome/Name.tsx"
import { getPreferences, subscribePreferences } from "../chrome/preferences.ts"
import { allFrames, findFrames, findNodeElement, nodeBox, subscribeFrames } from "../frame.ts"
import { useEditing } from "../selection.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { useProject } from "./context.ts"
import { drawFrame, useFrameDrawing } from "./frame-tool.ts"
import { followPress, gestures } from "./gesture.ts"
import {
  frameAt,
  frameScale,
  type Hit,
  hitInFrame,
  hitTest,
  nodeInFrames,
  type Point,
  selectedIn,
  selectionFrame,
  underPoint
} from "./hit.ts"
import { chipColors, chipFor, designColor, kindColors, layerLabel, nodeColor } from "./kinds.tsx"
import { type DragView, getDragView, pressLayers } from "./layer-drag.ts"
import { getSnapMeasures, LayerSnapping } from "./layer-snap.ts"
import { findLayer } from "./layers.ts"
import { addFrameOfText } from "./new-screen.ts"
import { frameDrawn } from "./nudge.ts"
import { placeAtPoint } from "./paste-here.ts"
import { hoverTarget, pickDeeper, pressTarget } from "./pick.ts"
import { formatPx, type Redline, RedlineView } from "./Redline.tsx"
import { resizeCursors, ResizeHandles } from "./ResizeHandles.tsx"
import { pressBackground } from "./select-box.ts"
import {
  measureSpacing,
  pickSpacing,
  pressSpacing,
  type SpacingMeasure,
  type SpacingTarget,
  spacingValue,
  stepSpacing,
  typeSpacing,
  lengthTokens
} from "./spacing-edit.ts"
import { spacingKey, SpacingHandles } from "./SpacingHandles.tsx"
import { TextEditor } from "./TextEditor.tsx"

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Resize handles around a selected layer, or around each frame of a selected design. */
interface Handles {
  kind: "node" | "frame"
  key: string
  box: Box
  color: string
  edges: Edge[]
  /** What the handles say they do, for a frame's (see `ResizeHandles`). */
  label?: string
  design: string
  mode: string
  state: string
  node?: string
  /** Several layers resized together by handles on the box around them all (PAR-169). */
  nodes?: string[]
}

/** Space inside a selected layout: its padding, and the gaps between its children. */
interface Spacing {
  key: string
  box: Box
  kind: "padding" | "gap"
}

interface Model {
  outlines: { key: string; box: Box; color: string; dashed: boolean; thick: boolean }[]
  /** The selection's name over it and its size under it; several layers are counted rather than named. */
  label?: { box: Box; name: string; size: string; color: string; counted?: boolean }
  redlines: Redline[]
  handles: Handles[]
  drag?: DragView
  spacing?: Spacing[]
  /** The selected layout's padding and gap handles (PAR-169). */
  spacingHandles?: { target: SpacingTarget; measure: SpacingMeasure }
  /** Column grids over frames, from View > Layout grid. */
  columns?: { key: string; box: Box }[]
  /** A selected frame's size, under it, as a layer's is: a frame's name is its title above it. */
  frameSize?: { box: Box; size: string }
  /** A selected component design's slots (PAR-83), each outlined and named, so it's clear where instances put layers. */
  slots?: { key: string; box: Box; name: string }[]
}

const empty: Model = { outlines: [], redlines: [], handles: [] }
const nodeEdges: Edge[] = ["n", "e", "s", "w", "ne", "se", "sw", "nw"]
const frameEdges: Edge[] = ["e", "s", "se"]

/**
 * Everything drawn over the canvas in screen space: selection and hover outlines for layers inside designs, the
 * selected layer's name and size, redlines while Alt is held, and the in-place text editor. It also takes the pointer
 * first, so clicks inside a design select its layers the way Figma does.
 */
export function CanvasOverlay() {
  const session = useProject()
  const rootRef = useRef<HTMLDivElement>(null)
  const tickerRef = useRef<HTMLDivElement>(null)
  const [model, setModel] = useState<Model>(empty)
  const pointer = useRef<{ point?: Point; alt: boolean; deep: boolean }>({ alt: false, deep: false })
  const editing = useEditing(session.selection)
  // The padding or gap handle being dragged, and what it's come to.
  const [spacingDrag, setSpacingDrag] = useState<{ key: string } & SpacingEdit>()

  // Pointer handling, ahead of tldraw.
  useEffect(() => {
    const area = rootRef.current?.parentElement
    if (!area) return undefined
    const { store, selection } = session
    const interactive = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(
        "button, input, textarea, [role=menuitem], [role=option], .design-title, .state-label, .text-editor, .resize-handle, .spacing-handle"
      )

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || interactive(event.target)) return
      const point = { x: event.clientX, y: event.clientY }
      const tool = selection.getTool()
      // Interacting, the designs take the pointer themselves.
      if (tool === "hand" || tool === "interact") return
      const hit = hitTest(area, store, point, session.editor)
      // Double-clicks belong to the canvas, not tldraw: inside a design they drill in (see onDoubleClick), and on empty
      // canvas tldraw would make a text shape of its own. Only free text notes keep tldraw's double-click, to edit.
      if (event.detail >= 2 && tool === "select" && !overNote(session, point)) {
        event.stopPropagation()
        event.preventDefault()
        return
      }
      // The frame tool draws over the empty canvas and over designs alike.
      if (tool === "frame") {
        event.stopPropagation()
        event.preventDefault()
        drawFrame(session, area, event)
        return
      }
      if (tool === "text") {
        event.stopPropagation()
        event.preventDefault()
        addText(session, area, point)
        selection.setTool("select")
        return
      }
      // Outside a design's frames, and on a free text note over one, the press is tldraw's: it selects and moves
      // boards and notes. A board is selected by its title or its background around the frames. A locked design's
      // frames are tldraw's too, which leaves its locked board alone and draws a box over it (PAR-192).
      if (!hit || hit.entry.container.locked || overNote(session, point)) return
      // Inside a frame a press selects what's under the pointer, as in Figma's top-level frames: the top-level layer,
      // or with a layer of this design selected, its sibling; Ctrl goes to the deepest layer (see pick.ts).
      const current = selection.get()
      const press = pressTarget(
        underPoint(hit),
        selectedIn(hit, current),
        current.design === hit.entry.key ? selectedNodes(current) : [],
        { deep: event.ctrlKey || event.metaKey, shift: event.shiftKey }
      )
      event.stopPropagation()
      event.preventDefault()
      // On the frame's background a click selects the board, and a drag draws a box.
      if (press.kind === "background") {
        pressBackground(session, event, hit)
        return
      }
      if (press.kind === "toggle") {
        selection.set(toggleLayer(current, hit.entry.key, press.node, hit))
        return
      }
      // A layer that isn't selected is selected as it's pressed, so dragging moves it rather than the board. Pressing
      // one that's selected keeps the whole selection, to drag it; a click without dragging then selects just it.
      if (press.kind === "select") selectHit(session, hit, press.node)
      pressLayers(session, area, event, () => press.kind === "keep" && selectHit(session, hit, press.node))
    }

    const onDoubleClick = (event: MouseEvent) => {
      if (interactive(event.target) || selection.getTool() !== "select") return
      const point = { x: event.clientX, y: event.clientY }
      const hit = hitTest(area, store, point, session.editor)
      if (!hit || hit.entry.container.locked || overNote(session, point)) return
      const selected = selectedIn(hit, selection.get())
      event.stopPropagation()
      // Its first click selected what's under the pointer; the double-click goes one level deeper, as in Figma. It
      // edits text only on a selected text layer that's the deepest thing under the pointer, with nothing deeper.
      const node = selected ? findLayer(store, hit.entry.container, selected.node) : undefined
      const deepest = !!selected && hit.path.at(-1) === selected.node
      if (selected && node && deepest && editableText(node) !== undefined) {
        selection.set({ design: hit.entry.key, node: selected.node, mode: hit.mode, state: hit.state })
        selection.setEditing({
          design: hit.entry.key,
          node: selected.node,
          mode: hit.mode,
          state: hit.state,
          at: point
        })
        return
      }
      const deeper = pickDeeper(underPoint(hit), selected)
      if (deeper) selectHit(session, hit, deeper)
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.current = {
        point: { x: event.clientX, y: event.clientY },
        alt: event.altKey,
        deep: event.ctrlKey || event.metaKey
      }
      if (event.buttons !== 0) return
      if (selection.getTool() === "interact") {
        selection.setHover(undefined)
        return
      }
      // Hovering outlines what a click would select, in the frame under the pointer, in any design. Over a frame's
      // background, or around the frames, nothing is, and tldraw outlines the board.
      const frame = frameAt(area, store, pointer.current.point!, session.editor)
      if (!frame || frame.entry.container.locked) {
        selection.setHover(undefined)
        return
      }
      const hit = hitInFrame(frame.entry, frame.host, pointer.current.point!)
      const node = hoverTarget(underPoint(hit), selectedIn(hit, selection.get()), pointer.current)
      selection.setHover(node ? { design: hit.entry.key, node, mode: hit.mode, state: hit.state } : undefined)
    }
    const onPointerLeave = () => {
      pointer.current = { ...pointer.current, point: undefined }
      selection.setHover(undefined)
    }
    const onKey = (event: KeyboardEvent) => {
      pointer.current = { ...pointer.current, alt: event.altKey, deep: event.ctrlKey || event.metaKey }
      if (event.key === "Alt") event.preventDefault()
    }

    area.addEventListener("pointerdown", onPointerDown, { capture: true })
    area.addEventListener("dblclick", onDoubleClick, { capture: true })
    area.addEventListener("pointermove", onPointerMove)
    area.addEventListener("pointerleave", onPointerLeave)
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    return () => {
      area.removeEventListener("pointerdown", onPointerDown, { capture: true })
      area.removeEventListener("dblclick", onDoubleClick, { capture: true })
      area.removeEventListener("pointermove", onPointerMove)
      area.removeEventListener("pointerleave", onPointerLeave)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
  }, [session])

  // Outlines follow the camera, layout changes, animations and drags, so they're measured when one of those can have
  // moved them, not every frame (PAR-522, see `@parity-app/editor`'s overlay-measuring.ts): each change measures every
  // frame for a moment, and after that only while an animation runs in a frame drawn over. Measuring rests otherwise.
  // The camera is followed apart from that, in the frame it moves (PAR-653): see `followCamera` below.
  useEffect(() => {
    const { selection, store, editor } = session
    const area = rootRef.current?.parentElement
    if (!area) return undefined
    let frame = 0
    let last = ""
    let until = 0
    const showing = () =>
      !!selection.get().design || !!selection.getHover()?.node || !!getDragView() || getPreferences().layoutGrid
    const designs = () =>
      overlayDesigns({
        selected: selection.get().design,
        hovered: selection.getHover()?.design,
        layoutGrid: getPreferences().layoutGrid
      })
    const animating = () => {
      const drawn = designs()
      return allFrames(area).some((host) => drawsOver(drawn, host.dataset.design) && animates(host))
    }
    const draw = (now: boolean) => {
      if (area.closest("[hidden]")) return
      // Interacting, outlines and handles would sit over the components being tried.
      const next = selection.getTool() === "interact" ? empty : measure(session, area, pointer.current.alt)
      const serialized = JSON.stringify(next)
      if (serialized === last) return
      last = serialized
      if (now) flushSync(() => setModel(next))
      else setModel(next)
    }
    const tick = () => {
      frame = 0
      if (measuresNext({ now: performance.now(), until, showing: showing(), animating }))
        frame = requestAnimationFrame(tick)
      draw(false)
    }
    // The camera moves in tldraw's own animation frame, which moves the canvas and has boards' gutters follow the zoom
    // (PAR-602). Measured in an animation frame of its own, outlines were drawn from before the camera moved or after,
    // and laid the page out partway through the frame; and drawn from React state, they were painted a frame late. So
    // once the camera has moved, the outlines are measured when the frame has been laid out, and drawn before it's
    // painted: a ResizeObserver's callbacks run then, after every animation frame callback, so the camera changes the
    // size of a hidden element to be called.
    const ticker = tickerRef.current
    const followCamera = () => {
      if (!ticker || !showing()) return
      ticker.style.width = ticker.style.width === "1px" ? "2px" : "1px"
    }
    const laidOut = new ResizeObserver(() => draw(true))
    if (ticker) laidOut.observe(ticker)
    const wake = () => {
      until = settleUntil(performance.now(), until)
      frame ||= requestAnimationFrame(tick)
    }
    // A frame's change wakes measuring only when it's drawn over.
    const wakeFor = (host: HTMLElement) => {
      if (drawsOver(designs(), host.dataset.design)) wake()
    }

    // The canvas area resizing or showing again, and frames changing size.
    const resizes = new ResizeObserver((entries) => {
      const drawn = designs()
      const moved = ({ target }: ResizeObserverEntry) =>
        target === area || (target instanceof HTMLElement && drawsOver(drawn, target.dataset.design))
      if (entries.some(moved)) wake()
    })
    resizes.observe(area)
    // What frames draw changing: React committing, a component's own DOM and style writes, a class starting a
    // transition, an image loading.
    const watched = new Map<HTMLElement, () => void>()
    const watch = (host: HTMLElement, mounted: boolean) => {
      const shadow = host.shadowRoot
      if (!mounted || !area.contains(host)) {
        watched.get(host)?.()
        watched.delete(host)
        resizes.unobserve(host)
        return
      }
      resizes.observe(host)
      if (!shadow || watched.has(host)) return
      const changes = new MutationObserver(() => wakeFor(host))
      changes.observe(shadow, { subtree: true, childList: true, attributes: true, characterData: true })
      const loaded = () => wakeFor(host)
      shadow.addEventListener("load", loaded, true)
      watched.set(host, () => {
        changes.disconnect()
        shadow.removeEventListener("load", loaded, true)
      })
    }
    for (const host of allFrames(area)) watch(host, true)
    const stopFrames = subscribeFrames((host, mounted) => {
      watch(host, mounted)
      if (area.contains(host)) wakeFor(host)
    })

    // The selection, hover, tool and preferences; the designs; tldraw's boards; and the pointer and keys, which drive
    // drags, snapping, resizing and Alt's redlines. The camera, and the wheel that moves it, are left to `followCamera`,
    // which measures once in each frame the camera moves; measuring every frame as well would lay the page out twice.
    const stopSelection = selection.subscribe(wake)
    const stopPreferences = subscribePreferences(wake)
    const stopStore = store.subscribe(wake)
    const stopEditor = editor?.store.listen(({ changes }) => {
      const types = (records: Record<string, TLRecord>) => Object.values(records).map((record) => record.typeName)
      const change = {
        added: types(changes.added),
        updated: Object.values(changes.updated).map(([from, to]) => ({
          type: to.typeName,
          fields: Object.keys(to).filter((field) => from[field as keyof TLRecord] !== to[field as keyof TLRecord])
        })),
        removed: types(changes.removed)
      }
      if (!movesOnlyTheView(change)) wake()
    })
    const stopCamera =
      editor &&
      react("overlay follows the camera", () => {
        editor.getCamera()
        followCamera()
      })
    const inputs = ["pointermove", "pointerdown", "pointerup", "pointercancel", "keydown", "keyup"]
    for (const type of inputs) window.addEventListener(type, wake, { capture: true, passive: true })
    document.fonts.addEventListener("loadingdone", wake)
    wake()
    return () => {
      cancelAnimationFrame(frame)
      laidOut.disconnect()
      resizes.disconnect()
      for (const stop of watched.values()) stop()
      stopFrames()
      stopSelection()
      stopPreferences()
      stopStore()
      stopEditor?.()
      stopCamera?.()
      for (const type of inputs) window.removeEventListener(type, wake, { capture: true })
      document.fonts.removeEventListener("loadingdone", wake)
    }
  }, [session])

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[300] overflow-hidden">
      {/* Resized as the camera moves, to measure once the frame is laid out (see followCamera). */}
      <div ref={tickerRef} aria-hidden className="invisible absolute top-0 left-0 h-0" />
      <FrameDrawingView />
      {model.outlines.map((outline) => (
        <div
          key={outline.key}
          className="absolute rounded-[1px]"
          style={{
            left: outline.box.x,
            top: outline.box.y,
            width: outline.box.w,
            height: outline.box.h,
            outline: `${outline.thick ? 2 : 1}px ${outline.dashed ? "dashed" : "solid"} ${outline.color}`
          }}
        />
      ))}
      {model.label && !editing && (
        <>
          <div
            className="absolute -translate-y-full truncate rounded-t px-1.5 py-px text-2xs font-medium tabular-nums"
            style={{
              left: model.label.box.x - 1,
              top: model.label.box.y - 1,
              maxWidth: Math.max(model.label.box.w, 80),
              ...chipFor(model.label.color)
            }}
          >
            {model.label.counted ? model.label.name : <Name>{model.label.name}</Name>}
          </div>
          <div
            className="absolute -translate-x-1/2 rounded px-1.5 py-px text-2xs font-medium tabular-nums"
            style={{
              left: model.label.box.x + model.label.box.w / 2,
              top: model.label.box.y + model.label.box.h + 6,
              ...chipFor(model.label.color)
            }}
          >
            {model.label.size}
          </div>
        </>
      )}
      {model.frameSize && !editing && (
        <div
          className="absolute -translate-x-1/2 rounded px-1.5 py-px text-2xs font-medium tabular-nums"
          style={{
            left: model.frameSize.box.x + model.frameSize.box.w / 2,
            top: model.frameSize.box.y + model.frameSize.box.h + 6,
            ...chipColors.layer
          }}
        >
          {model.frameSize.size}
        </div>
      )}
      {model.slots?.map((slot) => (
        <div
          key={slot.key}
          className="absolute rounded-[2px]"
          style={{
            left: slot.box.x,
            top: slot.box.y,
            width: slot.box.w,
            height: slot.box.h,
            outline: `1px dashed ${kindColors.component}`,
            outlineOffset: 2
          }}
        >
          <span
            className="absolute -top-[3px] -left-[3px] flex -translate-y-full items-center gap-1 rounded-[3px] px-1 font-mono text-2xs whitespace-nowrap"
            style={{
              background: `color-mix(in oklch, ${kindColors.component} 16%, var(--background))`,
              // A step off the component color, so the name is 4.5:1 on the tint in either theme (see styles.css).
              color: "var(--canvas-slot-chip-text)"
            }}
          >
            <SquareDashed className="size-2.5" />
            {slot.name}
          </span>
        </div>
      ))}
      {model.columns?.map((column) => (
        <div
          key={column.key}
          className="absolute bg-red-500/10"
          style={{ left: column.box.x, top: column.box.y, width: column.box.w, height: column.box.h }}
        />
      ))}
      {model.spacing?.map((area) => (
        <div
          key={area.key}
          className="absolute"
          style={{
            left: area.box.x,
            top: area.box.y,
            width: area.box.w,
            height: area.box.h,
            background:
              area.kind === "padding"
                ? "repeating-linear-gradient(-45deg, oklch(0.7 0.2 350 / 0.28) 0 1px, oklch(0.7 0.2 350 / 0.1) 1px 5px)"
                : "repeating-linear-gradient(45deg, oklch(0.7 0.2 350 / 0.35) 0 1px, oklch(0.7 0.2 350 / 0.14) 1px 5px)"
          }}
        />
      ))}
      {model.redlines.map((line, index) => (
        <RedlineView key={index} line={line} />
      ))}
      {model.drag && (
        <>
          {model.drag.ghost && (
            <div
              className="absolute rounded-[2px]"
              style={{
                left: model.drag.ghost.x,
                top: model.drag.ghost.y,
                width: model.drag.ghost.w,
                height: model.drag.ghost.h,
                outline: `1px dashed ${kindColors.layer}`,
                background: `color-mix(in oklch, ${kindColors.layer} 12%, transparent)`
              }}
            />
          )}
          {model.drag.line && (
            <div
              className="absolute rounded-full"
              style={{
                left: model.drag.line.x,
                top: model.drag.line.y,
                width: model.drag.line.w,
                height: model.drag.line.h,
                background: kindColors.layer,
                boxShadow: `0 0 0 1px white`
              }}
            />
          )}
        </>
      )}
      {!editing && model.spacingHandles && (
        <SpacingHandlesFor
          session={session}
          spacing={model.spacingHandles}
          dragging={spacingDrag}
          onDrag={setSpacingDrag}
        />
      )}
      {!editing &&
        model.handles.map((handles) => (
          <ResizeHandles
            key={handles.key}
            handles={handles}
            onStart={(edge, event) => {
              const area = rootRef.current?.parentElement
              if (area) startResize(session, area, handles, edge, event)
            }}
            onReset={(edge, fill) => resetSize(session, handles, edge, fill)}
          />
        ))}
      {editing && <TextEditor key={`${editing.design}/${editing.node}`} />}
    </div>
  )
}

/** A selected layout's padding and gap handles, wired to the store through `spacing-edit.ts`. */
function SpacingHandlesFor({
  session,
  spacing,
  dragging,
  onDrag
}: {
  session: ProjectSession
  spacing: NonNullable<Model["spacingHandles"]>
  dragging: ({ key: string } & SpacingEdit) | undefined
  onDrag: (edit: ({ key: string } & SpacingEdit) | undefined) => void
}) {
  const { target, measure } = spacing
  const tokens = session.tokens.get()
  return (
    <SpacingHandles
      handles={spacingHandles(measure.layout)}
      unit={spacingUnit(tokens)}
      tokens={lengthTokens(tokens)}
      valueOf={(handle) => spacingValue(session, target, handle, measure)}
      dragging={dragging}
      onPress={(handle, event, type) =>
        pressSpacing(
          session,
          target,
          handle,
          measure,
          event,
          (edit) => onDrag(edit && { key: spacingKey(handle), ...edit }),
          type
        )
      }
      onType={(handle, text, keys) => typeSpacing(session, target, handle, measure, text, keys)}
      onPick={(handle, value, keys) => pickSpacing(session, target, handle, measure, value, keys)}
      onStep={(handle, count, keys) => stepSpacing(session, target, handle, measure, count, keys)}
    />
  )
}

/** Whether an animation or a transition runs in a frame, which the outlines over it follow as it goes. */
function animates(host: HTMLElement): boolean {
  return !!host.shadowRoot?.getAnimations().some((animation) => animation.playState === "running")
}

/** Whether a free text note is under a point, whose double-click tldraw handles to edit it. */
function overNote(session: ProjectSession, point: Point): boolean {
  const editor = session.editor
  if (!editor) return false
  return editor.getShapeAtPoint(editor.screenToPage(point), { hitInside: true })?.type === "canvas-note"
}

function selectHit(session: ProjectSession, hit: Hit, node: string | undefined): void {
  if (!node || node === hit.entry.container.root.id) session.selection.set({ design: hit.entry.key })
  else session.selection.set({ design: hit.entry.key, node, mode: hit.mode, state: hit.state })
}

function measure(session: ProjectSession, area: HTMLElement, alt: boolean): Model {
  const { selection, store, editor } = session
  if (!editor) return empty
  const current = selection.get()
  const hover = selection.getHover()
  const areaRect = area.getBoundingClientRect()
  const toBox = (rect: DOMRect): Box => ({
    x: rect.left - areaRect.left,
    y: rect.top - areaRect.top,
    w: rect.width,
    h: rect.height
  })
  const model: Model = { outlines: [], redlines: [], handles: [] }
  const entry = current.design ? store.getEntry(current.design) : undefined
  const picked = entry ? selectionFrame(area, entry.key, current) : undefined

  let selectedRect: DOMRect | undefined
  // While layers are dragged they are hidden where they were, so they have no outline there. An absolutely placed layer
  // moves itself, so its outline follows it.
  const layers = entry && !getDragView()?.ghost ? selectedNodes(current) : []
  // Locked layers keep their outline but take no handles, so they're changed only from the panels (PAR-192).
  const locked = layers.some((id) => isLocked(entry!.container, id))
  const pickedRects: DOMRect[] = []
  for (const id of layers) {
    const node = findLayer(store, entry!.container, id)
    // Inside an instance everything is the component's, so it's drawn in the component's color.
    let color: string = kindColors.layer
    if (isInnerPath(id)) color = kindColors.component
    else if (node) color = nodeColor(node)
    for (const { host, rect, picked: isPicked } of nodeInFrames(area, entry!.key, id, picked)) {
      model.outlines.push({
        key: `sel:${id}:${host.dataset.mode}:${host.dataset.state}`,
        box: toBox(rect),
        color,
        dashed: !isPicked,
        thick: isPicked
      })
      if (!isPicked) continue
      pickedRects.push(rect)
      if (id !== current.node) continue
      selectedRect = rect
      if (layers.length > 1) continue
      const scale = editor.getZoomLevel() * frameScale(host)
      model.label = {
        box: toBox(rect),
        name: node ? layerLabel(node, store.getEntries(), store.getComponentLibrary()) : id,
        size: `${formatPx(rect.width / scale)} × ${formatPx(rect.height / scale)}`,
        color
      }
      // A locked layer, selected from Layers, isn't resized on the canvas (PAR-192).
      if (selection.getTool() === "select" && !getDragView() && !isInnerPath(id) && !locked) {
        model.handles.push({
          kind: "node",
          key: "node",
          box: toBox(rect),
          color,
          edges: nodeEdges,
          design: entry!.key,
          mode: host.dataset.mode ?? "",
          state: host.dataset.state ?? "",
          node: id
        })
      }
    }
  }
  // Several layers: one box around them all, with their count and its size.
  if (layers.length > 1 && pickedRects.length > 0 && picked) {
    const left = Math.min(...pickedRects.map((rect) => rect.left))
    const top = Math.min(...pickedRects.map((rect) => rect.top))
    const right = Math.max(...pickedRects.map((rect) => rect.right))
    const bottom = Math.max(...pickedRects.map((rect) => rect.bottom))
    const box = { x: left - areaRect.left, y: top - areaRect.top, w: right - left, h: bottom - top }
    const scale = editor.getZoomLevel() * frameScale(picked)
    model.outlines.push({ key: "union", box, color: kindColors.layer, dashed: false, thick: false })
    // Resized together by handles on that box, unless one is inside an instance, which keeps the component's size.
    if (selection.getTool() === "select" && !getDragView() && !layers.some(isInnerPath) && !locked) {
      model.handles.push({
        kind: "node",
        key: "union",
        box,
        color: kindColors.layer,
        edges: nodeEdges,
        design: entry!.key,
        mode: picked.dataset.mode ?? "",
        state: picked.dataset.state ?? "",
        nodes: layers
      })
    }
    model.label = {
      box,
      name: `${layers.length} layers`,
      size: `${formatPx((right - left) / scale)} × ${formatPx((bottom - top) / scale)}`,
      color: kindColors.layer,
      counted: true
    }
  }
  const drag = getDragView()
  if (drag) model.drag = drag

  if (entry?.container.kind === "frame" && !current.node) {
    const host = findFrames(area, entry.key)[0]
    if (host) {
      const rect = host.getBoundingClientRect()
      const scale = editor.getZoomLevel() * frameScale(host)
      model.frameSize = {
        box: toBox(rect),
        size: `${formatPx(rect.width / scale)} × ${formatPx(rect.height / scale)}`
      }
    }
  }

  if (entry && picked && !drag) {
    const slots = designSlots(entry.container).flatMap(({ name, node }) =>
      nodeInFrames(area, entry.key, node.id, picked)
        .filter((item) => item.picked)
        .map(({ rect }) => ({ key: `slot:${node.id}`, box: toBox(rect), name }))
    )
    if (slots.length > 0) model.slots = slots
  }

  if (entry && !current.node && selection.getTool() === "select" && !entry.container.locked) {
    for (const host of findFrames(area, entry.key)) {
      model.handles.push({
        kind: "frame",
        key: `frame:${host.dataset.mode}:${host.dataset.state}`,
        box: toBox(host.getBoundingClientRect()),
        color: designColor(entry.container.kind),
        edges: frameEdges,
        ...(entry.container.kind === "frame" ? { label: "Drag to resize the frame" } : {}),
        design: entry.key,
        mode: host.dataset.mode ?? "",
        state: host.dataset.state ?? ""
      })
    }
  }

  if (hover?.node && !(hover.design === current.design && hover.node === current.node)) {
    const hoverEntry = store.getEntry(hover.design)
    const node = hoverEntry && findLayer(store, hoverEntry.container, hover.node)
    // In the frame under the pointer; hovered in Layers, in the frame the selection was picked in.
    let frame
    if (hover.mode !== undefined) frame = findFrames(area, hover.design, { mode: hover.mode, state: hover.state })[0]
    else frame = hover.design === current.design ? picked : selectionFrame(area, hover.design, {})
    const target = nodeInFrames(area, hover.design, hover.node, frame).find((item) => item.picked)
    if (target && node) {
      const { rect } = target
      const color = isInnerPath(hover.node) ? kindColors.component : nodeColor(node)
      model.outlines.push({ key: "hover", box: toBox(rect), color, dashed: false, thick: false })
      const scale = editor.getZoomLevel() * frameScale(target.host)
      const unit = spacingUnit(session.tokens.get())
      const toArea = (line: Redline): Redline => ({
        ...line,
        x1: line.x1 - areaRect.left,
        x2: line.x2 - areaRect.left,
        y1: line.y1 - areaRect.top,
        y2: line.y2 - areaRect.top
      })
      // Measured from the selected layer as the hovered frame draws it.
      let from: DOMRect | undefined
      if (target.host === picked) from = selectedRect
      else if (hover.design === current.design && current.node && !getDragView())
        from = nodeBox(target.host, current.node)
      if (alt && from) {
        model.redlines = redlines(from, rect, scale, unit).map(toArea)
      } else if (alt && !selectedRect && hoverEntry) {
        // Nothing selected to measure from: Alt shows the hovered layer's distances to the edges of its parent.
        const parent = locateNode(hoverEntry.container.root, hover.node)?.ancestors.at(-1)
        const parentRect = parent && nodeBox(target.host, parent.id)
        if (parentRect) model.redlines = redlines(rect, parentRect, scale, unit).map(toArea)
      }
    }
  }

  // A layer snapping as it's moved or resized shows its distances to what it lines up with.
  const snapped = getSnapMeasures()
  if (snapped.length > 0) {
    const unit = spacingUnit(session.tokens.get())
    model.redlines = snapped.flatMap(({ from, to, length }) =>
      Math.hypot(to.x - from.x, to.y - from.y) < 0.5
        ? []
        : [
            redline(
              { x: from.x - areaRect.left, y: from.y - areaRect.top },
              { x: to.x - areaRect.left, y: to.y - areaRect.top },
              length,
              unit
            )
          ]
    )
  }

  // A selected layout shows the space inside it: padding along its edges, gaps between its children.
  const single = layers.length === 1 ? layers[0] : undefined
  const layout = entry && single ? findLayer(store, entry.container, single) : undefined
  if (single && layout?.type === "layout" && picked && !getDragView()) {
    const element = findNodeElement(picked, single)
    // Inside an instance, the children's ids carry the same prefix as the layout's.
    const prefix = single.slice(0, single.lastIndexOf("/") + 1)
    const children = layout.children.map((child) => findNodeElement(picked, `${prefix}${child.id}`))
    if (element) model.spacing = layoutSpacing(element, children, toBox)
    // Its padding and gaps take handles, except inside an instance, where they're the component's (PAR-169).
    if (element && selection.getTool() === "select" && !isInnerPath(single) && !locked) {
      model.spacingHandles = {
        target: {
          design: entry!.key,
          mode: picked.dataset.mode ?? "",
          state: picked.dataset.state ?? "",
          node: single
        },
        measure: measureSpacing(element, children, (rect) => ({
          left: rect.left - areaRect.left,
          top: rect.top - areaRect.top,
          right: rect.right - areaRect.left,
          bottom: rect.bottom - areaRect.top
        }))
      }
    }
  }

  if (getPreferences().layoutGrid) model.columns = layoutColumns(area, editor.getZoomLevel(), toBox)
  return model
}

/** The padding and gap areas of a laid out element, in screen pixels, for the children that render. */
function layoutSpacing(
  element: HTMLElement,
  children: (HTMLElement | undefined)[],
  toBox: (rect: DOMRect) => Box
): Spacing[] {
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const scale = rect.width / Math.max(1, element.offsetWidth)
  const side = (name: string) => (parseFloat(style.getPropertyValue(name)) || 0) * scale
  const border = {
    top: side("border-top-width"),
    right: side("border-right-width"),
    bottom: side("border-bottom-width"),
    left: side("border-left-width")
  }
  const padding = {
    top: side("padding-top"),
    right: side("padding-right"),
    bottom: side("padding-bottom"),
    left: side("padding-left")
  }
  const inner = {
    left: rect.left + border.left,
    right: rect.right - border.right,
    top: rect.top + border.top,
    bottom: rect.bottom - border.bottom
  }
  const box = (left: number, top: number, right: number, bottom: number) =>
    toBox(new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top)))
  const areas: Spacing[] = []
  if (padding.top > 0.5)
    areas.push({
      key: "pad-top",
      kind: "padding",
      box: box(inner.left, inner.top, inner.right, inner.top + padding.top)
    })
  if (padding.bottom > 0.5)
    areas.push({
      key: "pad-bottom",
      kind: "padding",
      box: box(inner.left, inner.bottom - padding.bottom, inner.right, inner.bottom)
    })
  if (padding.left > 0.5)
    areas.push({
      key: "pad-left",
      kind: "padding",
      box: box(inner.left, inner.top + padding.top, inner.left + padding.left, inner.bottom - padding.bottom)
    })
  if (padding.right > 0.5)
    areas.push({
      key: "pad-right",
      kind: "padding",
      box: box(inner.right - padding.right, inner.top + padding.top, inner.right, inner.bottom - padding.bottom)
    })
  // Gaps only make sense in a single line of children; a wrapping layout or a grid has them in two directions.
  if (!style.display.includes("flex") || style.flexWrap !== "nowrap") return areas
  const row = style.flexDirection.startsWith("row")
  const content = {
    left: inner.left + padding.left,
    right: inner.right - padding.right,
    top: inner.top + padding.top,
    bottom: inner.bottom - padding.bottom
  }
  const rects = children
    .flatMap((child) =>
      child && getComputedStyle(child).position !== "absolute" ? [child.getBoundingClientRect()] : []
    )
    .filter((child) => child.width > 0 || child.height > 0)
    .sort((a, b) => (row ? a.left - b.left : a.top - b.top))
  for (let index = 1; index < rects.length; index++) {
    const previous = rects[index - 1]!
    const next = rects[index]!
    const gap = row ? next.left - previous.right : next.top - previous.bottom
    if (gap < 0.5) continue
    areas.push({
      key: `gap-${index}`,
      kind: "gap",
      box: row
        ? box(previous.right, content.top, next.left, content.bottom)
        : box(content.left, previous.bottom, content.right, next.top)
    })
  }
  return areas
}

/**
 * Column grids, sized for each frame's width the way most design systems lay pages out: 4 columns on phones, 8 on
 * tablets, 12 on wider screens, with margins and gutters growing to match.
 */
function layoutColumns(area: HTMLElement, zoom: number, toBox: (rect: DOMRect) => Box): { key: string; box: Box }[] {
  const columns: { key: string; box: Box }[] = []
  const view = area.getBoundingClientRect()
  for (const host of allFrames(area)) {
    const rect = host.getBoundingClientRect()
    if (rect.right < view.left || rect.left > view.right || rect.bottom < view.top || rect.top > view.bottom) continue
    const scale = zoom * frameScale(host)
    const width = rect.width / scale
    let grid = { count: 12, margin: 32, gutter: 24 }
    if (width < 600) grid = { count: 4, margin: 16, gutter: 16 }
    else if (width < 1024) grid = { count: 8, margin: 24, gutter: 24 }
    const column = (width - grid.margin * 2 - grid.gutter * (grid.count - 1)) / grid.count
    if (column <= 0) continue
    for (let index = 0; index < grid.count; index++) {
      const left = rect.left + (grid.margin + index * (column + grid.gutter)) * scale
      columns.push({
        key: `${host.dataset.design}:${host.dataset.mode}:${host.dataset.state}:${index}`,
        box: toBox(new DOMRect(left, rect.top, column * scale, rect.height))
      })
    }
  }
  return columns
}

/**
 * Distances between the selected box and another, Figma style: to each edge of a box that contains it (padding),
 * otherwise the gaps between them on each axis.
 */
export function redlines(a: DOMRect, b: DOMRect, scale: number, unit: number): Redline[] {
  const box = (rect: DOMRect) => ({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
  return distancesBetween(box(a), box(b)).flatMap(({ from, to, length }) =>
    length < 0.5 ? [] : [redline(from, to, length / scale, unit)]
  )
}

/** A distance to draw, from and to points on screen, `length` pixels of the design long. */
function redline(from: Point, to: Point, length: number, unit: number): Redline {
  const px = Math.round(length * 10) / 10
  const steps = px / unit
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, px, steps: Number.isInteger(steps * 2) ? steps : undefined }
}

/**
 * Resizing by a handle, by `@parity-app/editor`'s rules: a frame's by `frameResize`, a layer's by `layerResize`. This
 * measures the layer or the frame when the drag begins, and for an absolutely placed layer where its sides are drawn
 * and what its edges snap to (see `LayerSnapping`), and writes the style or size each pointer move gives. The drag
 * writes as it goes, as one undo step: Escape takes it all back, and the pointer cancelled or the window losing focus
 * keeps what it did (see `gestures.resize`).
 */
function startResize(
  session: ProjectSession,
  area: HTMLElement,
  handles: Handles,
  edge: Edge,
  event: ReactPointerEvent
): void {
  const { store, editor, tokens } = session
  const entry = store.getEntry(handles.design)
  const host = findFrames(area, handles.design, { mode: handles.mode, state: handles.state })[0]
  if (!entry || !editor || !host) return
  const scale = editor.getZoomLevel() * frameScale(host)
  const start = { clientX: event.clientX, clientY: event.clientY }
  const pointer = (moveEvent: PointerEvent) => ({
    dx: moveEvent.clientX - start.clientX,
    dy: moveEvent.clientY - start.clientY
  })
  let last = ""

  if (handles.kind === "frame") {
    const mode = resolveModes(store.getModes()).find((candidate) => candidate.id === handles.mode)
    if (!mode) return
    const resize = frameResize({ design: entry.container, mode, edge, rect: host.getBoundingClientRect(), scale })
    const label = entry.container.kind === "frame" ? "Resize frame" : "Resize preview"
    followPress(gestures.resize, store, start, {
      design: entry.key,
      cursor: resizeCursors[edge],
      move(moveEvent, { gesture }) {
        const next = resize(pointer(moveEvent))
        const serialized = JSON.stringify(next)
        if (serialized === last) return
        last = serialized
        store.updateContainer(entry.key, label, (container) => withFrame(container, mode.viewport, next), {
          gesture
        })
      }
    })
    return
  }

  if (handles.nodes) {
    resizeLayers(session, area, handles, handles.nodes, edge, event)
    return
  }

  const layer = handles.node
  const element = layer ? findNodeElement(host, layer) : undefined
  const rect = layer ? nodeBox(host, layer) : undefined
  const frame = store.editFrame(handles)
  if (!layer || !element || !rect || !frame) return
  const { state } = frame
  // The layer and its layout as the frame being resized in shows them: its state, variants and viewport.
  const shown = resizeStart(entry.container, layer, { state, viewport: frame.viewport })
  if (!shown) return
  const unit = spacingUnit(tokens.get())
  // An absolutely placed layer resizes by its insets, from where its sides are drawn, and its dragged edges snap.
  const drawn =
    shown.style.position === "absolute"
      ? frameDrawn(area, handles.design, { mode: handles.mode, state: handles.state }, unit).insets(layer)
      : undefined
  const snapping = drawn ? LayerSnapping.measure(editor, host, entry.container, layer, scale) : undefined
  const resize = layerResize({
    edge,
    layer: shown,
    rect,
    inner: contentBox(element.parentElement, scale),
    scale,
    unit,
    drawn,
    snapping
  })

  followPress(gestures.resize, store, start, {
    design: entry.key,
    cursor: resizeCursors[edge],
    move(moveEvent, drag) {
      const { style, snapped } = resize({
        ...pointer(moveEvent),
        shift: moveEvent.shiftKey,
        // From the middle, with the keymap's keys for it: Alt (PAR-169).
        centre: holds(moveEvent, held.fromMiddle.keys),
        snaps: snapping?.snaps(moveEvent) ?? false
      })
      snapping?.show(snapped)
      if (!style) return
      const serialized = JSON.stringify(style)
      if (serialized === last) return
      last = serialized
      store.updateContainer(
        entry.key,
        "Resize layer",
        (container) => editNode(container, boardTarget(container, state.id), layer, { style }),
        { gesture: drag.gesture }
      )
    },
    // The snap guides go when the drag ends, however it ends.
    end: () => snapping?.clear()
  })
}

/**
 * Several selected layers resized together by a handle on the box around them all (PAR-169), by `layersResize`: each
 * from its own box, as the frame shows it, taking its share of the movement. They don't snap. Each move writes them all
 * as one change, in the drag's one undo step.
 */
function resizeLayers(
  session: ProjectSession,
  area: HTMLElement,
  handles: Handles,
  layers: readonly string[],
  edge: Edge,
  event: ReactPointerEvent
): void {
  const { store, editor, tokens } = session
  const entry = store.getEntry(handles.design)
  const host = findFrames(area, handles.design, { mode: handles.mode, state: handles.state })[0]
  const frame = store.editFrame(handles)
  if (!entry || !editor || !host || !frame) return
  const scale = editor.getZoomLevel() * frameScale(host)
  const unit = spacingUnit(tokens.get())
  const drawn = frameDrawn(area, handles.design, { mode: handles.mode, state: handles.state }, unit)
  const starts = layers.flatMap((id) => {
    const element = findNodeElement(host, id)
    const rect = nodeBox(host, id)
    const shown = resizeStart(entry.container, id, { state: frame.state, viewport: frame.viewport })
    if (!element || !rect || !shown) return []
    return [
      {
        id,
        start: {
          edge,
          layer: shown,
          rect,
          inner: contentBox(element.parentElement, scale),
          scale,
          unit,
          drawn: shown.style.position === "absolute" ? drawn.insets(id) : undefined
        }
      }
    ]
  })
  if (starts.length === 0) return
  const union = {
    left: Math.min(...starts.map(({ start }) => start.rect.left)),
    top: Math.min(...starts.map(({ start }) => start.rect.top)),
    right: Math.max(...starts.map(({ start }) => start.rect.right)),
    bottom: Math.max(...starts.map(({ start }) => start.rect.bottom))
  }
  const resize = layersResize(
    starts.map(({ start }) => start),
    union
  )
  const start = { clientX: event.clientX, clientY: event.clientY }
  let last = ""
  followPress(gestures.resize, store, start, {
    design: entry.key,
    cursor: resizeCursors[edge],
    move(moveEvent, drag) {
      const styles = resize({
        dx: moveEvent.clientX - start.clientX,
        dy: moveEvent.clientY - start.clientY,
        shift: moveEvent.shiftKey,
        centre: holds(moveEvent, held.fromMiddle.keys),
        snaps: false
      })
      if (styles.every((style) => style === undefined)) return
      const serialized = JSON.stringify(styles)
      if (serialized === last) return
      last = serialized
      store.updateContainer(
        entry.key,
        "Resize layers",
        (container) =>
          starts.reduce((next, { id }, index) => {
            const style = styles[index]
            return style ? editNode(next, boardTarget(next, frame.state.id), id, { style }) : next
          }, container),
        { gesture: drag.gesture }
      )
    }
  })
}

/**
 * Double-clicking a handle: a frame goes back to its viewport's width or its content's height; a layer's size on the
 * handle's axes hugs its content, or with Alt fills its parent (PAR-169), for every layer the handle is on.
 */
function resetSize(session: ProjectSession, handles: Handles, edge: Edge, fill = false): void {
  const { store } = session
  const entry = store.getEntry(handles.design)
  if (!entry) return
  if (handles.kind === "frame") {
    const mode = resolveModes(store.getModes()).find((candidate) => candidate.id === handles.mode)
    if (!mode) return
    const { container } = entry
    const next = frameSizeReset(container.kind === "frame" ? container.size : container.frames?.[mode.viewport], edge)
    const label = container.kind === "frame" ? "Reset frame size" : "Reset preview size"
    store.updateContainer(entry.key, label, (current) => withFrame(current, mode.viewport, next))
    return
  }
  const layers = handles.nodes ?? (handles.node ? [handles.node] : [])
  const frame = store.editFrame(handles)
  if (layers.length === 0 || !frame) return
  store.updateContainer(frame.design, fill ? "Set to fill" : "Set to hug", (container) =>
    layers.reduce((next, layer) => {
      const shown = resizeStart(next, layer, { state: frame.state, viewport: frame.viewport })
      return editNode(next, boardTarget(next, frame.state.id), layer, { style: layerSizeReset(edge, fill, shown) })
    }, container)
  )
}

/** The box a parent lays its children out in, inside its padding and border, in screen pixels. */
function contentBox(parent: HTMLElement | null, scale: number) {
  if (!parent) return undefined
  const rect = parent.getBoundingClientRect()
  const style = getComputedStyle(parent)
  const side = (name: string) => (parseFloat(style.getPropertyValue(name)) || 0) * scale
  return {
    left: rect.left + side("padding-left") + side("border-left-width"),
    right: rect.right - side("padding-right") - side("border-right-width"),
    top: rect.top + side("padding-top") + side("border-top-width"),
    bottom: rect.bottom - side("padding-bottom") - side("border-bottom-width")
  }
}

/**
 * The text tool: inside a design, a text layer where a drop at the pointer would land (see `placeAtPoint`), in the
 * frame there; on the empty canvas, a text layer in a frame that hugs it (see `addFrameOfText`). Either way it's
 * edited in place at once. Over a design with no layout under the pointer, nothing.
 */
function addText(session: ProjectSession, area: ParentNode, point: Point): void {
  const { store, selection, editor } = session
  const place = placeAtPoint(session, area, point)
  if (place.kind === "none") return
  if (place.kind === "layout") {
    const { hit, here, frame } = place
    let node: string | undefined
    store.updateContainer(frame.design, "Add text", (container) => {
      const placed = pasteHere(container, [textLayer("Text")], here, frame.state, frame.viewport)
      node = placed.copies[0]
      return placed.container
    })
    if (!node) return
    const picked = { design: frame.design, node, mode: hit.mode, state: hit.state }
    selection.set(picked)
    // The layer renders on the next frame; edit it once it's there.
    requestAnimationFrame(() => requestAnimationFrame(() => selection.setEditing(picked)))
    return
  }
  if (!editor) return
  const page = editor.screenToPage(point)
  const { key, node } = addFrameOfText(session, "Text", page, "Add text")
  const mode = resolveModes(store.getModes())[0]?.id
  const state = store.getEntry(key)?.container.states[0]?.id
  if (!mode || !state) return
  const picked = { design: key, node, mode, state }
  // The frame renders on the next frame; its text is edited once it's there.
  requestAnimationFrame(() => requestAnimationFrame(() => selection.setEditing(picked)))
}

/**
 * The frame being dragged out with the frame tool: a white rectangle outlined in the layer color, with its size in the
 * canvas's pixels underneath as it grows, and a guide across the canvas at each edge it snapped to.
 */
function FrameDrawingView() {
  const drawing = useFrameDrawing()
  if (!drawing) return null
  const { box, size, guides } = drawing
  return (
    <>
      {guides.x !== undefined && (
        <div className="absolute inset-y-0 w-px" style={{ left: guides.x, background: kindColors.layer }} />
      )}
      {guides.y !== undefined && (
        <div className="absolute inset-x-0 h-px" style={{ top: guides.y, background: kindColors.layer }} />
      )}
      <div
        className="absolute bg-white/90"
        style={{
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          outline: `1.5px solid ${kindColors.layer}`
        }}
      >
        <span
          className="absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded px-1.5 py-px text-2xs font-medium whitespace-nowrap tabular-nums"
          style={chipColors.layer}
        >
          {formatPx(size.width)} × {formatPx(size.height)}
        </span>
      </div>
    </>
  )
}
