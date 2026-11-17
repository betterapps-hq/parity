import type { DesignNode, LibraryInfo } from "@parity-app/core"
import type { StyleSection } from "@parity-app/editor"
import type { ComponentType } from "react"
import { AttributesSection, PropsSection } from "../inspector/sections/PropsSection.tsx"
import { isIconLayer } from "./layer-kind.ts"
import { LayerContent, LayerExport, LayerHeader, LayerMedia, LayerNoStyle, LayerStyles } from "./LayerPanel.tsx"
import { RoutePanel } from "./RoutePanel.tsx"

/**
 * Each layer kind's own Design panel (PAR-1056, docs/proposals/layer-panels.md). Every one is its header, the sections
 * before its style (what it shows, or the props it's given), its style sections in the kind's order, and Export, so a
 * kind is only those sections and its order. The capability table still leaves out what a layer can't take, as a design's root's Position.
 */
function kindPanel(name: string, order: readonly StyleSection[], before: readonly ComponentType[] = []) {
  function KindPanel() {
    return (
      <>
        <LayerHeader />
        {/* A kind's sections are fixed, so their place is their key. */}
        {before.map((Section, place) => (
          <Section key={place} />
        ))}
        <LayerStyles order={order} />
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

/** An image's or a video's style sections, the same for both. */
const mediaOrder: readonly StyleSection[] = ["size", "spacing", ...position, "appearance", "stroke", ...drawn]

/** Both kinds of component instance's style sections: a component design's and a code component's. */
const instanceOrder: readonly StyleSection[] = [
  "size",
  "spacing",
  ...position,
  "text",
  "appearance",
  "fill",
  "stroke",
  ...drawn
]

/**
 * Each kind's style sections, in its order: its own panel's, and a selection of several layers of that one kind's
 * (`MultiLayerPanel`). The capability table still leaves out what the layers can't take.
 */
export const kindOrders = {
  /**
   * A layout (PAR-1057): how it lays out its children first, then its own size and the box around it, where it sits,
   * and how it's drawn. Typography, for the text inside it, folds until it's set. A frame's root starts with its size.
   */
  layout: ["frameSize", "layout", "size", "spacing", ...position, "fill", "stroke", "appearance", "text", ...drawn],
  /**
   * A text layer (PAR-1058): its type and color, then how it sizes and where it sits, and how it's drawn. Fill is its
   * background, and folds until one is set.
   */
  text: ["text", "size", "spacing", ...position, "appearance", "fill", "stroke", ...drawn],
  /** An image or a video (PAR-1059, PAR-1060): no Fill, since the picture fills it. */
  image: mediaOrder,
  video: mediaOrder,
  /** An icon (PAR-1061): its color and stroke are its own, so it has no Typography, Fill or Stroke. */
  icon: ["size", "spacing", ...position, "appearance", ...drawn],
  /** A component instance (PAR-1062): no Layout; Typography is for the text inside it. */
  instance: instanceOrder,
  component: instanceOrder
} satisfies Partial<Record<PanelKind, readonly StyleSection[]>>

/** The order of layers' style sections when they're all of one kind that has one; none for layers of different kinds. */
export function oneKindOrder(kinds: readonly PanelKind[]): readonly StyleSection[] | undefined {
  const orders: Partial<Record<PanelKind, readonly StyleSection[]>> = kindOrders
  const [kind] = kinds

  return kind !== undefined && kinds.every((each) => each === kind) ? orders[kind] : undefined
}

/** A layout's panel (PAR-1057). */
export const LayoutPanel = kindPanel("LayoutPanel", kindOrders.layout)

/** A text layer's panel (PAR-1058): the text it shows, then its style. */
export const TextPanel = kindPanel("TextPanel", kindOrders.text, [LayerContent])

/** An image's or a video's panel (PAR-1059, PAR-1060): its file first; Content shows what differs, a video's controls. */
export const MediaPanel = kindPanel("MediaPanel", mediaOrder, [LayerMedia])

/** An icon's panel (PAR-1061): which icon it is and the props it sets, then its style. */
export const IconPanel = kindPanel("IconPanel", kindOrders.icon, [PropsSection])

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
