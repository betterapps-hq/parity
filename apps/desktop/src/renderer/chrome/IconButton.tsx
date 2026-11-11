import { Button, Tooltip, TooltipContent, TooltipTrigger, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import type { ReactNode } from "react"
import { actions } from "./actions.ts"
import { type Command, keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"
import { pressable as pressing, pressMotion } from "./toolbar-parts.tsx"

interface IconButtonProps {
  label: string
  shortcut?: string
  /** `icon` for a 32px button, as on the canvas's toolbar; small by default. */
  size?: "icon" | "icon-sm"
  disabled?: boolean
  /** Dips and springs back when pressed, as the controls on the canvas's floating bars do. */
  pressable?: boolean
  className?: string
  onClick: () => void
  children: ReactNode
}

export function IconButton({
  label,
  shortcut,
  size = "icon-sm",
  disabled,
  pressable = false,
  className,
  onClick,
  children
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            aria-label={label}
            disabled={disabled}
            className={pressable ? `${pressing} ${className ?? ""}` : className}
            style={pressable ? pressMotion : undefined}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        {label} {shortcut && <Kbd>{formatKeys(shortcut)}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

interface CommandButtonProps {
  command: Command
  children: ReactNode
}

/** A floating bar's button for a command: its label and first key in the tooltip, the bar's press, run from the toolbar. */
export function CommandButton({ command, children }: CommandButtonProps) {
  return (
    <IconButton
      label={keymap[command].label}
      shortcut={keymap[command].keys[0]}
      size="icon"
      pressable
      onClick={() => void actions[command].run("toolbar")}
    >
      {children}
    </IconButton>
  )
}
