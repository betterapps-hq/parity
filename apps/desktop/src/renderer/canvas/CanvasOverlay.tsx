import {
  boardTarget,
  designSlots,
  designStates,
  editNode,
  isInnerPath,
  locateNode,
  resolveModes
} from "@parity-app/core"
import {
  type Edge,
  editableText,
  frameResize,
  frameSizeReset,
  layerResize,
  layerSizeReset,
  layersResize,
  type SpacingEdit,
  isLocked,
  overlayDesigns,
  pasteHere,
  resizeStart,
  selectedNodes,
  spacingHandles,
  textLayer,
  toggleLayer,
  withFrame
} from "@parity-app/editor"
import { SquareDashed } from "lucide-react"
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react"
import type { Editor } from "tldraw"
import { gestures as held } from "../chrome/keymap.ts"
import { holds } from "../chrome/keys.ts"
import { Name } from "../chrome/Name.tsx"
import type { DesignStore } from "../design-store.ts"
import { allFrames, findFrames, findNodeElement, nodeBox } from "../frame.ts"
import { getEffectivePreferences } from "../project-settings.ts"
import { type SelectionStore, useEditing } from "../selection.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { useProject } from "./context.ts"
import { areaSpace, frameGeometry } from "./frame-geometry.ts"
import { drawFrame, useFrameDrawing } from "./frame-tool.ts"
import { followPress, gestures } from "./gesture.ts"
import {
  frameAt,
  type Hit,
  hitInFrame,
  hitTest,
  nodeInFrames,
  type Point,
  selectedIn,
  selectionFrame,
  underPoint
} from "./hit.ts"
import { chipColors, chipFor, kindColors, layerLabel, nodeColor } from "./kinds.tsx"
import { getDragView, pressLayers } from "./layer-drag.ts"
import { resizeBoxes } from "./layer-measure.ts"
import { getSnapMeasures, LayerSnapping } from "./layer-snap.ts"
import { findLayer } from "./layers.ts"
import { addFrameOfText } from "./new-screen.ts"
import { type Handles, noMarks, type OverlayMarks, type OverlayScene, overlayMarks } from "./overlay-marks.ts"
import { scheduleOverlay } from "./overlay-scheduler.ts"
import { placeAtPoint } from "./paste-here.ts"
import { hoverTarget, pickDeeper, pressTarget } from "./pick.ts"
import { formatPx, RedlineView } from "./Redline.tsx"
import { resizeCursors, ResizeHandles } from "./ResizeHandles.tsx"
import { pressBackground } from "./select-box.ts"
import {
  measureSpacing,
  pickSpacing,
  pressSpacing,
  spacingValue,
  stepSpacing,
  typeSpacing,
  lengthTokens
} from "./spacing-edit.ts"
import { spacingKey, SpacingHandles } from "./SpacingHandles.tsx"
import { TextEditor } from "./TextEditor.tsx"

/**
 * Everything drawn over the canvas in screen space: selection and hover outlines for layers inside designs, the
 * selected layer's name and size, redlines while Alt is held, and the in-place text editor. It also takes the pointer
 * first, so clicks inside a design select its layers the way Figma does.
 */
export function CanvasOverlay() {
  const session = useProject()
  const rootRef = useRef<HTMLDivElement>(null)
  const [model, setModel] = useState<OverlayMarks>(noMarks)
  const pointer = useRef<{ point?: Point; alt: boolean; deep: boolean }>({ alt: false, deep: false })
  const editing = useEditing(session.selection)
  // The padding or gap handle being dragged, and what it's come to.
  const [spacingDrag, setSpacingDrag] = useState<{ key: string } & SpacingEdit>()

  // Pointer handling, ahead of tldraw.
  useEffect(() => {
    const area = rootRef.current?.parentElement

    if (!area) {
      return undefined
    }

    const { store, selection } = session

    const interactive = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(
        "button, input, textarea, [role=menuitem], [role=option], .design-title, .state-label, .text-editor, .resize-handle, .spacing-handle"
      )

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || interactive(event.target)) {
        return
      }

      const point = { x: event.clientX, y: event.clientY }
      const tool = selection.getTool()

      // Interacting, the designs take the pointer themselves.
      if (tool === "hand" || tool === "interact") {
        return
      }

      const hit = hitTest(area, store, point, session.editor)

      // Double-clicks belong to the canvas, not tldraw: inside a design they drill in (see onDoubleClick), and on empty
      // canvas tldraw would make a text shape of its own. Only free text notes keep tldraw's double-click, to edit.
      if (event.detail >= 2 && tool === "select" && !overNote(session.editor, point)) {
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
      if (!hit || hit.entry.container.locked || overNote(session.editor, point)) {
        return
      }

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
      if (press.kind === "select") {
        selectHit(session.selection, hit, press.node)
      }

      pressLayers(session, area, event, () => press.kind === "keep" && selectHit(session.selection, hit, press.node))
    }

    const onDoubleClick = (event: MouseEvent) => {
      if (interactive(event.target) || selection.getTool() !== "select") {
        return
      }

      const point = { x: event.clientX, y: event.clientY }
      const hit = hitTest(area, store, point, session.editor)

      if (!hit || hit.entry.container.locked || overNote(session.editor, point)) {
        return
      }

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

      if (deeper) {
        selectHit(session.selection, hit, deeper)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.current = {
        point: { x: event.clientX, y: event.clientY },
        alt: event.altKey,
        deep: event.ctrlKey || event.metaKey
      }

      if (event.buttons !== 0) {
        return
      }

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

      if (event.key === "Alt") {
        event.preventDefault()
      }
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

  // Outlines follow the camera, layout changes, animations and drags, measured when the canvas area's one scheduler
  // decides (PAR-986, see `overlay-scheduler.ts`): `readScene` reads the boxes, and `overlayMarks` turns them into
  // what's drawn. Interacting, outlines and handles would sit over the components being tried.
  useEffect(() => {
    const { selection } = session
    const area = rootRef.current?.parentElement

    if (!area) {
      return undefined
    }

    return scheduleOverlay(area, session, {
      showing: () =>
        !!selection.get().design ||
        !!selection.getHover()?.node ||
        !!getDragView() ||
        getEffectivePreferences(session.store).layoutGrid,
      designs: () =>
        overlayDesigns({
          selected: selection.get().design,
          hovered: selection.getHover()?.design,
          layoutGrid: getEffectivePreferences(session.store).layoutGrid
        }),
      measure: () =>
        selection.getTool() === "interact" ? noMarks : overlayMarks(readScene(session, area, pointer.current.alt)),
      draw: setModel
    })
  }, [session])

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[300] overflow-hidden">
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

              if (area) {
                startResize(session, area, handles, edge, event)
              }
            }}
            onReset={(edge, fill) => resetSize(session.store, handles, edge, fill)}
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
  session: Pick<ProjectSession, "store" | "tokens">
  spacing: NonNullable<OverlayMarks["spacingHandles"]>
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

/**
 * Whether a free text note or a reference is under a point, which tldraw handles: a note's double-click edits it, and a
 * reference's opens it at its source.
 */
function overNote(editor: Editor | undefined, point: Point): boolean {
  if (!editor) {
    return false
  }

  const type = editor.getShapeAtPoint(editor.screenToPage(point), { hitInside: true })?.type

  return type === "canvas-note" || type === "canvas-reference"
}

function selectHit(selection: SelectionStore, hit: Hit, node: string | undefined): void {
  if (!node || node === hit.entry.container.root.id) {
    selection.set({ design: hit.entry.key })
  } else {
    selection.set({ design: hit.entry.key, node, mode: hit.mode, state: hit.state })
  }
}

/**
 * What the overlay draws from (see `overlayMarks`): what's selected and hovered, read from the stores, and the boxes of
 * what it outlines, read from the page in the overlay's pixels. Only what's drawn is read.
 */
function readScene(
  session: ProjectDesigns & Pick<ProjectSession, "editor" | "info" | "tokens">,
  area: HTMLElement,
  alt: boolean
): OverlayScene {
  const { selection, store } = session
  const current = selection.get()
  const hover = selection.getHover()
  const drag = getDragView()
  const space = areaSpace(area)
  const unit = spacingUnit(session.tokens.get())

  const scene: OverlayScene = {
    tool: selection.getTool(),
    layers: [],
    locked: false,
    slots: [],
    alt,
    snaps: getSnapMeasures().map(({ from, to, length }) => ({ from: space.point(from), to: space.point(to), length })),
    unit
  }

  if (current.node) {
    scene.node = current.node
  }

  if (drag) {
    scene.drag = drag
  }

  // A frame as the overlay draws over it, its box read once asked for.
  const frameBox = (host: HTMLElement, rect = host.getBoundingClientRect()) => ({
    mode: host.dataset.mode ?? "",
    state: host.dataset.state ?? "",
    box: space.box(rect),
    scale: frameGeometry(host).scale
  })

  const entry = current.design ? store.getEntry(current.design) : undefined
  const picked = entry ? selectionFrame(area, entry.key, current) : undefined

  if (entry) {
    const { kind, locked } = entry.container
    // A design's frames are read only for what's drawn on them: a frame's size and handles, with no layer selected.
    const frames = current.node ? [] : findFrames(area, entry.key).map((host) => frameBox(host))
    scene.design = picked
      ? { key: entry.key, kind, locked: !!locked, frames, picked: frameBox(picked) }
      : { key: entry.key, kind, locked: !!locked, frames }
  }

  // While layers are dragged they are hidden where they were, so they have no outline there. An absolutely placed layer
  // moves itself, so its outline follows it.
  const layers = entry && !drag?.ghost ? selectedNodes(current) : []
  scene.locked = layers.some((id) => isLocked(entry!.container, id))

  for (const id of layers) {
    const node = findLayer(store, entry!.container, id)
    // Inside an instance everything is the component's, so it's drawn in the component's color.
    let color: string = kindColors.layer

    if (isInnerPath(id)) {
      color = kindColors.component
    } else if (node) {
      color = nodeColor(node)
    }

    scene.layers.push({
      id,
      name: node ? layerLabel(node, store.getEntries(), store.getComponentLibrary(), session.info.libraries) : id,
      color,
      inner: isInnerPath(id),
      boxes: nodeInFrames(area, entry!.key, id, picked).map(({ host, rect, picked: isPicked }) => ({
        ...frameBox(host, rect),
        picked: isPicked
      }))
    })
  }

  if (entry && picked && !drag) {
    scene.slots = designSlots(entry.container).flatMap(({ name, node }) =>
      nodeInFrames(area, entry.key, node.id, picked)
        .filter((item) => item.picked)
        .map(({ rect }) => ({ id: node.id, name, box: space.box(rect) }))
    )
  }

  if (hover?.node && !(hover.design === current.design && hover.node === current.node)) {
    const hoverEntry = store.getEntry(hover.design)
    const node = hoverEntry && findLayer(store, hoverEntry.container, hover.node)
    // In the frame under the pointer; hovered in Layers, in the frame the selection was picked in.
    let frame

    if (hover.mode !== undefined) {
      frame = findFrames(area, hover.design, { mode: hover.mode, state: hover.state })[0]
    } else {
      frame = hover.design === current.design ? picked : selectionFrame(area, hover.design, {})
    }

    const target = nodeInFrames(area, hover.design, hover.node, frame).find((item) => item.picked)

    if (target && node) {
      const inPicked = !!picked && target.host === picked

      scene.hover = {
        box: space.box(target.rect),
        color: isInnerPath(hover.node) ? kindColors.component : nodeColor(node),
        scale: frameGeometry(target.host).scale,
        inPicked
      }

      if (alt && !inPicked && hover.design === current.design && current.node && !drag) {
        const from = nodeBox(target.host, current.node)

        if (from) {
          scene.hover.from = space.box(from)
        }
      }

      if (alt && hoverEntry) {
        const parent = locateNode(hoverEntry.container.root, hover.node)?.ancestors.at(-1)
        const parentRect = parent && nodeBox(target.host, parent.id)

        if (parentRect) {
          scene.hover.parent = space.box(parentRect)
        }
      }
    }
  }

  // A single selected layout's padding and gaps, as the picked frame draws them.
  const single = layers.length === 1 ? layers[0] : undefined
  const layout = entry && single ? findLayer(store, entry.container, single) : undefined

  if (single && layout?.type === "layout" && picked && !drag) {
    const element = findNodeElement(picked, single)
    // Inside an instance, the children's ids carry the same prefix as the layout's.
    const prefix = single.slice(0, single.lastIndexOf("/") + 1)
    const children = layout.children.map((child) => findNodeElement(picked, `${prefix}${child.id}`))

    if (element) {
      scene.spacing = {
        target: {
          design: entry!.key,
          mode: picked.dataset.mode ?? "",
          state: picked.dataset.state ?? "",
          node: single
        },
        measure: measureSpacing(frameGeometry(picked), element, children, space)
      }
    }
  }

  // Every frame on screen, for its column grid.
  if (getEffectivePreferences(store).layoutGrid) {
    const view = area.getBoundingClientRect()

    scene.grid = allFrames(area).flatMap((host) => {
      const rect = host.getBoundingClientRect()

      if (rect.right < view.left || rect.left > view.right || rect.bottom < view.top || rect.top > view.bottom) {
        return []
      }

      return [{ ...frameBox(host, rect), key: `${host.dataset.design}:${host.dataset.mode}:${host.dataset.state}` }]
    })
  }

  return scene
}

/**
 * Resizing by a handle, by `@parity-app/editor`'s rules: a frame's by `frameResize`, a layer's by `layerResize`. This
 * measures the layer or the frame when the drag begins, and for an absolutely placed layer where its sides are drawn
 * and what its edges snap to (see `LayerSnapping`), and writes the style or size each pointer move gives. The drag
 * writes as it goes, as one undo step: Escape takes it all back, and the pointer cancelled or the window losing focus
 * keeps what it did (see `gestures.resize`).
 */
function startResize(
  session: Pick<ProjectSession, "editor" | "store" | "tokens">,
  area: HTMLElement,
  handles: Handles,
  edge: Edge,
  event: ReactPointerEvent
): void {
  const { store, editor, tokens } = session
  const entry = store.getEntry(handles.design)
  const host = findFrames(area, handles.design, { mode: handles.mode, state: handles.state })[0]

  if (!entry || !editor || !host) {
    return
  }

  // The frame as it's drawn when the drag begins: its scale and every box are read from the same place.
  const drawn = frameGeometry(host)
  const { scale } = drawn
  const start = { clientX: event.clientX, clientY: event.clientY }

  const pointer = (moveEvent: PointerEvent) => ({
    dx: moveEvent.clientX - start.clientX,
    dy: moveEvent.clientY - start.clientY
  })

  let last = ""

  if (handles.kind === "frame") {
    const mode = resolveModes(store.getModes()).find((candidate) => candidate.id === handles.mode)

    if (!mode) {
      return
    }

    const resize = frameResize({ design: entry.container, mode, edge, rect: drawn.rect, scale })
    const label = entry.container.kind === "frame" ? "Resize frame" : "Resize preview"
    followPress(gestures.resize, store, start, {
      design: entry.key,
      cursor: resizeCursors[edge],
      move(moveEvent, { gesture }) {
        const next = resize(pointer(moveEvent))
        const serialized = JSON.stringify(next)

        if (serialized === last) {
          return
        }

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
  const frame = store.editFrame(handles)
  // A layer that draws only text has a box and no element, and isn't resized.
  const measured = layer ? drawn.node(layer) : undefined

  if (!layer || !measured?.hasElement || !frame) {
    return
  }

  const { state } = frame
  // The layer and its layout as the frame being resized in shows them: its state, variants and viewport.
  const shown = resizeStart(entry.container, layer, { state, viewport: frame.viewport })

  if (!shown) {
    return
  }

  const unit = spacingUnit(tokens.get())

  const boxes = resizeBoxes(measured, shown.style.position === "absolute", unit)
  // An absolutely placed layer resizes by its insets, from where its sides are drawn, and its dragged edges snap.
  const snapping = boxes.drawn ? LayerSnapping.measure(editor, drawn, entry.container, layer) : undefined
  const resize = layerResize({ edge, layer: shown, ...boxes, scale, unit, snapping })

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

      if (!style) {
        return
      }

      const serialized = JSON.stringify(style)

      if (serialized === last) {
        return
      }

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
  session: Pick<ProjectSession, "editor" | "store" | "tokens">,
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

  if (!entry || !editor || !host || !frame) {
    return
  }

  const drawn = frameGeometry(host)
  const { scale } = drawn
  const unit = spacingUnit(tokens.get())

  const starts = layers.flatMap((id) => {
    const shown = resizeStart(entry.container, id, { state: frame.state, viewport: frame.viewport })
    const measured = shown && drawn.node(id)

    if (!shown || !measured?.hasElement) {
      return []
    }

    const boxes = resizeBoxes(measured, shown.style.position === "absolute", unit)

    return [{ id, start: { edge, layer: shown, ...boxes, scale, unit } }]
  })

  if (starts.length === 0) {
    return
  }

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

      if (styles.every((style) => style === undefined)) {
        return
      }

      const serialized = JSON.stringify(styles)

      if (serialized === last) {
        return
      }

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
function resetSize(store: DesignStore, handles: Handles, edge: Edge, fill = false): void {
  const entry = store.getEntry(handles.design)

  if (!entry) {
    return
  }

  if (handles.kind === "frame") {
    const mode = resolveModes(store.getModes()).find((candidate) => candidate.id === handles.mode)

    if (!mode) {
      return
    }

    const { container } = entry
    const next = frameSizeReset(container.kind === "frame" ? container.size : container.frames?.[mode.viewport], edge)
    const label = container.kind === "frame" ? "Reset frame size" : "Reset preview size"
    store.updateContainer(entry.key, label, (current) => withFrame(current, mode.viewport, next))

    return
  }

  const layers = handles.nodes ?? (handles.node ? [handles.node] : [])
  const frame = store.editFrame(handles)

  if (layers.length === 0 || !frame) {
    return
  }

  store.updateContainer(frame.design, fill ? "Set to fill" : "Set to hug", (container) =>
    layers.reduce((next, layer) => {
      const shown = resizeStart(next, layer, { state: frame.state, viewport: frame.viewport })

      return editNode(next, boardTarget(next, frame.state.id), layer, { style: layerSizeReset(edge, fill, shown) })
    }, container)
  )
}

/**
 * The text tool: inside a design, a text layer where a drop at the pointer would land (see `placeAtPoint`), in the
 * frame there; on the empty canvas, a text layer in a frame that hugs it (see `addFrameOfText`). Either way it's
 * edited in place at once. Over a design with no layout under the pointer, nothing.
 */
function addText(
  session: ProjectDesigns & Pick<ProjectSession, "editor" | "tokens">,
  area: ParentNode,
  point: Point
): void {
  const { store, selection, editor } = session
  const place = placeAtPoint(session, area, point)

  if (place.kind === "none") {
    return
  }

  if (place.kind === "layout") {
    const { hit, here, frame } = place
    let node: string | undefined
    store.updateContainer(frame.design, "Add text", (container) => {
      const placed = pasteHere(container, [textLayer("Text")], here, frame.state, frame.viewport)
      node = placed.copies[0]

      return placed.container
    })

    if (!node) {
      return
    }

    const picked = { design: frame.design, node, mode: hit.mode, state: hit.state }
    selection.set(picked)
    // The layer renders on the next frame; edit it once it's there.
    requestAnimationFrame(() => requestAnimationFrame(() => selection.setEditing(picked)))

    return
  }

  if (!editor) {
    return
  }

  const page = editor.screenToPage(point)
  const { key, node } = addFrameOfText(session, "Text", page, "Add text")
  const mode = resolveModes(store.getModes())[0]?.id
  const entry = store.getEntry(key)
  const state = entry && designStates(entry.container)[0]!.id

  if (!mode || !state) {
    return
  }

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

  if (!drawing) {
    return null
  }

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
