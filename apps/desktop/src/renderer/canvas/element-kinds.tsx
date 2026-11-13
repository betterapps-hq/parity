import type { ElementFamily, LayerIconName } from "@parity-app/layer-types"
import {
  AudioLines,
  Calendar,
  ChevronsUpDown,
  CircleDot,
  Film,
  Image,
  Link,
  List,
  Loader,
  type LucideIcon,
  type LucideProps,
  PanelsTopLeft,
  PenTool,
  PictureInPicture2,
  Pipette,
  Rows3,
  SeparatorHorizontal,
  SlidersHorizontal,
  SquareCheck,
  SquareMousePointer,
  SquareCode,
  Table,
  TextCursorInput,
  ToggleRight,
  Type,
  Upload
} from "lucide-react"
import { createElement } from "react"
import { kindColors } from "./kinds.tsx"

/**
 * The icons layer types name (`elementTypeIcons` in `@parity-app/layer-types`), as Lucide draws them.
 */
const layerIcons: Record<LayerIconName, LucideIcon> = {
  "rows-3": Rows3,
  "panels-top-left": PanelsTopLeft,
  type: Type,
  link: Link,
  "square-mouse-pointer": SquareMousePointer,
  "text-cursor-input": TextCursorInput,
  "square-check": SquareCheck,
  "circle-dot": CircleDot,
  "toggle-right": ToggleRight,
  "chevrons-up-down": ChevronsUpDown,
  "sliders-horizontal": SlidersHorizontal,
  calendar: Calendar,
  pipette: Pipette,
  upload: Upload,
  loader: Loader,
  image: Image,
  "pen-tool": PenTool,
  film: Film,
  "audio-lines": AudioLines,
  "square-code": SquareCode,
  table: Table,
  list: List,
  "separator-horizontal": SeparatorHorizontal,
  "picture-in-picture-2": PictureInPicture2
}

/** The icon a layer type names, in Layers and its panel's header. */
export function LayerIcon({ name, ...props }: LucideProps & { name: LayerIconName }) {
  return createElement(layerIcons[name], props)
}

/**
 * Each element family's color, which every type in it shares: Structure takes a layer's blue and Text text's green, as
 * layouts and text have on the canvas, and Media and Input have their own (see styles.css).
 */
export const elementFamilyColors: Record<ElementFamily, string> = {
  structure: kindColors.layer,
  text: kindColors.text,
  media: "var(--canvas-media)",
  input: "var(--canvas-input)"
}

/** Each family's color as 12px text on a panel, a darker step on the light theme (see styles.css). */
export const elementFamilyTextColors: Record<ElementFamily, string> = {
  structure: "var(--canvas-layer-text)",
  text: "var(--canvas-text-text)",
  media: "var(--canvas-media-text)",
  input: "var(--canvas-input-text)"
}
