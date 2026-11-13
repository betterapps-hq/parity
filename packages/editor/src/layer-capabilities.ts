import { type ContainerSpec, type DesignNode, isInnerPath } from "@parity-app/core"
import type { SelectedLayer } from "./style-editing.ts"

/**
 * Which of the Design tab's sections and controls the selection gets. The panel doesn't ask what type each node is: it
 * works out once what the selection can do (its capabilities), and two tables say what each section needs, in the
 * order the panel shows them: `panelTable` for every section, and `styleTable` for the style sections and their
 * conditional controls. The agreed tables are in docs/proposals/inspector-structure.md and
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
  "styled",
  /** It's a whole design rather than one of its layers. */
  "design",
  /** It's a component design, or a layer inside one. */
  "component",
  /** It's a component instance: of a component design, or of a code component. */
  "instance",
  /**
   * It passes attributes on to an element, in Attributes: a code component's instance. Layouts and text join it when
   * Attributes takes over Accessibility, and a design's instance once the file can hold them.
   */
  "attrs",
  /** It's a layer inside an instance, which edits only that copy. */
  "copy"
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
    styled: node.type !== "component" || takesStyle(node.component) !== false,
    design: false,
    component: design.kind === "component",
    instance: node.type === "instance" || node.type === "component",
    attrs: node.type === "component",
    copy: isInnerPath(layer.id)
  }
}

/** What a whole design can do, selected by itself: its root's capabilities, as the design rather than a layer. */
export function designCapabilities(
  design: Pick<ContainerSpec, "kind" | "root">,
  takesStyle: TakesStyle = notKnown
): Capabilities {
  return {
    ...layerCapabilities(design, { id: design.root.id, node: design.root, parent: undefined }, takesStyle),
    design: true
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
    styled: all("styled"),
    design: all("design"),
    component: all("component"),
    instance: all("instance"),
    attrs: all("attrs"),
    copy: all("copy")
  }
}

/** The Design tab's sections for one selected layer or design, in the order they show. */
export type InspectorSection =
  | "header"
  | "props"
  | "attributes"
  | "components"
  | "content"
  | "media"
  | "noStyle"
  | "styles"
  | "modes"
  | "export"

/** A section, and what the selection needs for it to show. */
export interface PanelPart {
  section: InspectorSection
  needs: (can: Capabilities) => boolean
}

/**
 * Each section of the Design tab, with what it needs, in the panel's order (PAR-1032). The header holds the state
 * selector, and Props holds the slots: a component design's to define, and an instance's to fill. The style sections
 * are one entry here, picked in turn by `styleTable`.
 */
export const panelTable: readonly PanelPart[] = [
  { section: "header", needs: () => true },
  // A component design defines its props; an instance sets them.
  { section: "props", needs: (can) => (can.design ? can.component : can.instance) },
  { section: "attributes", needs: (can) => !can.design && can.attrs },
  // A screen's: the repeated parts to make components of.
  { section: "components", needs: (can) => can.design && !can.component && !can.frame },
  { section: "content", needs: (can) => !can.design && can.text },
  // Inside an instance, an image's file belongs to its component.
  { section: "media", needs: (can) => !can.design && can.media && !can.copy },
  { section: "noStyle", needs: (can) => !can.design && !can.styled },
  // A screen or a component design is sized and styled through its layers; a frame through its own.
  { section: "styles", needs: (can) => !can.design || can.frame },
  { section: "modes", needs: (can) => can.design && !can.frame },
  { section: "export", needs: () => true }
]

/** Which sections a selection with these capabilities gets, in order. */
export function panelParts(can: Capabilities): InspectorSection[] {
  return panelTable.flatMap((part) => (part.needs(can) ? [part.section] : []))
}

/** The Design tab's style sections, in the order they show. */
export type StyleSection =
  | "frameSize"
  | "placement"
  | "layerOrder"
  | "transform"
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
  // Drawn inside Position, as how the layer is drawn where it sits.
  { section: "transform", needs: (can) => !can.root },
  { section: "size", needs: (can) => !can.frame },
  // Fill in the Sizing menu: a parent to fill, or children to fill it with.
  { control: "sizeFill", needs: (can) => can.inFlex || can.inGrid || can.box },
  // In a flex parent; a grid child aligns itself in Grid placement.
  { control: "alignSelf", needs: (can) => can.inFlex },
  { section: "gridPlacement", needs: (can) => can.inGrid },
  // Shown in Size until Grid placement has its own section.
  { control: "span", needs: (can) => can.inGrid },
  // Drawn inside Size: the box around the layer, outside in.
  { section: "spacing", needs: () => true },
  { control: "margin", needs: (can) => !can.root },
  { section: "layout", needs: (can) => can.box },
  { section: "text", needs: (can) => can.text || can.textInside },
  { control: "tag", needs: (can) => can.text },
  { control: "maxLines", needs: (can) => can.text },
  { control: "resizing", needs: (can) => can.text },
  { section: "appearance", needs: () => true },
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
