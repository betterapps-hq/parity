import {
  boardTarget,
  type ContainerSpec,
  type DesignNode,
  editNode,
  type FrameSize,
  frameSize,
  generateId,
  insertNode,
  isInnerPath,
  locateNode,
  nodeIds,
  nodeInState,
  type NodeStyle,
  resolveModes
} from "@parity/core"
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react"
import { Hint } from "../chrome/Hint.tsx"
import { editingState } from "../chrome/LayerPanel.tsx"
import { getPreferences, subscribePreferences } from "../chrome/preferences.ts"
import { findFrames, findNodeElement } from "../frame.ts"
import { selectedNodes, toggleLayer, useEditing } from "../selection.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { useProject } from "./context.ts"
import {
  frameAt,
  frameScale,
  type Hit,
  hitInFrame,
  hitTest,
  nodeInFrames,
  pickDeeper,
  pickNode,
  type Point,
  selectionFrame
} from "./hit.ts"
import { designColor, kindColors, layerLabel, nodeColor } from "./kinds.tsx"
import { type DragView, getDragView, pressLayers } from "./layer-drag.ts"
import { editLayer, findLayer } from "./layers.ts"

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Redline {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Layout pixels, as the design sees them. */
  px: number
  /** The spacing step the distance comes to, when it's a whole or half step. */
  steps?: number
}

/** A side or corner a resize handle sits on. */
type Edge = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw"

/** Resize handles around a selected layer, or around each frame of a selected design. */
interface Handles {
  kind: "node" | "frame"
  key: string
  box: Box
  color: string
  edges: Edge[]
  design: string
  mode: string
  state: string
  node?: string
}

/** Space inside a selected layout: its padding, and the gaps between its children. */
interface Spacing {
  key: string
  box: Box
  kind: "padding" | "gap"
}

interface Model {
  outlines: { key: string; box: Box; color: string; dashed: boolean; thick: boolean }[]
  label?: { box: Box; name: string; size: string; color: string }
  redlines: Redline[]
  handles: Handles[]
  drag?: DragView
  spacing?: Spacing[]
  /** Column grids over frames, from View > Layout grid. */
  columns?: { key: string; box: Box }[]
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
  const [model, setModel] = useState<Model>(empty)
  const pointer = useRef<{ point?: Point; alt: boolean; deep: boolean }>({ alt: false, deep: false })
  const editing = useEditing(session.selection)

  // Pointer handling, ahead of tldraw.
  useEffect(() => {
    const area = rootRef.current?.parentElement
    if (!area) return undefined
    const { store, selection } = session
    const interactive = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(
        "button, input, textarea, [role=menuitem], [role=option], .design-title, .state-label, .text-editor, .resize-handle"
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
      if (tool === "text") {
        event.stopPropagation()
        event.preventDefault()
        addText(session, hit, point)
        selection.setTool("select")
        return
      }
      const current = selection.get()
      const deep = event.ctrlKey || event.metaKey
      if (!hit) return
      const sameDesign = current.design === hit.entry.key
      if (!deep && !(sameDesign && current.node)) return
      const node = pickNode(hit, sameDesign ? current.node : undefined, deep)
      event.stopPropagation()
      event.preventDefault()
      const layer = node && node !== hit.entry.container.root.id ? node : undefined
      // Shift adds a layer to the selection, or takes it out.
      if (event.shiftKey) {
        if (layer) selection.set(toggleLayer(current, hit.entry.key, layer, hit))
        return
      }
      // Pressing a layer that's already selected keeps the whole selection, to drag it; a click without dragging
      // then selects just that layer.
      const already = sameDesign && !!layer && selectedNodes(current).includes(layer)
      if (!already) selectHit(session, hit, node)
      if (layer && tool === "select") pressLayers(session, area, event, () => already && selectHit(session, hit, layer))
    }

    const onDoubleClick = (event: MouseEvent) => {
      if (interactive(event.target) || selection.getTool() !== "select") return
      const hit = hitTest(area, store, { x: event.clientX, y: event.clientY }, session.editor)
      if (!hit) return
      const current = selection.get()
      const selected = current.design === hit.entry.key ? current.node : undefined
      event.stopPropagation()
      // Drilling in comes first, as in Figma: a double-click edits text only on a selected text layer that's the
      // deepest thing under the pointer, so there's nothing further to go into.
      const node = selected ? findLayer(store, hit.entry.container, selected) : undefined
      const deepest = hit.path.at(-1) === selected
      if (selected && node && deepest && editableText(node) !== undefined) {
        selection.set({ design: hit.entry.key, node: selected, mode: hit.mode, state: hit.state })
        selection.setEditing({ design: hit.entry.key, node: selected, mode: hit.mode, state: hit.state })
        return
      }
      const deeper = pickDeeper(hit, selected)
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
      const current = selection.get()
      // Hovering another design highlights nothing, unless Ctrl reaches into it or Alt measures it, so its layers aren't
      // measured.
      const frame = frameAt(area, store, pointer.current.point!, session.editor)
      if (!frame || (current.design !== frame.entry.key && !pointer.current.deep && !pointer.current.alt)) {
        selection.setHover(undefined)
        return
      }
      const hit = hitInFrame(frame.entry, frame.host, pointer.current.point!)
      const node = pointer.current.alt ? hit.path.at(-1) : pickNode(hit, current.node, pointer.current.deep)
      selection.setHover(node ? { design: hit.entry.key, node } : undefined)
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

  // Outlines follow the camera, layout changes and animations, so they're measured every frame while there are any:
  // while something is selected or hovered, layers are dragged or the layout grid shows. Otherwise measuring rests
  // until one of those changes.
  useEffect(() => {
    const { selection } = session
    let frame = 0
    let last = ""
    const drawing = () =>
      !!selection.get().design || !!selection.getHover()?.node || !!getDragView() || getPreferences().layoutGrid
    const tick = () => {
      frame = drawing() ? requestAnimationFrame(tick) : 0
      const root = rootRef.current
      const area = root?.parentElement
      if (!root || !area || area.closest("[hidden]")) return
      // Interacting, outlines and handles would sit over the components being tried.
      const next = session.selection.getTool() === "interact" ? empty : measure(session, area, pointer.current.alt)
      const serialized = JSON.stringify(next)
      if (serialized !== last) {
        last = serialized
        setModel(next)
      }
    }
    const wake = () => {
      frame ||= requestAnimationFrame(tick)
    }
    const stopSelection = selection.subscribe(wake)
    const stopPreferences = subscribePreferences(wake)
    wake()
    return () => {
      cancelAnimationFrame(frame)
      stopSelection()
      stopPreferences()
    }
  }, [session])

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[300] overflow-hidden">
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
            className="absolute -translate-y-full truncate rounded-t px-1.5 py-px text-[11px] font-medium text-white"
            style={{
              left: model.label.box.x - 1,
              top: model.label.box.y - 1,
              maxWidth: Math.max(model.label.box.w, 80),
              background: model.label.color
            }}
          >
            {model.label.name}
          </div>
          <div
            className="absolute -translate-x-1/2 rounded px-1.5 py-px text-[11px] text-white tabular-nums"
            style={{
              left: model.label.box.x + model.label.box.w / 2,
              top: model.label.box.y + model.label.box.h + 6,
              background: model.label.color
            }}
          >
            {model.label.size}
          </div>
        </>
      )}
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
      {!editing &&
        model.handles.map((handles) => (
          <ResizeHandles
            key={handles.key}
            handles={handles}
            onStart={(edge, event) => {
              const area = rootRef.current?.parentElement
              if (area) startResize(session, area, handles, edge, event)
            }}
            onReset={(edge) => resetSize(session, handles, edge)}
          />
        ))}
      {editing && <TextEditor key={`${editing.design}/${editing.node}`} />}
    </div>
  )
}

function RedlineView({ line }: { line: Redline }) {
  const horizontal = Math.abs(line.y2 - line.y1) < 0.5
  const color = line.steps === undefined ? "oklch(0.64 0.21 25)" : "oklch(0.66 0.2 20)"
  const box = horizontal
    ? { left: Math.min(line.x1, line.x2), top: line.y1, width: Math.abs(line.x2 - line.x1), height: 1 }
    : { left: line.x1, top: Math.min(line.y1, line.y2), width: 1, height: Math.abs(line.y2 - line.y1) }
  const mid = { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 }
  // The distance in pixels first, then the spacing token it matches, or a warning that it's off the scale.
  return (
    <>
      <div className="absolute" style={{ ...box, background: color }} />
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md bg-neutral-950 p-0.5 pl-1.5 text-[11px] whitespace-nowrap text-white tabular-nums shadow-lg ring-1 ring-white/10"
        style={{ left: mid.x, top: mid.y }}
      >
        <span className="font-semibold">{formatPx(line.px)}px</span>
        {line.steps === undefined ? (
          <span className="rounded bg-red-500/90 px-1 font-medium">off scale</span>
        ) : (
          <span className="rounded px-1 font-mono" style={{ background: color }}>
            spacing-{formatSteps(line.steps)}
          </span>
        )}
      </div>
    </>
  )
}

/** Edits a text layer in place, over the rendered text, then writes it to the state it was picked in. */
function TextEditor() {
  const session = useProject()
  const { selection, store } = session
  const editing = selection.getEditing()!
  const ref = useRef<HTMLTextAreaElement>(null)
  const [layout, setLayout] = useState<{ box: Box; style: React.CSSProperties; text: string }>()

  useEffect(() => {
    const area = ref.current?.closest(".canvas-area")
    const entry = store.getEntry(editing.design)
    const node = entry && findLayer(store, entry.container, editing.node)
    const host = area && selectionFrame(area, editing.design, editing)
    const element = host && nodeInFrames(area, editing.design, editing.node, host).find((item) => item.picked)?.element
    const text = node && editableText(node)
    if (!area || !host || !element || text === undefined || !session.editor) {
      selection.setEditing(undefined)
      return undefined
    }
    const scale = session.editor.getZoomLevel() * frameScale(host)
    const computed = getComputedStyle(element)
    const range = document.createRange()
    range.selectNodeContents(element)
    const textRect = range.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const areaRect = area.getBoundingClientRect()
    const rect = textRect.width > 0 ? textRect : elementRect
    const previousColor = element.style.color
    element.style.color = "transparent"
    setLayout({
      text,
      box: { x: rect.left - areaRect.left, y: rect.top - areaRect.top, w: Math.max(rect.width, 24), h: rect.height },
      style: {
        fontFamily: computed.fontFamily,
        fontSize: parseFloat(computed.fontSize) * scale,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight === "normal" ? "normal" : `${parseFloat(computed.lineHeight) * scale}px`,
        letterSpacing:
          computed.letterSpacing === "normal" ? "normal" : `${parseFloat(computed.letterSpacing) * scale}px`,
        color: computed.color,
        textAlign: computed.textAlign as React.CSSProperties["textAlign"]
      }
    })
    return () => {
      element.style.color = previousColor
    }
  }, [editing, session.editor, selection, store])

  useEffect(() => {
    const element = ref.current
    if (!element || !layout) return
    element.focus()
    element.select()
  }, [layout])

  const commit = (save: boolean) => {
    const text = ref.current?.value ?? ""
    selection.setEditing(undefined)
    if (!save || !layout || text === layout.text) return
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
      defaultValue={layout?.text}
      rows={1}
      className="text-editor pointer-events-auto absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-2 outline-offset-2 field-sizing-content"
      style={
        layout
          ? {
              ...layout.style,
              left: layout.box.x,
              top: layout.box.y,
              minWidth: layout.box.w,
              minHeight: layout.box.h,
              outlineColor: kindColors.layer,
              outlineStyle: "solid"
            }
          : { display: "none" }
      }
      onBlur={() => commit(true)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Escape") {
          event.preventDefault()
          commit(false)
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          commit(true)
        }
      }}
    />
  )
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

/** The text a layer shows, when it's editable in place: a text layer, or a component whose child is a string. */
function editableText(node: DesignNode): string | undefined {
  if (node.type === "text") return node.text
  if (node.type === "component" && typeof node.props?.children === "string") return node.props.children
  return undefined
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
  // While layers are dragged they are hidden where they were, so they have no outline there.
  const layers = entry && !getDragView() ? selectedNodes(current) : []
  const pickedRects: DOMRect[] = []
  for (const id of layers) {
    const node = findLayer(store, entry!.container, id)
    // Inside an instance everything is the component's, so it's drawn in the component's color.
    const color = isInnerPath(id) ? kindColors.component : node ? nodeColor(node) : kindColors.layer
    for (const { host, element, picked: isPicked } of nodeInFrames(area, entry!.key, id, picked)) {
      const rect = element.getBoundingClientRect()
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
        name: node ? layerLabel(node, store.getEntries()) : id,
        size: `${formatPx(rect.width / scale)} × ${formatPx(rect.height / scale)}`,
        color
      }
      if (selection.getTool() === "select" && !getDragView() && !isInnerPath(id)) {
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
    model.label = {
      box,
      name: `${layers.length} layers`,
      size: `${formatPx((right - left) / scale)} × ${formatPx((bottom - top) / scale)}`,
      color: kindColors.layer
    }
  }
  const drag = getDragView()
  if (drag) model.drag = drag

  if (entry && !current.node && selection.getTool() === "select") {
    for (const host of findFrames(area, entry.key)) {
      model.handles.push({
        kind: "frame",
        key: `frame:${host.dataset.mode}:${host.dataset.state}`,
        box: toBox(host.getBoundingClientRect()),
        color: designColor(entry.container.kind),
        edges: frameEdges,
        design: entry.key,
        mode: host.dataset.mode ?? "",
        state: host.dataset.state ?? ""
      })
    }
  }

  if (hover?.node && !(hover.design === current.design && hover.node === current.node)) {
    const hoverEntry = store.getEntry(hover.design)
    const node = hoverEntry && findLayer(store, hoverEntry.container, hover.node)
    const frame = hover.design === current.design ? picked : selectionFrame(area, hover.design, {})
    const target = nodeInFrames(area, hover.design, hover.node, frame).find((item) => item.picked)
    if (target && node) {
      const rect = target.element.getBoundingClientRect()
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
      if (alt && selectedRect && picked && target.host === picked) {
        model.redlines = redlines(selectedRect, rect, scale, unit).map(toArea)
      } else if (alt && !selectedRect && hoverEntry) {
        // Nothing selected to measure from: Alt shows the hovered layer's distances to the edges of its parent.
        const parent = locateNode(hoverEntry.container.root, hover.node)?.ancestors.at(-1)
        const parentRect = parent && findNodeElement(target.host, parent.id)?.getBoundingClientRect()
        if (parentRect) model.redlines = redlines(rect, parentRect, scale, unit).map(toArea)
      }
    }
  }

  // A selected layout shows the space inside it: padding along its edges, gaps between its children.
  const single = layers.length === 1 ? layers[0] : undefined
  const layout = entry && single ? findLayer(store, entry.container, single) : undefined
  if (single && layout?.type === "layout" && picked && !getDragView()) {
    const element = findNodeElement(picked, single)
    // Inside an instance, the children's ids carry the same prefix as the layout's.
    const prefix = single.slice(0, single.lastIndexOf("/") + 1)
    if (element)
      model.spacing = layoutSpacing(
        element,
        layout.children.map((child) => findNodeElement(picked, `${prefix}${child.id}`)),
        toBox
      )
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
  for (const host of area.querySelectorAll<HTMLElement>("[data-frame]")) {
    const rect = host.getBoundingClientRect()
    if (rect.right < view.left || rect.left > view.right || rect.bottom < view.top || rect.top > view.bottom) continue
    const scale = zoom * frameScale(host)
    const width = rect.width / scale
    const grid =
      width < 600
        ? { count: 4, margin: 16, gutter: 16 }
        : width < 1024
          ? { count: 8, margin: 24, gutter: 24 }
          : { count: 12, margin: 32, gutter: 24 }
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
  const lines: Redline[] = []
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const screen = Math.hypot(x2 - x1, y2 - y1)
    if (screen < 0.5) return
    const px = Math.round((screen / scale) * 10) / 10
    const steps = px / unit
    lines.push({ x1, y1, x2, y2, px, steps: Number.isInteger(steps * 2) ? steps : undefined })
  }
  const midY = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2
  const midX = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2
  const containsA = b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom
  if (containsA) {
    const cy = a.top + a.height / 2
    const cx = a.left + a.width / 2
    add(b.left, cy, a.left, cy)
    add(a.right, cy, b.right, cy)
    add(cx, b.top, cx, a.top)
    add(cx, a.bottom, cx, b.bottom)
    return lines
  }
  const overlapY = a.top < b.bottom && b.top < a.bottom
  const overlapX = a.left < b.right && b.left < a.right
  if (b.left >= a.right)
    add(a.right, overlapY ? midY : a.top + a.height / 2, b.left, overlapY ? midY : a.top + a.height / 2)
  if (b.right <= a.left)
    add(b.right, overlapY ? midY : a.top + a.height / 2, a.left, overlapY ? midY : a.top + a.height / 2)
  if (b.top >= a.bottom)
    add(overlapX ? midX : a.left + a.width / 2, a.bottom, overlapX ? midX : a.left + a.width / 2, b.top)
  if (b.bottom <= a.top)
    add(overlapX ? midX : a.left + a.width / 2, b.bottom, overlapX ? midX : a.left + a.width / 2, a.top)
  return lines
}

const cursors: Record<Edge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize"
}

/** Square handles on the corners, and invisible strips along the sides, as in Figma. */
function ResizeHandles({
  handles,
  onStart,
  onReset
}: {
  handles: Handles
  onStart(edge: Edge, event: ReactPointerEvent): void
  onReset(edge: Edge): void
}) {
  const { box, color, edges } = handles
  const strip = 8
  const square = 8
  return edges.map((edge) => {
    const corner = edge.length === 2
    const x = edge.includes("w") ? box.x : edge.includes("e") ? box.x + box.w : box.x + box.w / 2
    const y = edge.includes("n") ? box.y : edge.includes("s") ? box.y + box.h : box.y + box.h / 2
    const style: React.CSSProperties = corner
      ? {
          left: x - square / 2,
          top: y - square / 2,
          width: square,
          height: square,
          background: "white",
          border: `1.5px solid ${color}`,
          borderRadius: 2
        }
      : edge === "n" || edge === "s"
        ? { left: box.x + square, top: y - strip / 2, width: Math.max(0, box.w - square * 2), height: strip }
        : { left: x - strip / 2, top: box.y + square, width: strip, height: Math.max(0, box.h - square * 2) }
    return (
      <Hint
        key={edge}
        label={handles.kind === "frame" ? "Drag to resize this frame" : "Drag to resize"}
        detail="Double-click to reset."
        wait
      >
        <div
          role="presentation"
          className={`resize-handle pointer-events-auto absolute ${corner ? "z-10 shadow-sm" : ""}`}
          style={{ ...style, cursor: cursors[edge] }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            event.preventDefault()
            onStart(edge, event)
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onReset(edge)
          }}
        />
      </Hint>
    )
  })
}

/** Follows the pointer until it's released. */
function drag(cursor: string, move: (event: PointerEvent) => void): void {
  const previous = document.body.style.cursor
  document.body.style.cursor = cursor
  const onMove = (event: PointerEvent) => {
    event.preventDefault()
    move(event)
  }
  const onUp = () => {
    document.body.style.cursor = previous
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
    window.removeEventListener("pointercancel", onUp)
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
  window.addEventListener("pointercancel", onUp)
}

/** How close, in screen pixels, an edge has to come to snap. */
const snapDistance = 6

/**
 * Resizing by a handle. A frame takes a size in pixels for its viewport, snapping back to the viewport's width and the
 * content's height. A layer takes a fixed size in whole spacing steps, or fill when its edge meets the inside of its
 * parent; Shift on a corner keeps its proportions. A drag is one undo step.
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
  const start = { x: event.clientX, y: event.clientY }
  const horizontal = edge.includes("e") || edge.includes("w")
  const vertical = edge.includes("n") || edge.includes("s")
  let last = ""

  if (handles.kind === "frame") {
    const mode = resolveModes(store.getModes()).find((candidate) => candidate.id === handles.mode)
    if (!mode) return
    const size = frameSize(entry.container, mode)
    const rect = host.getBoundingClientRect()
    // Starting from the content's height, coming back to it snaps to hugging it again.
    const content = size.height === undefined ? rect.height / scale : undefined
    const startHeight = size.height ?? rect.height / scale
    drag(cursors[edge], (moveEvent) => {
      const next: FrameSize = { ...entry.container.frames?.[mode.viewport] }
      if (horizontal) {
        const width = Math.round(size.width + (moveEvent.clientX - start.x) / scale)
        if (Math.abs(width - mode.width) * scale < snapDistance) delete next.width
        else next.width = Math.max(160, width)
      }
      if (vertical) {
        const height = Math.round(startHeight + (moveEvent.clientY - start.y) / scale)
        if (content !== undefined && Math.abs(height - content) * scale < snapDistance) delete next.height
        else next.height = Math.max(80, height)
      }
      const serialized = JSON.stringify(next)
      if (serialized === last) return
      last = serialized
      store.updateContainer(entry.key, "Resize frame", (container) => withFrame(container, mode.viewport, next), {
        group: `frame:${entry.key}:${mode.viewport}`
      })
    })
    return
  }

  const element = handles.node ? findNodeElement(host, handles.node) : undefined
  const location = handles.node ? locateNode(entry.container.root, handles.node) : undefined
  if (!element || !location) return
  const state = editingState(entry.container, handles.state)
  const node = nodeInState(location.node, state)
  const parent = location.ancestors.at(-1)
  const parentDirection =
    parent?.type === "layout" ? (nodeInState(parent, state).style?.direction ?? "column") : undefined
  const unit = spacingUnit(tokens.get())
  const rect = element.getBoundingClientRect()
  const inner = contentBox(element.parentElement, scale)
  const ratio = rect.width / Math.max(1, rect.height)

  drag(cursors[edge], (moveEvent) => {
    const dx = moveEvent.clientX - start.x
    let dy = moveEvent.clientY - start.y
    // Shift on a corner keeps the proportions, following the horizontal movement.
    if (moveEvent.shiftKey && horizontal && vertical) {
      const signX = edge.includes("w") ? -1 : 1
      const signY = edge.includes("n") ? -1 : 1
      dy = ((signX * dx) / ratio) * signY
    }
    const style: Partial<Record<keyof NodeStyle, unknown>> = {}
    if (horizontal) {
      const left = edge.includes("w") ? rect.left + dx : rect.left
      const right = edge.includes("e") ? rect.right + dx : rect.right
      const gap = edge.includes("e")
        ? Math.abs(right - (inner?.right ?? Infinity))
        : Math.abs(left - (inner?.left ?? -Infinity))
      style.width =
        gap < snapDistance && !moveEvent.shiftKey ? "fill" : Math.max(0, Math.round((right - left) / scale / unit))
    }
    if (vertical) {
      const top = edge.includes("n") ? rect.top + dy : rect.top
      const bottom = edge.includes("s") ? rect.bottom + dy : rect.bottom
      const gap = edge.includes("s")
        ? Math.abs(bottom - (inner?.bottom ?? Infinity))
        : Math.abs(top - (inner?.top ?? -Infinity))
      style.height =
        gap < snapDistance && !moveEvent.shiftKey ? "fill" : Math.max(0, Math.round((bottom - top) / scale / unit))
    }
    // `grow` was the older way to fill along the parent's direction; a size on that axis replaces it.
    const mainAxis = parentDirection === "column" ? vertical : horizontal
    if (node.style?.grow && mainAxis) style.grow = undefined
    const serialized = JSON.stringify(style)
    if (serialized === last) return
    last = serialized
    store.updateContainer(
      entry.key,
      "Resize layer",
      (container) =>
        editNode(container, boardTarget(container, state.id), location.node.id, { style: style as NodeStyle }),
      { group: `resize:${entry.key}:${location.node.id}` }
    )
  })
}

/** Double-clicking a handle goes back to the default size on its axes. */
function resetSize(session: ProjectSession, handles: Handles, edge: Edge): void {
  const { store } = session
  const entry = store.getEntry(handles.design)
  if (!entry) return
  const horizontal = edge.includes("e") || edge.includes("w")
  const vertical = edge.includes("n") || edge.includes("s")
  if (handles.kind === "frame") {
    const mode = resolveModes(store.getModes()).find((candidate) => candidate.id === handles.mode)
    if (!mode) return
    const next: FrameSize = { ...entry.container.frames?.[mode.viewport] }
    if (horizontal) delete next.width
    if (vertical) delete next.height
    store.updateContainer(entry.key, "Reset frame size", (container) => withFrame(container, mode.viewport, next))
    return
  }
  const nodeId = handles.node
  if (!nodeId) return
  const state = editingState(entry.container, handles.state)
  const style: Partial<Record<keyof NodeStyle, unknown>> = {}
  if (horizontal) style.width = undefined
  if (vertical) style.height = undefined
  store.updateContainer(entry.key, "Reset size", (container) =>
    editNode(container, boardTarget(container, state.id), nodeId, { style: style as NodeStyle })
  )
}

function withFrame(container: ContainerSpec, viewport: string, size: FrameSize): ContainerSpec {
  const frames = { ...container.frames }
  if (size.width === undefined && size.height === undefined) delete frames[viewport]
  else frames[viewport] = size
  const next: ContainerSpec = { ...container, frames }
  if (Object.keys(frames).length === 0) delete next.frames
  return next
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

/** The text tool: inside a design, a text layer in the layout under the pointer; on the canvas, a free note. */
function addText(session: ProjectSession, hit: Hit | undefined, point: Point): void {
  const { store, selection, editor } = session
  if (hit) {
    const { entry, chain } = hit
    const layoutIndex = chain.findLastIndex((node) => node.type === "layout")
    const layout = chain[layoutIndex]
    if (!layout) return
    const after = chain[layoutIndex + 1]
    const index = after ? (locateNode(entry.container.root, after.id)?.index ?? 0) + 1 : undefined
    const id = generateId(nodeIds(entry.container.root))
    store.updateContainer(entry.key, "Add text", (container) => ({
      ...container,
      root: insertNode(container.root, layout.id, { type: "text", id, text: "Text" }, { index })
    }))
    selection.set({ design: entry.key, node: id, mode: hit.mode, state: hit.state })
    // The layer renders on the next frame; edit it once it's there.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        selection.setEditing({ design: entry.key, node: id, mode: hit.mode, state: hit.state })
      )
    )
    return
  }
  if (!editor) return
  const page = editor.screenToPage(point)
  const current = selection.get()
  const path = (current.design && store.getEntry(current.design)?.path) ?? store.mainPath
  const taken = new Set(store.getNotes().map((note) => note.note.id))
  const id = `note-${generateId(taken)}`
  const key = store.addNote(path, { id, text: "Text", position: { x: Math.round(page.x), y: Math.round(page.y) } })
  selection.set({ note: key })
  setTimeout(() => {
    const shape = editor
      .getCurrentPageShapes()
      .find((candidate) => candidate.type === "canvas-note" && candidate.props.key === key)
    if (shape) editor.setEditingShape(shape.id)
  }, 50)
}

function formatPx(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatSteps(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
