import type { StyleSection } from "@parity-app/editor"
import { LayerContent, LayerExport, LayerHeader, LayerStyles } from "./LayerPanel.tsx"

/**
 * A text layer's sections, in its panel's order: its type and color first, then how it sizes and where it sits, and how
 * it's drawn. Fill is its background, and folds until one is set.
 */
const textSections: readonly StyleSection[] = [
  "text",
  "size",
  "spacing",
  "placement",
  "layerOrder",
  "transform",
  "appearance",
  "fill",
  "stroke",
  "effects",
  "motion",
  "rawCss"
]

/** A text layer's Design panel (PAR-1058): its header, the text it shows, its style sections in a text layer's order, and Export. */
export function TextPanel() {
  return (
    <>
      <LayerHeader />
      <LayerContent />
      <LayerStyles order={textSections} />
      <LayerExport />
    </>
  )
}
