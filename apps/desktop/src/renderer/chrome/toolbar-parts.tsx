import {
  Button,
  DropdownMenuTrigger,
  Kbd,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown } from "lucide-react"
import type { ReactElement } from "react"
import { type Command, keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"

/* What the bars floating on the canvas share (PAR-795): the toolbar, zoom, and the review tools' bars. */

/** The surface each bar floating on the canvas sits on. */
export const floatingBar = "rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"

/**
 * A tool, 32px square as Figma's are, picked out in the canvas's selection blue at the step its chips use, so the white
 * icon on it reads at about 4.9:1, as tldraw and Figma pick theirs out in blue.
 */
export const toolButton =
  "size-8 min-w-8 px-0 aria-pressed:bg-(--canvas-layer-chip) aria-pressed:text-white aria-pressed:hover:bg-(--canvas-layer-chip)/90"

interface CommandTipProps {
  command: Command
  /** What the control's called, when it isn't the command's own label. */
  label?: string
  children: ReactElement
}

/** A control's tooltip: its label and the first of its command's keys, as every tooltip in the app shows them. */
export function CommandTip({ command, label, children }: CommandTipProps) {
  const binding = keymap[command]

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">
        {label ?? binding.label} <Kbd>{formatKeys(binding.keys[0]!)}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/** A full-height line between a bar's groups. */
export function BarDivider() {
  return <Separator orientation="vertical" className="mx-1" />
}

interface MenuArrowProps {
  /** What the menu holds. */
  label: string
}

/** The arrow beside a tool that opens its menu, inside the menu's `DropdownMenu`. */
export function MenuArrow({ label }: MenuArrowProps) {
  return (
    <DropdownMenuTrigger
      render={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className="-ml-0.5 h-full w-4 text-muted-foreground"
        />
      }
    >
      <ChevronDown />
    </DropdownMenuTrigger>
  )
}
