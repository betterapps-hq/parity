import { type ComponentLibrary, type ContainerKind, type DesignNode, nodeLabel } from "@parity-app/core"
import {
  AppWindow,
  Box,
  Columns3,
  Component,
  Diamond,
  Frame,
  Image as ImageIcon,
  type LucideProps,
  Rows3,
  Type
} from "lucide-react"
import type { ContainerEntry } from "../design-store.ts"

/**
 * Each kind of thing on the canvas has its own selection color and icon, so a glance tells a screen from a component,
 * a mode, or a layer inside a design.
 */
export const kindColors = {
  screen: "var(--canvas-screen)",
  component: "var(--canvas-component)",
  mode: "var(--canvas-mode)",
  layer: "var(--canvas-layer)",
  agent: "var(--canvas-agent)"
} as const

/** A design's color. A frame is a layout on the canvas, so it's selected in the layer color. */
export function designColor(kind: ContainerKind | undefined): string {
  if (kind === "frame") return kindColors.layer
  return kind === "component" ? kindColors.component : kindColors.screen
}

/** Library components and instances of component designs are purple; plain layout and text are layers. */
export function nodeColor(node: DesignNode): string {
  return node.type === "component" || node.type === "instance" ? kindColors.component : kindColors.layer
}

/**
 * A layer's name, with an unnamed instance called after its design ("Member row") rather than by the design's id. A
 * library's design, which isn't one of the `entries`, is found in `library` when it's given.
 */
export function layerLabel(node: DesignNode, entries: readonly ContainerEntry[], library?: ComponentLibrary): string {
  return nodeLabel(
    node,
    (id) => entries.find((entry) => entry.container.id === id)?.container.name ?? library?.get(id)?.name
  )
}

/** Each kind's icon: AppWindow for a screen, Component for a component, and Figma's frame glyph for a frame. */
export function DesignIcon({ kind, ...props }: LucideProps & { kind: ContainerKind | undefined }) {
  if (kind === "frame") return <Frame {...props} />
  return kind === "component" ? <Component {...props} /> : <AppWindow {...props} />
}

export function NodeIcon({ node, ...props }: LucideProps & { node: DesignNode }) {
  if (node.type === "text") return <Type {...props} />
  if (node.type === "image") return <ImageIcon {...props} />
  if (node.type === "component") return <Box {...props} />
  if (node.type === "instance") return <Diamond {...props} />
  return node.style?.direction === "row" ? <Columns3 {...props} /> : <Rows3 {...props} />
}

/** Focuses an element when it mounts: for inline rename fields that appear where the person double-clicked. */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
