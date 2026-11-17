import type { DesignNode, LibraryInfo } from "@parity-app/core"
import type { StyleSection } from "@parity-app/editor"
import type { ComponentType } from "react"
import { PropsSection } from "../inspector/sections/PropsSection.tsx"
import { isIconLayer } from "./layer-kind.ts"
import { LayerContent, LayerExport, LayerHeader, LayerMedia, LayerStyles } from "./LayerPanel.tsx"
import { RoutePanel } from "./RoutePanel.tsx"

/**
 * Each layer kind's own Design panel (PAR-1056, docs/proposals/layer-panels.md). Every one is its header, what the layer
 * shows when it has content, its style sections in the kind's order, and Export, so a kind is only its order and its
 * content. The capability table still leaves out what a layer can't take, as a design's root's Position.
 */
function kindPanel(name: string, order: readonly StyleSection[], Content?: ComponentType) {
  function KindPanel() {
    return (
      <>
        <LayerHeader />
        {Content && <Content />}
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

/**
 * A layout (PAR-1057): how it lays out its children first, then its own size and the box around it, where it sits, and
 * how it's drawn. Typography, for the text inside it, folds until it's set. A frame's root starts with the frame's size.
 */
export const LayoutPanel = kindPanel("LayoutPanel", [
  "frameSize",
  "layout",
  "size",
  "spacing",
  ...position,
  "fill",
  "stroke",
  "appearance",
  "text",
  ...drawn
])

/**
 * A text layer (PAR-1058): the text it shows, its type and color, then how it sizes and where it sits, and how it's
 * drawn. Fill is its background, and folds until one is set.
 */
export const TextPanel = kindPanel(
  "TextPanel",
  ["text", "size", "spacing", ...position, "appearance", "fill", "stroke", ...drawn],
  LayerContent
)

/**
 * An image's or a video's sections: its size, where it sits, its corners and opacity, and its border, after its file. It
 * has no Fill: the picture fills it.
 */
const mediaSections: readonly StyleSection[] = ["size", "spacing", ...position, "appearance", "stroke", ...drawn]

/** An image or a video (PAR-1059, PAR-1060): the same panel, since Content shows what differs, a video's controls. */
export const MediaPanel = kindPanel("MediaPanel", mediaSections, LayerMedia)

/**
 * An icon (PAR-1061): which icon it is and the props it sets, then its size and where it sits, and how it's drawn. Its
 * color and stroke are the icon's own, so it has no Typography, Fill or Stroke.
 */
export const IconPanel = kindPanel("IconPanel", ["size", "spacing", ...position, "appearance", ...drawn], PropsSection)

/** The kinds with a panel of their own: a layer's type, or an icon, which is a code component from an icon set. */
export type PanelKind = DesignNode["type"] | "icon"

/** Each kind's panel. Read when a panel draws, so the panels above are built by then. */
export const kindPanels: Partial<Record<PanelKind, ComponentType>> = {
  icon: IconPanel,
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
