import type { DesignNode, LibraryInfo } from "@parity-app/core"
import type { StyleSection } from "@parity-app/editor"
import type { LayerDefinition, PanelSection as TypeSection } from "@parity-app/layer-types"
import type { ComponentType } from "react"
import { AttributesSection, PropsSection } from "../inspector/sections/PropsSection.tsx"
import { isIconLayer } from "./layer-kind.ts"
import { LayerContent, LayerExport, LayerHeader, LayerMedia, LayerNoStyle, LayerStyles } from "./LayerPanel.tsx"
import { writesProps } from "./read-from-code.ts"
import { RoutePanel } from "./RoutePanel.tsx"
import { useSelectedLayer } from "./selected-layer.ts"

/**
 * Each layer kind's own Design panel (PAR-1056, docs/proposals/layer-panels.md). Every one is its header, the sections
 * before its style (what it shows, or the props it's given), its style sections in the kind's order, and Export, so a
 * kind is only those sections and its order. The capability table still leaves out what a layer can't take, as a design's root's Position.
 */
function kindPanel(name: string, order: readonly StyleSection[], before: readonly ComponentType[] = []) {
  function KindPanel() {
    const layer = useSelectedLayer()
    // What a story draws takes its args as props, which are written back to its file; nothing else of it is.
    const story = layer !== undefined && writesProps(layer.entry.path, layer.nodeId)

    return (
      <>
        <LayerHeader />
        {/* A kind's sections are fixed, so their place is their key. */}
        {before.map((Section, place) =>
          Section === PropsSection ? (
            <Section key={place} />
          ) : (
            <fieldset key={place} disabled={story} className="contents">
              <Section />
            </fieldset>
          )
        )}
        <fieldset disabled={story} className="contents">
          <LayerStyles order={order} />
        </fieldset>
        <LayerExport />
      </>
    )
  }

  KindPanel.displayName = name

  return KindPanel
}

/** Where a layer sits and how it's moved there, together in Position. */
const position: readonly StyleSection[] = ["placement", "layerOrder", "transform"]

/** How a layer is drawn after its fill and stroke, folded until each is set. */
const drawn: readonly StyleSection[] = ["effects", "motion", "rawCss"]

/** The kinds with a panel of their own: a layer's type, or an icon, which is a code component from an icon set. */
export type PanelKind = DesignNode["type"] | "icon"

/**
 * The style sections every kind shares, in one order after its own lead: its size and the box around it, where it sits,
 * how it's drawn as a whole, the text inside it, its fill and stroke, and what's folded until set. Each kind leaves out
 * what it doesn't have, and the capability table what its layers can't take.
 */
const shared: readonly StyleSection[] = [
  "size",
  "spacing",
  ...position,
  "appearance",
  "text",
  "fill",
  "stroke",
  ...drawn
]

/** The shared order without some sections, for a kind that doesn't have them. */
const sharedWithout = (...left: StyleSection[]) => shared.filter((section) => !left.includes(section))

/**
 * Every style section in order: the shared run, with how a layout lays out its children after where it sits, as Penpot
 * and Figma put a layer's own size and place before its layout. A frame's root starts with its size.
 */
export const styleOrder: readonly StyleSection[] = [
  "frameSize",
  ...shared.slice(0, shared.indexOf("appearance")),
  "layout",
  ...shared.slice(shared.indexOf("appearance"))
]

/** An image's or a video's style sections, the same for both. */
const mediaOrder = sharedWithout("text", "fill")

/** Both kinds of component instance's style sections: a component design's and a code component's. */
const instanceOrder = shared

/**
 * Each kind's style sections, in its order: its own panel's, and a selection of several layers of that one kind's
 * (`MultiLayerPanel`). The capability table still leaves out what the layers can't take.
 */
export const kindOrders = {
  /**
   * A layout (PAR-1057): its own size and the box around it and where it sits, then how it lays out its children, and
   * how it's drawn. Typography is for the text inside it.
   */
  layout: styleOrder,
  /**
   * A text layer (PAR-1058): its type and color, then how it sizes and where it sits, and how it's drawn. Fill is its
   * background, and folds until one is set.
   */
  text: ["text", ...sharedWithout("text")],
  /** An image or a video (PAR-1059, PAR-1060): no Fill, since the picture fills it. */
  image: mediaOrder,
  video: mediaOrder,
  /** An icon (PAR-1061): its color and stroke are its own, so it has no Typography, Fill or Stroke. */
  icon: sharedWithout("text", "fill", "stroke"),
  /** A component instance (PAR-1062): no Layout; Typography is for the text inside it. */
  instance: instanceOrder,
  component: instanceOrder
} satisfies Partial<Record<PanelKind, readonly StyleSection[]>>

/** The order of layers' style sections: their kind's when they're all of one kind that has one, otherwise every section's. */
export function oneKindOrder(kinds: readonly PanelKind[]): readonly StyleSection[] {
  const orders: Partial<Record<PanelKind, readonly StyleSection[]>> = kindOrders
  const [kind] = kinds

  return (kind !== undefined && kinds.every((each) => each === kind) ? orders[kind] : undefined) ?? styleOrder
}

/** The style sections each of a layer type's own sections shows (`@parity-app/layer-types`). */
const typeStyleSections: Record<TypeSection, readonly StyleSection[]> = {
  landmark: [],
  link: [],
  input: [],
  source: [],
  playback: [],
  layout: ["layout"],
  typography: ["text"],
  size: ["size", "spacing", ...position],
  fill: ["fill"],
  stroke: ["stroke"],
  appearance: ["appearance"]
}

/**
 * The style sections of a layer read from a component's element (read-only viewer), in order: its type's own, with
 * Spacing and Position after Size, as every box has them; Typography for a structure element, whose text inside
 * inherits it, as a layout's; and Effects, Motion and CSS, folded until set, last.
 */
export function elementOrder(element: LayerDefinition): readonly StyleSection[] {
  const own = element.sections.flatMap((section) => typeStyleSections[section])
  const inside: readonly StyleSection[] = element.family === "structure" ? ["text"] : []

  return [...new Set([...own, ...inside, ...drawn])]
}

/** A layout's panel (PAR-1057). */
export const LayoutPanel = kindPanel("LayoutPanel", kindOrders.layout)

/** A text layer's panel (PAR-1058): the text it shows, then its style. */
export const TextPanel = kindPanel("TextPanel", kindOrders.text, [LayerContent])

/** An image's or a video's panel (PAR-1059, PAR-1060): its file first; Content shows what differs, a video's controls. */
export const MediaPanel = kindPanel("MediaPanel", mediaOrder, [LayerMedia])

/**
 * An icon's panel (PAR-1061): which icon it is and the props it sets, what it passes on to its element, as its accessible
 * name, then its style, or a note in place of it when its component takes no `className`.
 */
export const IconPanel = kindPanel("IconPanel", kindOrders.icon, [PropsSection, AttributesSection, LayerNoStyle])

/**
 * A component instance's panel (PAR-1062), of a component design or of a code component: its props, with the slots it
 * fills, and what it passes on to its element, then its style. A code component that takes no `className` says so in
 * place of its style sections, which the capability table leaves out.
 */
export const InstancePanel = kindPanel("InstancePanel", instanceOrder, [PropsSection, AttributesSection, LayerNoStyle])

/** Each kind's panel. Read when a panel draws, so the panels above are built by then. */
export const kindPanels: Partial<Record<PanelKind, ComponentType>> = {
  component: InstancePanel,
  icon: IconPanel,
  instance: InstancePanel,
  image: MediaPanel,
  layout: LayoutPanel,
  route: RoutePanel,
  text: TextPanel,
  video: MediaPanel
}

/** Which kind's panel `LayerPanel` draws for a layer, when it has one of its own; the others are drawn from `panelParts`. */
export function panelKind(node: DesignNode, libraries: readonly Pick<LibraryInfo, "id" | "kind">[]): PanelKind {
  return isIconLayer(node, libraries) ? "icon" : node.type
}
