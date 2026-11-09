import type { Length, NodeStyle } from "@parity-app/core"
import {
  type Edge,
  type LayerResizeStart,
  layerResize,
  layerSizeReset,
  layersResize,
  type LengthToken,
  type PaddingSide,
  paddingSides,
  pickedSpacing,
  type SpacingEdit,
  type SpacingEditStart,
  type SpacingHandle,
  spacingDrag,
  spacingHandles,
  type SpacingLayout,
  spacingStep,
  sidesOf,
  type StyleChange,
  typedSpacing
} from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { gestures as held } from "../chrome/keymap.ts"
import { holds } from "../chrome/keys.ts"
import { Name } from "../chrome/Name.tsx"
import { followPress, gestures } from "./gesture.ts"
import { chipColors, kindColors } from "./kinds.tsx"
import { resizeCursors, ResizeHandles } from "./ResizeHandles.tsx"
import type { SpacingValue } from "./spacing-edit.ts"
import { sidesHeld, spacingKey, SpacingHandles } from "./SpacingHandles.tsx"

/**
 * A prototype of PAR-169's handles, to try before they go on the canvas: a layout's padding and gaps dragged by steps
 * of the spacing scale, clicked to type, with Alt for the opposite side and Alt+Shift for every side; a layer's edge
 * double-clicked to hug and Alt+double-clicked to fill; several layers resized together; Alt resizing from the middle.
 * It runs the editor's own rules (`spacing-handles.ts`, `move-resize.ts`) and gestures (`followPress`, so Escape takes a
 * drag back) on a stand-in layout drawn at 100%, with a 4px spacing unit. The style each change writes shows beside it.
 */
const meta = {
  title: "Parity/Canvas/Spacing handles",
  component: Playground,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof Playground>

export default meta

type Story = StoryObj<typeof meta>

const unit = 4

interface Layer {
  id: string
  name: string
  text: string
  style: NodeStyle
}

interface Scene {
  layout: NodeStyle
  children: Layer[]
}

interface PlaygroundProps {
  scene: Scene
  tokens?: LengthToken[]
  /** What starts selected: the layout, or some of its children by id. */
  selected?: "layout" | string[]
}

const card = (id: string, name: string, text: string, style: NodeStyle = {}): Layer => ({ id, name, text, style })

/** A row of three stat cards, with padding of 16 and 24 and a gap of 12. */
export const PaddingAndGap: Story = {
  args: {
    scene: {
      layout: { direction: "row", padding: [4, 6], gap: 3 },
      children: [
        card("revenue", "Revenue", "$48,200"),
        card("users", "Users", "1,284"),
        card("uptime", "Uptime", "99.9%")
      ]
    }
  }
}

/**
 * A column whose padding and gap are bound to length tokens: `card-padding` (24) and `stack-gap` (12). Dragged onto
 * another token's value (32, `card-padding-lg`; 16, `stack-gap-lg`) they stay bound; in between they're steps.
 */
export const BoundToTokens: Story = {
  args: {
    tokens: [
      { name: "stack-gap", px: 12 },
      { name: "stack-gap-lg", px: 16 },
      { name: "card-padding", px: 24 },
      { name: "card-padding-lg", px: 32 }
    ],
    scene: {
      layout: { direction: "column", padding: "card-padding", gap: "stack-gap", width: 64 },
      children: [
        card("title", "Title", "Pro plan"),
        card("price", "Price", "$24 a month"),
        card("cta", "Button", "Upgrade")
      ]
    }
  }
}

/** A layout with no padding and no gap: its handles sit just inside its edges, to drag padding out of nothing. */
export const NoPadding: Story = {
  args: {
    scene: {
      layout: { direction: "row" },
      children: [card("save", "Save", "Save"), card("cancel", "Cancel", "Cancel")]
    }
  }
}

/**
 * Three cards selected together. A handle on the box around them resizes them all in proportion; Alt resizes from the
 * middle; double-clicking an edge makes them hug, Alt+double-click fill. Click a card to select it alone, Shift-click to
 * add one, and click the row's padding to select the row.
 */
export const SeveralLayers: Story = {
  args: {
    selected: ["revenue", "users", "uptime"],
    scene: {
      layout: { direction: "row", padding: 4, gap: 3 },
      children: [
        card("revenue", "Revenue", "$48,200", { width: 28 }),
        card("users", "Users", "1,284", { width: 28 }),
        card("uptime", "Uptime", "99.9%", { width: 28 })
      ]
    }
  }
}

function Playground({ scene: initial, tokens = [], selected: initiallySelected = "layout" }: PlaygroundProps) {
  const [scene, setSceneState] = useState(initial)
  const sceneRef = useRef(scene)

  const setScene = (next: Scene) => {
    sceneRef.current = next
    setSceneState(next)
  }

  const [selected, setSelected] = useState(initiallySelected)
  const [dragging, setDragging] = useState<{ key: string } & Pick<SpacingEdit, "px" | "token" | "sides">>()
  const [note, setNote] = useState<string>()
  const rootRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const childRefs = useRef(new Map<string, HTMLDivElement>())
  const [measured, setMeasured] = useState<Measured>()

  // Measured after every change, as the canvas measures the frames.
  useLayoutEffect(() => {
    const next = measure(rootRef.current, layoutRef.current, scene, childRefs.current)

    if (next) {
      setMeasured((current) => (JSON.stringify(next) === JSON.stringify(current) ? current : next))
    }
  }, [scene])

  // The stand-in for the design store a gesture writes to, so Escape takes a drag back to where it began.
  // SAFETY: the spacing gestures call only these, and only with the checkpoints this stand-in gives them.
  const store = {
    beginGesture: () => "story",
    endGesture: () => undefined,
    checkpoint: () => ({ container: sceneRef.current }),
    revert: (checkpoint: { container: Scene }) => setScene(checkpoint.container),
    getEntry: () => ({ container: sceneRef.current })
  } as never

  const editLayout = (change: StyleChange) =>
    setScene({ ...sceneRef.current, layout: apply(sceneRef.current.layout, change) })

  const editLayers = (changes: Map<string, StyleChange | undefined>) =>
    setScene({
      ...sceneRef.current,
      children: sceneRef.current.children.map((layer) => {
        const change = changes.get(layer.id)

        return change ? { ...layer, style: apply(layer.style, change) } : layer
      })
    })

  const spacingStart = (handle: SpacingHandle): SpacingEditStart => ({
    handle: handle.kind === "padding" ? { kind: "padding", side: handle.side } : handle,
    style: sceneRef.current.layout,
    drawn: { padding: measured!.padding, gap: measured!.gap },
    unit,
    scale: 1,
    tokens
  })

  const layerIds = selected === "layout" ? [] : selected

  const union =
    measured && unionOf(selected === "layout" ? [measured.layout] : layerIds.map((id) => measured.children[id]!))

  const startResize = (edge: Edge, event: { clientX: number; clientY: number }) => {
    if (!measured || !union) {
      return
    }

    const start = { clientX: event.clientX, clientY: event.clientY }

    const resizeStart = (rect: Rect, style: NodeStyle, inner: Rect, parentDirection?: "row" | "column") =>
      ({ edge, rect, inner, scale: 1, unit, layer: { style, parentDirection } }) satisfies LayerResizeStart

    const follow =
      selected === "layout"
        ? (() => {
            const resize = layerResize(
              resizeStart(measured.layout, sceneRef.current.layout, measured.frameInner, "column")
            )

            return (move: Parameters<typeof resize>[0]) => {
              const { style } = resize(move)

              if (style) {
                editLayout(style)
              }
            }
          })()
        : (() => {
            const direction = sceneRef.current.layout.direction ?? "column"
            const layers = layerIds.map((id) => sceneRef.current.children.find((layer) => layer.id === id)!)

            const resize = layersResize(
              layers.map((layer) => resizeStart(measured.children[layer.id]!, layer.style, measured.inner, direction)),
              union
            )

            return (move: Parameters<typeof resize>[0]) => {
              const styles = resize(move)
              editLayers(new Map(layers.map((layer, index) => [layer.id, styles[index]])))
            }
          })()

    followPress(gestures.resize, store, start, {
      design: "story",
      cursor: resizeCursors[edge],
      move: (moveEvent) =>
        follow({
          dx: moveEvent.clientX - start.clientX,
          dy: moveEvent.clientY - start.clientY,
          shift: moveEvent.shiftKey,
          centre: holds(moveEvent, held.fromMiddle.keys),
          snaps: false
        }),
      end: (kept) => setNote(kept ? "Resized" : "Escape took the resize back")
    })
  }

  const resetSize = (edge: Edge, fill: boolean) => {
    if (selected === "layout") {
      editLayout(layerSizeReset(edge, fill))
    } else {
      const direction = sceneRef.current.layout.direction ?? "column"
      editLayers(
        new Map(
          layerIds.map((id) => {
            const layer = sceneRef.current.children.find((candidate) => candidate.id === id)!

            return [id, layerSizeReset(edge, fill, { style: layer.style, parentDirection: direction })]
          })
        )
      )
    }

    setNote(fill ? "Filled" : "Hugged")
  }

  const handles = measured && selected === "layout" ? spacingHandles(measured.spacing) : []
  const row = (scene.layout.direction ?? "column") === "row"

  return (
    <div className="flex min-h-screen flex-wrap gap-6 bg-neutral-100 p-6 text-neutral-900">
      <div
        ref={rootRef}
        className="relative h-[460px] w-[640px] shrink-0 overflow-hidden rounded-md bg-white shadow-sm"
        onPointerDown={() => setSelected("layout")}
      >
        {/* The frame: a column with 40px of padding, which the layout can fill. */}
        <div className="flex h-full flex-col items-start p-10">
          <div
            ref={layoutRef}
            className="flex rounded-lg bg-sky-50 outline outline-1 outline-sky-200"
            style={layoutCss(scene.layout, tokens)}
          >
            {scene.children.map((layer) => (
              <div
                key={layer.id}
                ref={(element) => {
                  if (element) {
                    childRefs.current.set(layer.id, element)
                  } else {
                    childRefs.current.delete(layer.id)
                  }
                }}
                className="flex min-w-28 flex-col justify-center rounded-md bg-white px-4 py-3 text-base shadow-sm outline outline-1 outline-neutral-200"
                style={childCss(layer.style, row, tokens)}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setSelected((current) => {
                    if (!event.shiftKey || current === "layout") {
                      return [layer.id]
                    }

                    if (current.includes(layer.id)) {
                      return current.filter((id) => id !== layer.id)
                    }

                    return [...current, layer.id]
                  })
                }}
              >
                <span className="text-xs text-neutral-500">{layer.name}</span>
                <span className="font-semibold whitespace-nowrap">{layer.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* What the canvas draws over it. */}
        <div className="pointer-events-none absolute inset-0">
          {measured && union && (
            <>
              <Outline rect={union} />
              {selected !== "layout" &&
                layerIds.length > 1 &&
                layerIds.map((id) => <Outline key={id} rect={measured.children[id]!} thin />)}
              <SizeLabel rect={union} name={selectionName(scene, selected)} />
              {selected === "layout" && <Hatching layout={measured.spacing} />}
              <SpacingHandles
                handles={handles}
                unit={unit}
                tokens={tokens}
                valueOf={(handle) => valueOf(handle, sceneRef.current.layout, measured, tokens)}
                dragging={dragging}
                onPress={(handle, event, type) => {
                  const drag = spacingDrag(spacingStart(handle))
                  const start = { clientX: event.clientX, clientY: event.clientY }
                  followPress(gestures.resize, store, start, {
                    design: "story",
                    cursor: spacingCursor(handle),
                    move: (moveEvent) => {
                      const edit = drag({
                        dx: moveEvent.clientX - start.clientX,
                        dy: moveEvent.clientY - start.clientY,
                        ...sidesHeld(moveEvent)
                      })

                      if (!edit) {
                        return
                      }

                      editLayout(edit.change)
                      setDragging({ key: spacingKey(handle), px: edit.px, token: edit.token, sides: edit.sides })
                    },
                    end: (kept) => {
                      setDragging(undefined)
                      setNote(kept ? undefined : "Escape took the drag back")
                    },
                    click: type
                  })
                }}
                onType={(handle, text, keys) => {
                  const edit = typedSpacing(spacingStart(handle), text, keys)

                  if ("reason" in edit) {
                    return edit.reason
                  }

                  editLayout(edit.change)

                  return undefined
                }}
                onPick={(handle, value, keys) => editLayout(pickedSpacing(spacingStart(handle), value, keys).change)}
                onStep={(handle, count, keys) => editLayout(spacingStep(spacingStart(handle), count, keys).change)}
              />
              <ResizeHandles
                handles={{
                  kind: "node",
                  box: toBox(union),
                  color: kindColors.layer,
                  edges: ["n", "e", "s", "w", "ne", "se", "sw", "nw"]
                }}
                onStart={startResize}
                onReset={resetSize}
              />
            </>
          )}
        </div>
      </div>
      <Written scene={scene} selected={selected} note={note} />
    </div>
  )
}

// Measuring.

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

interface Measured {
  layout: Rect
  /** Inside the layout's padding, and inside the frame's. */
  inner: Rect
  frameInner: Rect
  children: Record<string, Rect>
  padding: Record<PaddingSide, number>
  gap: number
  spacing: SpacingLayout
}

function measure(
  root: HTMLElement | null,
  layout: HTMLElement | null,
  scene: Scene,
  children: Map<string, HTMLElement>
): Measured | undefined {
  if (!root || !layout) {
    return undefined
  }

  const origin = root.getBoundingClientRect()

  const rectOf = (element: Element): Rect => {
    const rect = element.getBoundingClientRect()

    return {
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      right: rect.right - origin.left,
      bottom: rect.bottom - origin.top
    }
  }

  const style = getComputedStyle(layout)
  const read = (name: string) => parseFloat(style.getPropertyValue(name)) || 0

  const padding = {
    top: read("padding-top"),
    right: read("padding-right"),
    bottom: read("padding-bottom"),
    left: read("padding-left")
  }

  const border = {
    top: read("border-top-width"),
    right: read("border-right-width"),
    bottom: read("border-bottom-width"),
    left: read("border-left-width")
  }

  const rect = rectOf(layout)

  const inner = {
    left: rect.left + border.left + padding.left,
    top: rect.top + border.top + padding.top,
    right: rect.right - border.right - padding.right,
    bottom: rect.bottom - border.bottom - padding.bottom
  }

  const frame = rectOf(layout.parentElement!)

  const childRects = Object.fromEntries(
    scene.children.flatMap((layer) => {
      const element = children.get(layer.id)

      return element ? [[layer.id, rectOf(element)]] : []
    })
  )

  const direction = scene.layout.direction ?? "column"

  return {
    layout: rect,
    inner,
    frameInner: { left: frame.left + 40, top: frame.top + 40, right: frame.right - 40, bottom: frame.bottom - 40 },
    children: childRects,
    padding,
    gap: read(direction === "row" ? "column-gap" : "row-gap"),
    spacing: {
      rect,
      border,
      padding,
      children: scene.children.map((layer) => childRects[layer.id]!).filter(Boolean),
      direction,
      oneLine: !scene.layout.wrap
    }
  }
}

function unionOf(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) {
    return undefined
  }

  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  }
}

const toBox = (rect: Rect) => ({ x: rect.left, y: rect.top, w: rect.right - rect.left, h: rect.bottom - rect.top })

// Drawing the stand-in from its style, as Tailwind would: lengths in steps of 4px, or a token's value.

function px(length: Length | undefined, tokens: readonly LengthToken[]): number {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a length is steps or a token's name, with no tag to tell them apart
  if (typeof length === "number") {
    return length * unit
  }

  return tokens.find((token) => token.name === length)?.px ?? 0
}

function size(length: Length | undefined, tokens: readonly LengthToken[]): string | undefined {
  if (length === undefined || length === "hug") {
    return "max-content"
  }

  if (length === "fill") {
    return undefined
  }

  return `${px(length, tokens)}px`
}

function layoutCss(style: NodeStyle, tokens: readonly LengthToken[]): CSSProperties {
  const [top, right, bottom, left] = (sidesOf(style.padding) ?? [0, 0, 0, 0]).map((side) => px(side, tokens))

  return {
    flexDirection: style.direction ?? "column",
    padding: `${top}px ${right}px ${bottom}px ${left}px`,
    gap: px(style.gap, tokens),
    width: style.width === "fill" ? "100%" : size(style.width, tokens),
    height: style.height === "fill" ? "100%" : size(style.height, tokens),
    alignSelf: style.width === "fill" ? "stretch" : undefined,
    flex: style.height === "fill" ? "1 1 0" : undefined
  }
}

function childCss(style: NodeStyle, row: boolean, tokens: readonly LengthToken[]): CSSProperties {
  const main = row ? style.width : style.height
  const cross = row ? style.height : style.width

  // A size that fills is left to `flex` along the layout and to `align-self` across it.
  return {
    width: style.width === "fill" ? undefined : size(style.width, tokens),
    height: style.height === "fill" ? undefined : size(style.height, tokens),
    flex: main === "fill" ? "1 1 0" : "none",
    alignSelf: cross === "fill" ? "stretch" : "flex-start"
  }
}

function selectionName(scene: Scene, selected: "layout" | string[]): string {
  if (selected === "layout") {
    return "Stats"
  }

  if (selected.length > 1) {
    return `${selected.length} layers`
  }

  return scene.children.find((layer) => layer.id === selected[0])?.name ?? ""
}

function spacingCursor(handle: SpacingHandle): string {
  if (handle.kind === "gap") {
    return handle.direction === "row" ? "ew-resize" : "ns-resize"
  }

  return handle.side === "top" || handle.side === "bottom" ? "ns-resize" : "ew-resize"
}

function apply(style: NodeStyle, change: StyleChange): NodeStyle {
  const next: NodeStyle = { ...style, ...change }

  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) {
      Reflect.deleteProperty(next, key)
    }
  }

  return next
}

function valueOf(handle: SpacingHandle, style: NodeStyle, measured: Measured, tokens: readonly LengthToken[]) {
  const written = handle.kind === "gap" ? style.gap : sidesOf(style.padding)?.[paddingSides.indexOf(handle.side)]
  const drawn = handle.kind === "gap" ? measured.gap : measured.padding[handle.side]

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a length is steps or a token's name, with no tag to tell them apart
  const named = typeof written === "string" ? written : undefined
  const token = tokens.some((candidate) => candidate.name === named) ? named : undefined

  const value: SpacingValue = { px: drawn }

  if (token) {
    value.token = token
  }

  return value
}

// What the canvas draws, as `CanvasOverlay` draws it.

function Outline({ rect, thin }: { rect: Rect; thin?: boolean }) {
  return (
    <div
      className="absolute"
      style={{ ...place(rect), outline: `${thin ? 1 : 2}px ${thin ? "dashed" : "solid"} ${kindColors.layer}` }}
    />
  )
}

function SizeLabel({ rect, name }: { rect: Rect; name: string }) {
  return (
    <>
      <div
        className="absolute -translate-y-full rounded-t px-1.5 py-px text-2xs font-medium tabular-nums"
        style={{ left: rect.left - 1, top: rect.top - 1, ...chipColors.layer }}
      >
        <Name>{name}</Name>
      </div>
      <div
        className="absolute -translate-x-1/2 rounded px-1.5 py-px text-2xs font-medium tabular-nums"
        style={{ left: (rect.left + rect.right) / 2, top: rect.bottom + 6, ...chipColors.layer }}
      >
        {Math.round(rect.right - rect.left)} × {Math.round(rect.bottom - rect.top)}
      </div>
    </>
  )
}

/** The hatching a selected layout's padding and gaps already show. */
function Hatching({ layout }: { layout: SpacingLayout }) {
  return spacingHandles(layout).map((handle) => (
    <div
      key={spacingKey(handle)}
      className="absolute"
      style={{
        ...place({
          left: handle.area.x,
          top: handle.area.y,
          right: handle.area.x + handle.area.w,
          bottom: handle.area.y + handle.area.h
        }),
        background:
          handle.kind === "padding"
            ? "repeating-linear-gradient(-45deg, oklch(0.7 0.2 350 / 0.28) 0 1px, oklch(0.7 0.2 350 / 0.1) 1px 5px)"
            : "repeating-linear-gradient(45deg, oklch(0.7 0.2 350 / 0.35) 0 1px, oklch(0.7 0.2 350 / 0.14) 1px 5px)"
      }}
    />
  ))
}

function place(rect: Rect): CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }
}

/** Beside the prototype: what to try, and the style each change writes. */
function Written({ scene, selected, note }: { scene: Scene; selected: "layout" | string[]; note?: string }) {
  const keys: [string, ReactNode][] = [
    ["Drag a pink bar", "padding or gap, by 4px steps"],
    ["Click a bar", "type a value: 20, +8, a token's name"],
    ["Alt while dragging", "the opposite side too"],
    ["Alt+Shift", "every side"],
    ["Tab to a bar", "Up and Down step it, Enter types"],
    ["Double-click an edge", "hug"],
    ["Alt+double-click", "fill"],
    ["Alt while resizing", "from the middle"],
    ["Escape mid-drag", "takes it back"]
  ]

  return (
    <div className="flex w-80 flex-col gap-4 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {keys.map(([key, does]) => (
          <div key={key} className="contents">
            <dt className="font-medium">{key}</dt>
            <dd className="text-neutral-600">{does}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="mb-1 font-medium">
          Written {note && <span className="font-normal text-neutral-500">· {note}</span>}
        </div>
        <pre
          aria-label="The style written"
          className="rounded bg-white p-2 font-mono text-2xs/4 break-all whitespace-pre-wrap shadow-sm"
        >
          {[
            `Stats${selected === "layout" ? " (selected)" : ""}: ${JSON.stringify(scene.layout)}`,
            ...scene.children.map(
              (layer) =>
                `${layer.name}${selected !== "layout" && selected.includes(layer.id) ? " (selected)" : ""}: ${JSON.stringify(layer.style)}`
            )
          ].join("\n")}
        </pre>
      </div>
    </div>
  )
}
