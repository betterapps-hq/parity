import { Button, Tooltip, TooltipContent, TooltipTrigger, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import type { ReactNode } from "react"
import { formatKeys } from "./keys.ts"

interface IconButtonProps {
  label: string
  shortcut?: string
  /** `icon` for a 32px button, as on the canvas's toolbar; small by default. */
  size?: "icon" | "icon-sm"
  disabled?: boolean
  className?: string
  onClick: () => void
  children: ReactNode
}

export function IconButton({
  label,
  shortcut,
  size = "icon-sm",
  disabled,
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
            className={className}
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
