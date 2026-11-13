import type { StyleSection } from "@parity-app/editor"
import { LayerExport, LayerHeader, LayerStyles } from "./LayerPanel.tsx"

/**
 * A layout's sections, in its panel's order: how it lays out its children first, then its own size and the box around
 * it, where it sits, and how it's drawn. Typography, for the text inside it, folds until it's set. A frame's root starts
 * with the frame's size, and a design's root leaves out where it sits, as the capability table says.
 */
export const layoutSections: readonly StyleSection[] = [
  "frameSize",
  "layout",
  "size",
  "spacing",
  "placement",
  "layerOrder",
  "transform",
  "fill",
  "stroke",
  "appearance",
  "text",
  "effects",
  "motion",
  "rawCss"
]

/** A layout's Design panel (PAR-1057): its header, its style sections in a layout's order, and Export. */
export function LayoutPanel() {
  return (
    <>
      <LayerHeader />
      <LayerStyles order={layoutSections} />
      <LayerExport />
    </>
  )
}
