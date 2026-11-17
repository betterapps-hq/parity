import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn"
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

/** A face in the stack: hover or focus for who it is, click or Enter for their card. */
export function StackFace({ presence, size, following, stale, defaultOpen, onFollow, onGoTo }: StackFaceProps) {
  const { member } = presence
  const status = statusOf(presence)
  const name = following ? `Following ${member.name}` : member.name

  return (
    <Popover defaultOpen={defaultOpen}>
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
        <PersonCard presence={presence} following={following} onFollow={onFollow} onGoTo={onGoTo} />
      </PopoverContent>
    </Popover>
  )
}
