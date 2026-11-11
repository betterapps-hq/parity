import { type ContainerSpec, type DesignNode, isInnerPath } from "@parity-app/core"
import type { SelectedLayer } from "./style-editing.ts"

/**
 * Which of the Design tab's style sections and controls the selected layers get. The panel doesn't ask what type each
 * node is: it works out once what the layers can do (their capabilities), and one table says what each section and
 * each conditional control needs, in the order the panel shows them. The agreed table is in
 * docs/proposals/design-panel-sections.md.
 */

/** What a layer can do, which picks its sections and controls. */
export const capabilityNames = [
  /** It's a layout: a flex or grid box with children of its own. */
  "box",
  /** It's its design's outermost layout. */
  "root",
  /** It's a frame's root, which sizes the frame. */
  "frame",
  /** It's a text layer. In a mixed selection, the text layers have it. */
  "text",
  /** It's a layout, a component or an instance, whose text inherits what it sets. */
  "textInside",
  /** It's an image or a video. */
  "media",
  /** Its parent is a flex layout. */
  "inFlex",
  /** Its parent is a grid. */
  "inGrid",
  /** It takes style: every layer except a code component whose props take no `className`. */
  "styled"
] as const

export type Capability = (typeof capabilityNames)[number]

export type Capabilities = Readonly<Record<Capability, boolean>>

/** What a design says about its layers: which is its root, and whether it's a frame's. */
export type CapabilityDesign = Pick<ContainerSpec, "kind"> & { root: Pick<DesignNode, "id"> }

/** A selected layer as `styleSelection` gives it: its id, how it's shown, and the layout it sits in. */
export type CapableLayer = Pick<SelectedLayer, "id" | "node" | "parent">

/**
 * Whether a code component takes style, by its name: false when its props take no `className`, undefined when that
 * isn't known, which counts as taking it. The app reads it from the component's props.
 */
export type TakesStyle = (component: string) => boolean | undefined

const notKnown: TakesStyle = () => undefined

/** What one layer of `design` can do. */
export function layerCapabilities(
  design: CapabilityDesign,
  layer: CapableLayer,
  takesStyle: TakesStyle = notKnown
): Capabilities {
  const { node, parent } = layer
  // A layer inside an instance, by its path, is never this design's root.
  const root = !isInnerPath(layer.id) && layer.id === design.root.id

  return {
    box: node.type === "layout",
    root,
    frame: root && design.kind === "frame",
    text: node.type === "text",
    textInside: node.type === "layout" || node.type === "component" || node.type === "instance",
    media: node.type === "image" || node.type === "video",
    inFlex: parent !== undefined && !parent.grid,
    inGrid: parent?.grid === true,
    styled: node.type !== "component" || takesStyle(node.component) !== false
  }
}

/**
 * What the selected layers can do together: a capability holds when it holds for every layer, except `text`, which
 * holds when any of them is text, for the text layers of a mixed selection. Nothing holds for no layers.
 */
export function selectionCapabilities(
  design: CapabilityDesign,
  layers: readonly CapableLayer[],
  takesStyle?: TakesStyle
): Capabilities {
  const each = layers.map((layer) => layerCapabilities(design, layer, takesStyle))
  const all = (capability: Capability) => each.length > 0 && each.every((layer) => layer[capability])

  return {
    box: all("box"),
    root: all("root"),
    frame: all("frame"),
    text: each.some((layer) => layer.text),
    textInside: all("textInside"),
    media: all("media"),
    inFlex: all("inFlex"),
    inGrid: all("inGrid"),
    styled: all("styled")
  }
}

/** The Design tab's style sections, in the order they show. */
export type StyleSection =
  | "frameSize"
  | "placement"
  | "layerOrder"
  | "size"
  | "gridPlacement"
  | "layout"
  | "spacing"
  | "appearance"
  | "text"
  | "fill"
  | "stroke"
  | "effects"
  | "motion"
  | "rawCss"

/** The controls inside a section that show only for some layers. */
export type StyleControl = "sizeFill" | "alignSelf" | "span" | "margin" | "tag" | "maxLines" | "resizing"

/** A section or a conditional control, and what the selected layers need for it to show. */
export type StylePart = ({ section: StyleSection } | { control: StyleControl }) & {
  needs: (can: Capabilities) => boolean
}

/**
 * Each section and each conditional control, with what it needs, in the panel's order: a control's row follows its
 * section's. Every one also needs `styled` (see `styleParts`). Adding, removing or moving one is one line.
 */
export const styleTable: readonly StylePart[] = [
  { section: "frameSize", needs: (can) => can.frame },
  { section: "placement", needs: (can) => !can.root },
  { section: "layerOrder", needs: (can) => !can.root },
  { section: "size", needs: (can) => !can.frame },
  // Fill in the Sizing menu: a parent to fill, or children to fill it with.
  { control: "sizeFill", needs: (can) => can.inFlex || can.inGrid || can.box },
  // In a flex parent; a grid child aligns itself in Grid placement.
  { control: "alignSelf", needs: (can) => can.inFlex },
  { section: "gridPlacement", needs: (can) => can.inGrid },
  // Shown in Size until Grid placement has its own section.
  { control: "span", needs: (can) => can.inGrid },
  { section: "layout", needs: (can) => can.box },
  { section: "spacing", needs: () => true },
  { control: "margin", needs: (can) => !can.root },
  { section: "appearance", needs: () => true },
  { section: "text", needs: (can) => can.text || can.textInside },
  { control: "tag", needs: (can) => can.text },
  { control: "maxLines", needs: (can) => can.text },
  { control: "resizing", needs: (can) => can.text },
  { section: "fill", needs: () => true },
  { section: "stroke", needs: () => true },
  { section: "effects", needs: () => true },
  { section: "motion", needs: () => true },
  { section: "rawCss", needs: () => true }
]

/** The sections that show, in order, and the conditional controls that show inside them. */
export interface StyleParts {
  sections: StyleSection[]
  controls: ReadonlySet<StyleControl>
}

/** Which sections and conditional controls layers with these capabilities get. */
export function styleParts(can: Capabilities): StyleParts {
  const shown = styleTable.filter((part) => can.styled && part.needs(can))

  return {
    sections: shown.flatMap((part) => ("section" in part ? [part.section] : [])),
    controls: new Set(shown.flatMap((part) => ("control" in part ? [part.control] : [])))
  }
}
