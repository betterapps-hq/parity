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
  defaultOpen: boolean
}

/** A face in the stack: hover for who it is, click or Enter for their card. */
export function StackFace({ presence, size, following, stale, defaultOpen }: StackFaceProps) {
  const { member } = presence

  return (
    <Popover defaultOpen={defaultOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={[member.name, statusOf(presence)].filter(Boolean).join(", ")}
                  className={faceButton}
                >
                  <Face member={member} size={size} away={stale || Boolean(presence.away)} following={following} />
                </button>
              }
            />
          }
        />
        <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
          <span className="font-medium">{following ? `Following ${member.name}` : member.name}</span>
          {statusOf(presence) && <span className="text-background/70">{statusOf(presence)}</span>}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={10} className="w-72 gap-0 overflow-hidden p-0">
        <PersonCard presence={presence} following={following} />
      </PopoverContent>
    </Popover>
  )
}
