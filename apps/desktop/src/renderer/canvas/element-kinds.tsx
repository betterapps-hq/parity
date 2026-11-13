import type { ElementFamily, ElementType } from "@parity-app/editor"
import {
  AudioLines,
  Film,
  Image,
  Link,
  List,
  type LucideIcon,
  PanelsTopLeft,
  PenTool,
  PictureInPicture2,
  Rows3,
  SeparatorHorizontal,
  SquareCode,
  Table,
  TextCursorInput,
  Type
} from "lucide-react"
import { kindColors } from "./kinds.tsx"

/** Each element type's icon in Layers and its panel's header (read-only viewer). */
export const elementTypeIcons: Record<ElementType, LucideIcon> = {
  layout: Rows3,
  region: PanelsTopLeft,
  text: Type,
  link: Link,
  input: TextCursorInput,
  image: Image,
  vector: PenTool,
  video: Film,
  audio: AudioLines,
  embed: SquareCode,
  table: Table,
  list: List,
  divider: SeparatorHorizontal,
  overlay: PictureInPicture2
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
