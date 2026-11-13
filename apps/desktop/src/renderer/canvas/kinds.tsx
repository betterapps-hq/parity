import {
  type ComponentLibrary,
  type ContainerKind,
  type DesignNode,
  type LibraryInfo,
  nodeLabel
} from "@parity-app/core"
import { describeElement, elementFamilies } from "@parity-app/layer-types"
import {
  AppWindow,
  Columns3,
  Component,
  Diamond,
  Film,
  Frame,
  Grid3x3,
  Image as ImageIcon,
  type LucideProps,
  Route,
  Rows3,
  Smile,
  SquareDashed,
  Type
} from "lucide-react"
import { useContext } from "react"
import { isIconLayer, unnamedIconLabel } from "../chrome/layer-kind.ts"
import type { ContainerEntry } from "../design-store.ts"
import { ProjectContext } from "./context.ts"
import { elementFamilyColors, elementFamilyTextColors, LayerIcon } from "./element-kinds.tsx"

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
  const family = elementFamilies.find((each) => elementFamilyColors[each] === color)

  return (kind && textColors[kind]) ?? (family && elementFamilyTextColors[family]) ?? color
}

/** A design's color. A frame is a layout on the canvas, so it's selected in the layer color. */
export function designColor(kind: ContainerKind | undefined): string {
  if (kind === "frame") {
    return kindColors.layer
  }

  return kind === "component" ? kindColors.component : kindColors.screen
}

/**
 * Library components and instances of component designs are purple, text is green, and plain layout is a layer; a
 * layer read from an element is its family's color.
 */
export function nodeColor(node: DesignNode): string {
  // A layer read from a component's element is in its type's family color (`@parity-app/layer-types`).
  if (node.element) {
    return elementFamilyColors[describeElement(node.element).family]
  }

  // What a route draws is its component (PAR-1076).
  if (node.type === "component" || node.type === "instance" || (node.type === "route" && node.component)) {
    return kindColors.component
  }

  return node.type === "text" ? kindColors.text : kindColors.layer
}

/**
 * A layer's name, with an unnamed instance called after its design ("Member row") rather than by the design's id. A
 * library's design, which isn't one of the `entries`, is found in `library` when it's given. An unnamed icon is called
 * by its icon when the project's `libraries` are given (`unnamedIconLabel`).
 */
export function layerLabel(
  node: DesignNode,
  entries: readonly ContainerEntry[],
  library?: ComponentLibrary,
  libraries?: readonly Pick<LibraryInfo, "id" | "kind">[]
): string {
  return (libraries && unnamedIconLabel(node, libraries)) ?? nodeLabel(node, designNamer(entries, library))
}

/** Finds a design's name by its id: one of the project's `entries`, else one of `library`'s designs. */
export function designNamer(
  entries: readonly ContainerEntry[],
  library?: ComponentLibrary
): (id: string) => string | undefined {
  return (id) => entries.find((entry) => entry.container.id === id)?.container.name ?? library?.get(id)?.name
}

/** Each kind's icon: AppWindow for a screen, Component for a component, and Figma's frame glyph for a frame. */
export function DesignIcon({
  kind,
  route = false,
  ...props
}: LucideProps & { kind: ContainerKind | undefined; route?: boolean }) {
  // A page of the app shows the route it's drawn at (PAR-1076).
  if (route) {
    return <Route {...props} />
  }

  if (kind === "frame") {
    return <Frame {...props} />
  }

  return kind === "component" ? <Component {...props} /> : <AppWindow {...props} />
}

/**
 * A layer's kind as an icon. An icon layer shows Smile, the Icons tab's icon, whatever it draws (PAR-793): its own glyph
 * could be one of these kinds' icons, or look like a button in its row. Any other placed component is an instance, its
 * component code or a design, and shows the instance's Diamond. Which libraries are icon sets comes from the
 * project of the tab it's drawn in, or from `libraries` where it's drawn outside one, as Search actions is.
 */
export function NodeIcon({
  node,
  libraries,
  ...props
}: LucideProps & { node: DesignNode; libraries?: readonly LibraryInfo[] }) {
  const project = useContext(ProjectContext)

  // A layer read from a component's element shows its type's icon, as Button or Link (`@parity-app/layer-types`).
  if (node.element) {
    return <LayerIcon {...props} name={describeElement(node.element).icon} />
  }

  if (node.type === "text") {
    return <Type {...props} />
  }

  if (node.type === "image") {
    return <ImageIcon {...props} />
  }

  if (node.type === "video") {
    return <Film {...props} />
  }

  if (node.type === "component") {
    return isIconLayer(node, libraries ?? project?.info.libraries ?? []) ? <Smile {...props} /> : <Diamond {...props} />
  }

  if (node.type === "instance") {
    return <Diamond {...props} />
  }

  // What a route draws shows as the component it is; a route that names none, as a redirecting index, as a route.
  if (node.type === "route") {
    return node.component ? <Diamond {...props} /> : <Route {...props} />
  }

  // A slot is a hole each instance fills.
  if (node.slot !== undefined) {
    return <SquareDashed {...props} />
  }

  if (node.style?.display === "grid") {
    return <Grid3x3 {...props} />
  }

  return node.style?.flexDirection === "row" ? <Columns3 {...props} /> : <Rows3 {...props} />
}

/** Focuses an element when it mounts: for inline rename fields that appear where the person double-clicked. */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
