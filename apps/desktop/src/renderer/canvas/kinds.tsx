import { type ComponentLibrary, type ContainerKind, type DesignNode, nodeLabel } from "@parity-app/core"
import {
  AppWindow,
  Box,
  Columns3,
  Component,
  Diamond,
  Frame,
  Grid3x3,
  Image as ImageIcon,
  type LucideProps,
  Rows3,
  SquareDashed,
  Type
} from "lucide-react"
import type { ContainerEntry } from "../design-store.ts"

/**
 * Each kind of thing on the canvas has its own selection color and icon, so a glance tells a screen from a component,
 * a mode, a layer inside a design, or the text among its layers (PAR-792).
 */
export const kindColors = {
  screen: "var(--canvas-screen)",
  component: "var(--canvas-component)",
  mode: "var(--canvas-mode)",
  layer: "var(--canvas-layer)",
  text: "var(--canvas-text)",
  agent: "var(--canvas-agent)"
} as const

/** A chip's fill and text, at least 4.5:1 apart, so its 11px text reads (see styles.css). */
export interface ChipColors {
  background: string
  color: string
}

/**
 * Each kind's chip over the canvas, such as a selection's label and size: a darker step of the selection color under
 * white, or, for the light hues, the selection color itself under near-black text.
 */
export const chipColors = {
  screen: { background: "var(--canvas-screen-chip)", color: "white" },
  component: { background: "var(--canvas-component-chip)", color: "white" },
  mode: { background: kindColors.mode, color: "var(--canvas-chip-ink)" },
  layer: { background: "var(--canvas-layer-chip)", color: "white" },
  text: { background: "var(--canvas-text-chip)", color: "white" },
  agent: { background: kindColors.agent, color: "var(--canvas-chip-ink)" }
} as const satisfies Record<keyof typeof kindColors, ChipColors>

/** Which kind a selection color from `kindColors` is. */
function kindOf(color: string): keyof typeof kindColors | undefined {
  // SAFETY: `kindColors` is a literal object declared here, so its keys are exactly these.
  return (Object.keys(kindColors) as (keyof typeof kindColors)[]).find((key) => kindColors[key] === color)
}

/** The chip that goes with a selection color from `kindColors`. */
export function chipFor(color: string): ChipColors {
  const kind = kindOf(color)

  return kind ? chipColors[kind] : { background: color, color: "white" }
}

/** The selection colors as text on a panel, a darker step on the light theme so 12px text reads (see styles.css). */
const textColors: Partial<Record<keyof typeof kindColors, string>> = {
  screen: "var(--canvas-screen-text)",
  component: "var(--canvas-component-text)",
  layer: "var(--canvas-layer-text)",
  text: "var(--canvas-text-text)"
}

/** The text color that goes with a selection color from `kindColors`, or the color itself for one without. */
export function textFor(color: string): string {
  const kind = kindOf(color)

  return (kind && textColors[kind]) ?? color
}

/** A design's color. A frame is a layout on the canvas, so it's selected in the layer color. */
export function designColor(kind: ContainerKind | undefined): string {
  if (kind === "frame") {
    return kindColors.layer
  }

  return kind === "component" ? kindColors.component : kindColors.screen
}

/** Library components and instances of component designs are purple, text is green, and plain layout is a layer. */
export function nodeColor(node: DesignNode): string {
  if (node.type === "component" || node.type === "instance") {
    return kindColors.component
  }

  return node.type === "text" ? kindColors.text : kindColors.layer
}

/**
 * A layer's name, with an unnamed instance called after its design ("Member row") rather than by the design's id. A
 * library's design, which isn't one of the `entries`, is found in `library` when it's given.
 */
export function layerLabel(node: DesignNode, entries: readonly ContainerEntry[], library?: ComponentLibrary): string {
  return nodeLabel(node, designNamer(entries, library))
}

/** Finds a design's name by its id: one of the project's `entries`, else one of `library`'s designs. */
export function designNamer(
  entries: readonly ContainerEntry[],
  library?: ComponentLibrary
): (id: string) => string | undefined {
  return (id) => entries.find((entry) => entry.container.id === id)?.container.name ?? library?.get(id)?.name
}

/** Each kind's icon: AppWindow for a screen, Component for a component, and Figma's frame glyph for a frame. */
export function DesignIcon({ kind, ...props }: LucideProps & { kind: ContainerKind | undefined }) {
  if (kind === "frame") {
    return <Frame {...props} />
  }

  return kind === "component" ? <Component {...props} /> : <AppWindow {...props} />
}

export function NodeIcon({ node, ...props }: LucideProps & { node: DesignNode }) {
  if (node.type === "text") {
    return <Type {...props} />
  }

  if (node.type === "image") {
    return <ImageIcon {...props} />
  }

  if (node.type === "component") {
    return <Box {...props} />
  }

  if (node.type === "instance") {
    return <Diamond {...props} />
  }

  // A slot is a hole each instance fills.
  if (node.slot !== undefined) {
    return <SquareDashed {...props} />
  }

  if (node.style?.display === "grid") {
    return <Grid3x3 {...props} />
  }

  return node.style?.direction === "row" ? <Columns3 {...props} /> : <Rows3 {...props} />
}

/** Focuses an element when it mounts: for inline rename fields that appear where the person double-clicked. */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
