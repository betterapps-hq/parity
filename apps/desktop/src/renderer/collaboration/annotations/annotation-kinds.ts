import type { AnnotationKind, ReviewTool } from "@parity-app/editor"
import { Accessibility, CodeXml, type LucideIcon, MessageCircle, MousePointerClick, Pilcrow } from "lucide-react"

/**
 * Each kind of annotation's name, icon and hue, as PAR-184's design draws them, except Content's pilcrow, which replaced
 * a T that read as the Text tool.
 */
const kinds: Record<AnnotationKind, { name: string; icon: LucideIcon; hue: number }> = {
  behaviour: { name: "Behaviour", icon: MousePointerClick, hue: 250 },
  content: { name: "Content", icon: Pilcrow, hue: 150 },
  accessibility: { name: "Accessibility", icon: Accessibility, hue: 300 },
  development: { name: "Development", icon: CodeXml, hue: 60 }
}

/** How a review tool is named and drawn: on the review button and its tooltip, in the review menu, and on its bar. */
export interface ReviewToolLook {
  /** What the review menu calls it. */
  name: string
  /** What the review button and its tooltip call it. */
  label: string
  /** What its bar is to a screen reader. */
  barLabel: string
  /** What its bar says while it's picked. */
  doing: string
  /** What a click does while it's picked. */
  hint: string
  icon: LucideIcon
  /** Its color, for a kind of annotation. Comment has none, and takes the text's. */
  color?: string
  /** The command whose key picks it. */
  command: "comment" | "annotate"
}

export function reviewToolLook(tool: ReviewTool): ReviewToolLook {
  if (tool === "comment") {
    return {
      name: "Comment",
      label: "Comment",
      barLabel: "Comments",
      doing: "Commenting",
      hint: "Click anywhere to start a thread",
      icon: MessageCircle,
      command: "comment"
    }
  }

  const { name, icon, hue } = kinds[tool]

  return {
    name,
    label: `${name} annotation`,
    barLabel: `${name} annotations`,
    doing: `Annotating ${name.toLowerCase()}`,
    hint: "Click a layer to annotate it",
    icon,
    color: `oklch(0.7 0.15 ${hue})`,
    command: "annotate"
  }
}
