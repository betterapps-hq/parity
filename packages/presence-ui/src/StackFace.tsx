import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn"
import { useState } from "react"
import { faceButton } from "./face-button.ts"
import { Face } from "./Face.tsx"
import { type Presence, statusOf } from "./member.ts"
import { PersonCard } from "./PersonCard.tsx"

interface StackFaceProps {
  presence: Presence
  size: number
  following: boolean
  stale: boolean
  defaultOpen?: boolean
  onFollow?: () => void
  onGoTo?: () => void
}

/**
 * A face in the stack: hover or focus for who it is, click or Enter for their card. The card closes once Follow or Go to
 * starts, so it's out of the way of what you went to see.
 */
export function StackFace({ presence, size, following, stale, defaultOpen, onFollow, onGoTo }: StackFaceProps) {
  const { member } = presence
  const status = statusOf(presence)
  const name = following ? `Following ${member.name}` : member.name
  const [open, setOpen] = useState(Boolean(defaultOpen))

  const closing = (action: (() => void) | undefined) =>
    action &&
    (() => {
      setOpen(false)
      action()
    })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button type="button" aria-label={[name, status].filter(Boolean).join(", ")} className={faceButton}>
                  <Face member={member} size={size} away={stale || Boolean(presence.away)} following={following} />
                </button>
              }
            />
          }
        />
        <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
          <span className="font-medium">{name}</span>
          {status && <span className="text-background/70">{status}</span>}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={10} className="w-72 gap-0 overflow-hidden p-0">
        <PersonCard presence={presence} following={following} onFollow={closing(onFollow)} onGoTo={closing(onGoTo)} />
      </PopoverContent>
    </Popover>
  )
}
