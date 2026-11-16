import { Frame, Hand, type LucideIcon, MousePointer2, SquareMousePointer, Type } from "lucide-react"
import { kindColors, textFor } from "../../canvas/kinds.tsx"
import type { Tool } from "../../selection.ts"

export const toolIcons: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  hand: Hand,
  frame: Frame,
  text: Type,
  interact: SquareMousePointer
}

/**
 * The tools that make things wear the color the canvas selects what they make in, at the step that reads as text on a
 * panel: frames in the layer blue and text in text's green (PAR-792). Picked, they're white on the selection blue.
 */
export const toolTints: Partial<Record<Tool, string>> = {
  frame: textFor(kindColors.layer),
  text: textFor(kindColors.text)
}

/**
 * The tools that decide what the pointer does, in their menu's order. They share a button, as Figma's Move holds Hand
 * and Scale: it shows whichever was picked last, and the menu beside it switches. V, H and I still pick each.
 */
export const pointerTools = ["select", "hand", "interact"] as const satisfies readonly Tool[]

export type PointerTool = (typeof pointerTools)[number]

const pointerToolNames: readonly Tool[] = pointerTools

export function isPointerTool(tool: Tool): tool is PointerTool {
  return pointerToolNames.includes(tool)
}
