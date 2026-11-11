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
import { type CSSProperties, type ReactElement, useEffect, useRef } from "react"
import { asEasing, pop, springs } from "../springs.ts"
import { type Command, keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"

/* What the bars floating on the canvas share (PAR-795): the toolbar, zoom, and the review tools' bars. */

/**
 * The surface each bar floating on the canvas sits on: a step off white on the light theme, so a line's highlight shows,
 * with hover and a picked stamp a step darker on it (see styles.css).
 */
export const floatingBar =
  "rounded-xl border bg-(--floating-bar) p-1 text-popover-foreground shadow-lg [--accent:var(--floating-bar-accent)] [--muted:var(--floating-bar-muted)]"

/**
 * A tool, 32px square as Figma's are, picked out in the canvas's selection blue at the step its chips use, so the white
 * icon on it reads at about 4.9:1, as tldraw and Figma pick theirs out in blue.
 */
export const toolButton =
  "size-8 min-w-8 px-0 aria-pressed:bg-(--canvas-layer-chip) aria-pressed:text-white aria-pressed:hover:bg-(--canvas-layer-chip)/90"

/**
 * Pressing a control on a bar (PAR-893): it dips while held and springs back along the pop spring. A square control or a
 * stamp dips to 90%, and one with a label, wider, to 95%, so both move about as far. Reduced motion keeps them still.
 * Each takes `pressMotion` as its style too.
 */
export const pressable = "active:scale-90 motion-reduce:active:scale-100"

export const pressableWide = "active:scale-95 motion-reduce:active:scale-100"

/** How a pressed control moves: only its scale springs, since a color overshooting would flash. */
export const pressMotion: CSSProperties = {
  transition: `scale ${Math.round(springs.pop.duration)}ms ${asEasing(springs.pop)}, background-color 150ms, color 150ms`
}

/** A picked control boings: it grows in from smaller, turning back upright. */
const pickedFrame = (progress: number): Keyframe => ({
  scale: String(0.6 + 0.4 * progress),
  rotate: `${(1 - progress) * -18}deg`
})

/** A ref for what boings when its control is picked: a tool's button, or a stamp's chip. */
export function usePickPop<T extends Element>(picked: boolean) {
  const ref = useRef<T>(null)
  const wasPicked = useRef(picked)

  useEffect(() => {
    if (picked && !wasPicked.current && ref.current) {
      pop(ref.current, pickedFrame)
    }

    wasPicked.current = picked
  }, [picked])

  return ref
}

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

/**
 * A line between a bar's groups, etched into it (PAR-893): a groove with a highlight on its right, through the bar's 4px
 * padding to its border, with 8px either side. Both are borders, since a browser rounds a border's width to whole
 * screen pixels; as a 1px background and shadow, two lines on one bar painted one and two pixels wide at 150% scaling.
 */
export function BarDivider() {
  return (
    <Separator
      orientation="vertical"
      className="-my-1 mx-1.5 border-x border-l-(--floating-bar-groove) border-r-(--floating-bar-highlight) bg-transparent data-vertical:w-0"
    />
  )
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
