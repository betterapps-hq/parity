/* oxlint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-tabindex -- the canvas takes keys and the boxes stand in for the canvas's layers, which take the pointer; the keyboard reaches them through Layers and the canvas's keys, as in the app */
import { Kbd, KbdGroup } from "@buildkitgg/shadcn-baseui-kit"
import {
  childNodes,
  type Color,
  colorCss,
  type DesignNode,
  fillCss,
  isFill,
  lengthSteps,
  lengthToken,
  type Named,
  type NodeStyle,
  type Size
} from "@parity-app/core"
import { selectedNodes, type Selection, sidesOf } from "@parity-app/editor"
import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon, designColor, layerLabel, nodeColor, NodeIcon } from "../../canvas/kinds.tsx"
import { containerModes } from "../../canvas/view.ts"
import { actions } from "../../chrome/actions.ts"
import { formatKeys } from "../../chrome/keys.ts"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { type ContainerEntry, useContainerEntries, useContainerEntry, useModeSettings } from "../../design-store.ts"
import { useHover, useSelection } from "../../selection.ts"
import { spacingUnit, useTokenList } from "../../tokens-store.ts"

/*
 * A sketch of the canvas, standing in for the board: the selected screen or component's first preview, drawn as boxes
 * from its root's layout and the layers straight inside it. A click on the root's padding selects the screen, a click
 * on a box selects that layer, and the keys are the app's own commands: Enter selects the layers inside, Shift+Enter the
 * parent, Esc steps back. Only the top level is drawn; deeper selections show in Layers and the inspector.
 */

/** The widest a preview is drawn here; wider modes are scaled down to it. */
const sketchWidth = 480

export function CanvasSketch() {
  const session = useProject()
  const { store, selection } = session
  const selected = useSelection(selection)
  // Keeps showing the last design selected once nothing is, so the board doesn't vanish on Esc.
  const [shown, setShown] = useState(selected.design)

  if (selected.design && selected.design !== shown) {
    setShown(selected.design)
  }

  const entry = useContainerEntry(store, shown)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && event.shiftKey) {
      void actions.selectParent.run("key", { session })
    } else if (event.key === "Enter") {
      void actions.selectChildren.run("key", { session })
    } else if (event.key === "Escape") {
      void actions.back.run("key", { session })
    } else {
      return
    }

    event.preventDefault()
  }

  return (
    <div
      role="application"
      aria-roledescription="canvas"
      aria-label="Canvas"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => selection.set({})}
      className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-8 overflow-hidden bg-muted/40 p-8 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset dark:bg-muted/20"
    >
      {entry && <BoardSketch entry={entry} selected={selected} />}
      {entry && <SelectingNote entry={entry} selected={selected} />}
    </div>
  )
}

function BoardSketch({ entry, selected }: { entry: ContainerEntry; selected: Selection }) {
  const session = useProject()
  const { store, selection } = session
  const hover = useHover(selection)
  const settings = useModeSettings(store)
  const tokens = useTokenList(session.tokens)
  const [overPadding, setOverPadding] = useState(false)
  const { container, key } = entry
  const { root } = container
  const { primary } = containerModes(settings, container)
  const width = container.frames?.[primary.viewport]?.width ?? primary.width
  const scale = Math.min(1, sketchWidth / width)
  const px = (length: Size | undefined) => (lengthSteps(length) ?? 0) * spacingUnit(tokens) * scale
  // A component at the root, such as a Card, draws its own padding and gap, which the sketch stands in for with Card's.
  const drawsOwn: NodeStyle = root.type === "component" ? { padding: [{ step: 6 }, { step: 0 }], gap: { step: 6 } } : {}
  const style: NodeStyle = { ...drawsOwn, ...root.style }
  const color = designColor(container.kind)
  const picked = selected.design === key ? selectedNodes(selected).filter((id) => id !== root.id) : []
  const containerSelected = selected.design === key && picked.length === 0
  const padding = sidesOf(style.padding)?.map(px) ?? [0, 0, 0, 0]
  const outline = outlineFor(color, containerSelected, hover?.design === key && !hover.node)

  return (
    <div className="flex flex-col gap-1.5" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => selection.set({ design: key })}
        className="flex items-center gap-1.5 self-start rounded-sm px-0.5 text-xs font-medium"
        style={{ color: containerSelected ? color : undefined }}
      >
        <DesignIcon kind={container.kind} className="size-3.5" style={{ color }} />
        {container.name}
      </button>
      <span className="flex items-center gap-1 px-0.5 text-[11px] text-muted-foreground">
        <ModeViewportIcon of={primary} className="size-3" aria-hidden />
        {primary.name} preview, {width}px
      </span>
      <div
        role="group"
        aria-label={`${container.name}'s ${primary.name} preview`}
        onClick={() => selection.set({ design: key })}
        onPointerMove={(event) => setOverPadding(event.target === event.currentTarget)}
        onPointerLeave={() => setOverPadding(false)}
        className="relative flex shadow-sm"
        style={{
          width: width * scale,
          minHeight: px(style.minHeight) || 120,
          flexDirection: style.flexDirection === "row" ? "row" : "column",
          gap: px(style.gap),
          padding: padding.map((side) => `${side}px`).join(" "),
          alignItems: flexAlign(style.alignItems),
          justifyContent: flexJustify(style.justifyContent),
          ...(style.fills ? fillCss(style.fills) : { background: "var(--background)" }),
          color: sketchColor(style.color, "var(--foreground)"),
          outline: outline || "1px solid var(--border)",
          outlineOffset: 0
        }}
      >
        {overPadding && <PaddingHatch padding={padding} color={color} name={container.name} />}
        {childNodes(root).map((node) => (
          <LayerSketch
            key={node.id}
            node={node}
            scale={scale}
            px={px}
            selected={picked.includes(node.id)}
            hovered={hover?.design === key && hover.node === node.id}
            onSelect={() => selection.set({ design: key, node: node.id })}
          />
        ))}
      </div>
    </div>
  )
}

/** A layer straight inside the root: its text, or a box named after it, as tall as what's inside suggests. */
function LayerSketch({
  node,
  scale,
  px,
  selected,
  hovered,
  onSelect
}: {
  node: DesignNode
  scale: number
  px: (length: Size | undefined) => number
  selected: boolean
  hovered: boolean
  onSelect: () => void
}) {
  const { store } = useProject()
  const entries = useContainerEntries(store)
  const style: NodeStyle = node.style ?? {}
  const color = nodeColor(node)
  let width: CSSProperties["width"]

  if (isFill(style.width)) {
    width = "100%"
  } else if (lengthSteps(style.width) !== undefined) {
    width = px(style.width)
  }

  const sized: CSSProperties = {
    width,
    maxWidth: lengthSteps(style.maxWidth) === undefined ? undefined : px(style.maxWidth),
    flexGrow: isFill(style.width) || style.grow ? 1 : undefined,
    outline: outlineFor(color, selected, hovered) || undefined,
    outlineOffset: 1
  }

  const select = (event: MouseEvent) => {
    event.stopPropagation()
    onSelect()
  }

  if (node.type === "text") {
    return (
      <p
        onClick={select}
        className="line-clamp-3 cursor-default rounded-[1px]"
        style={{
          ...sized,
          fontSize: Math.min(22, Math.max(10, textSize(style.fontSize) * scale * 1.6)),
          fontWeight: style.fontWeight,
          textAlign: style.textAlign,
          color: sketchColor(style.color, "inherit")
        }}
      >
        {node.text}
      </p>
    )
  }

  return (
    <div
      onClick={select}
      className="flex cursor-default items-start gap-1 rounded-sm border border-dashed border-current/25 bg-current/[0.04] px-1.5 py-1 text-[11px] text-muted-foreground"
      style={{ ...sized, minWidth: 72, height: Math.min(170, 22 + descendants(node) * 4) }}
    >
      <NodeIcon node={node} className="mt-px size-3 shrink-0" style={{ color }} />
      <span className="truncate">{layerLabel(node, entries, store.getComponentLibrary())}</span>
    </div>
  )
}

/**
 * One "/" line per 8px tile, drawn smooth. A tile of whole pixels at 100%, 125%, 150% and 200% repeats exactly, so
 * every line comes out the same width and the same distance apart, which a hard-edged gradient at 45° can't do.
 */
const hatchTile = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path d="M0 8L8 0M-1 1L1 -1M7 9L9 7" stroke="#000"/></svg>'
)}")`

/**
 * The root's padding, hatched in the selection color while the pointer's over it, as Figma shows a frame's. It's one
 * box masked to the padding, so the lines run on round the corners rather than starting again on each side.
 */
function PaddingHatch({ padding, color, name }: { padding: number[]; color: string; name: string }) {
  const [top, right, bottom, left] = padding

  const hatch: CSSProperties = {
    padding: `${top}px ${right}px ${bottom}px ${left}px`,
    background: `color-mix(in oklch, ${color} 60%, transparent)`,
    maskImage: `${hatchTile}, linear-gradient(#000 0 0), linear-gradient(#000 0 0)`,
    maskSize: "8px 8px, auto, auto",
    maskRepeat: "repeat, no-repeat, no-repeat",
    maskClip: "border-box, content-box, border-box",
    maskComposite: "intersect, exclude"
  }

  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={hatch} />
      <span
        className="pointer-events-none absolute -top-6 right-0 rounded-sm px-1.5 py-0.5 text-[11px] text-white"
        style={{ background: color }}
      >
        {name}&apos;s padding
      </span>
    </>
  )
}

/**
 * What a click and the keys select from here, with the step the selection is at marked. It's a note on the sketch,
 * not part of the app.
 */
function SelectingNote({ entry, selected }: { entry: ContainerEntry; selected: Selection }) {
  const { store } = useProject()
  const entries = useContainerEntries(store)
  const { container, key } = entry
  const top = childNodes(container.root)
  const names = top.map((node) => layerLabel(node, entries, store.getComponentLibrary()))
  const picked = selected.design === key ? selectedNodes(selected).filter((id) => id !== container.root.id) : []
  const onContainer = selected.design === key && picked.length === 0
  const onAllInside = picked.length === top.length && top.every((node) => picked.includes(node.id))
  const onOneInside = picked.length > 0 && !onAllInside && picked.every((id) => top.some((node) => node.id === id))
  const noun = container.kind === "component" ? "component" : "screen"

  return (
    <aside
      aria-label="How selecting works here"
      onClick={(event) => event.stopPropagation()}
      className="w-full max-w-[560px] rounded-lg border border-dashed bg-background/80 p-3 text-xs"
    >
      <p className="mb-2 text-muted-foreground">How selecting works here (a note on the sketch, not part of the app)</p>
      <ol className="flex flex-col gap-1">
        <Step at={onContainer} keys={<span className="text-foreground">Click its padding</span>}>
          Selects {container.name}, the {noun} itself. Its layout, padding, size and fill come first in the inspector.
        </Step>
        <Step at={onAllInside} keys={<Kbd>{formatKeys("Enter")}</Kbd>}>
          {names.length === 0
            ? "Nothing: there are no layers inside yet."
            : `Selects the ${names.length === 1 ? "layer" : `${names.length} layers`} inside: ${list(names)}.`}
        </Step>
        <Step
          at={onOneInside}
          keys={
            <KbdGroup>
              <Kbd>{formatKeys("Shift Enter")}</Kbd>
              <span className="text-muted-foreground">or</span>
              <Kbd>{formatKeys("Esc")}</Kbd>
            </KbdGroup>
          }
        >
          From a layer inside, selects {container.name} again.
        </Step>
      </ol>
    </aside>
  )
}

function Step({ at, keys, children }: { at: boolean; keys: ReactNode; children: ReactNode }) {
  return (
    <li
      aria-current={at ? "step" : undefined}
      className={`grid grid-cols-[150px_1fr] items-baseline gap-3 rounded-md px-2 py-1.5 ${at ? "bg-accent" : ""}`}
    >
      <span className="flex items-center">{keys}</span>
      <span className={at ? "text-foreground" : "text-muted-foreground"}>{children}</span>
    </li>
  )
}

/** A selection's outline: solid when selected, thin while hovered in Layers, none otherwise. */
function outlineFor(color: string, selected: boolean, hovered: boolean): string {
  if (selected) {
    return `2px solid ${color}`
  }

  if (hovered) {
    return `1px solid ${color}`
  }

  return ""
}

function list(names: string[]): string {
  if (names.length < 2) {
    return names.join("")
  }

  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

function descendants(node: DesignNode): number {
  return childNodes(node).reduce((count, child) => count + 1 + descendants(child), 0)
}

/** A color token as the chrome's own variable of that name, so the sketch follows the app's theme; else as written. */
function sketchColor(value: Color | undefined, fallback: string): string {
  return value === undefined ? fallback : colorCss(value)
}

const textSizes = new Map([
  ["text-xs", 12],
  ["text-sm", 14],
  ["text-base", 16],
  ["text-lg", 18],
  ["text-xl", 20],
  ["text-2xl", 24],
  ["text-3xl", 30],
  ["text-4xl", 36]
])

function textSize(size: Named | undefined): number {
  return textSizes.get(lengthToken(size) ?? "") ?? 16
}

function flexAlign(align: NodeStyle["alignItems"]): CSSProperties["alignItems"] {
  if (align === "start") {
    return "flex-start"
  }

  if (align === "end") {
    return "flex-end"
  }

  return align ?? "stretch"
}

function flexJustify(justify: NodeStyle["justifyContent"]): CSSProperties["justifyContent"] {
  if (justify === "start") {
    return "flex-start"
  }

  if (justify === "end") {
    return "flex-end"
  }

  return justify ?? "flex-start"
}
