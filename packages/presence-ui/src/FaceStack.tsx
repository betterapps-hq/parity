import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn"
import { floatingBar } from "./bar.tsx"
import { EveryoneCount } from "./EveryoneCount.tsx"
import { faceButton } from "./face-button.ts"
import { Face } from "./Face.tsx"
import { arrange, keyOf, type Member, type Presence, shownCount } from "./member.ts"
import { StackFace } from "./StackFace.tsx"
import { YouCard } from "./YouCard.tsx"

/*
 * Faces overlap a little, short of their initials, and spread apart while the pointer's over the stack or a face in it
 * has focus, so each is easy to hit. The margin eases as Parity's drags settle.
 */
const overlap =
  "-ml-1 transition-[margin] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover/stack:ml-1 group-focus-within/stack:ml-1 motion-reduce:transition-none"

interface FaceStackProps {
  /** Everyone else here, in the order they joined. */
  here: Presence[]
  /** You, first in the stack. */
  you?: Member
  following?: Member
  max?: number
  size?: number
  /** Whether where everyone is might be out of date, while the connection's down: their faces fade, yours doesn't. */
  stale?: boolean
  /** The face whose card starts open, for a story. */
  defaultOpen?: Member
  /** Follow someone, or stop following them while you are. */
  onFollow?: (member: Member) => void
  /** Show where someone is. */
  onGoTo?: (member: Member) => void
  /** Ask everyone to follow you. */
  onPresent?: () => void
  /** Whether others' pointers show, for your card's switch. */
  showPointers?: boolean
  onShowPointersChange?: (show: boolean) => void
}

/**
 * Who's here, on a bar of its own beside the canvas's zoom, built as the toolbar and zoom are: one stack of your own face,
 * then up to `max` others, then a count of the rest that opens everyone. The faces overlap and spread apart under the
 * pointer; each shows who it is on hover and opens their card on click. Your face opens your own card.
 */
export function FaceStack({
  here,
  you,
  following,
  max = 4,
  size = 28,
  stale = false,
  defaultOpen,
  onFollow,
  onGoTo,
  onPresent,
  showPointers,
  onShowPointersChange
}: FaceStackProps) {
  const everyone = arrange(here, following)
  const shown = everyone.slice(0, shownCount(everyone.length, max))
  const more = everyone.length - shown.length

  return (
    <div className={`${floatingBar} flex w-max items-center [--face-cutout:var(--floating-bar)]`}>
      {(you || everyone.length > 0) && (
        <ul aria-label="People here" className="group/stack flex items-center px-1.5">
          {you && (
            <li className={`flex h-7 items-center ${following && shown[0]?.member === following ? "mr-1.5" : ""}`}>
              <YourFace
                you={you}
                others={here.length}
                size={size}
                onPresent={onPresent}
                showPointers={showPointers}
                onShowPointersChange={onShowPointersChange}
              />
            </li>
          )}
          {shown.map((presence, index) => (
            <li
              key={keyOf(presence.member)}
              className={`flex h-7 items-center ${you || index > 0 ? overlap : ""} ${presence.member === following ? "mr-1.5" : ""}`}
            >
              <StackFace
                presence={presence}
                size={size}
                following={presence.member === following}
                stale={stale}
                defaultOpen={presence.member === defaultOpen}
                onFollow={onFollow && (() => onFollow(presence.member))}
                onGoTo={onGoTo && (() => onGoTo(presence.member))}
              />
            </li>
          ))}
          {more > 0 && (
            <li className={`flex h-7 items-center ${overlap}`}>
              <EveryoneCount everyone={everyone} more={more} size={size} following={following} onFollow={onFollow} />
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

interface YourFaceProps {
  you: Member
  others: number
  size: number
  onPresent?: () => void
  showPointers?: boolean
  onShowPointersChange?: (show: boolean) => void
}

/** Your own face, first in the stack: hover for "You", click for your card. */
function YourFace({ you, others, size, onPresent, showPointers, onShowPointersChange }: YourFaceProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button type="button" aria-label="You" className={faceButton}>
                  <Face member={you} size={size} />
                </button>
              }
            />
          }
        />
        <TooltipContent side="bottom">You</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={10} className="w-72 gap-0 overflow-hidden p-0">
        <YouCard
          you={you}
          others={others}
          onPresent={onPresent}
          showPointers={showPointers}
          onShowPointersChange={onShowPointersChange}
        />
      </PopoverContent>
    </Popover>
  )
}
