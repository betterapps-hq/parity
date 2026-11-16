import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn"
import { BarDivider, floatingBar } from "../chrome/toolbar-parts.tsx"
import { EveryoneCount } from "./EveryoneCount.tsx"
import { faceButton } from "./face-button.ts"
import { Face } from "./Face.tsx"
import type { Member, Presence } from "./member.ts"
import { StackFace } from "./StackFace.tsx"
import { YouCard } from "./YouCard.tsx"

/**
 * The order faces go in: whoever you're following first, then everyone in the order they joined, each person's agents
 * just after them, and anyone away last.
 */
export function arrange(here: Presence[], following?: Member): Presence[] {
  const people = here.filter((presence) => !presence.member.agent)
  const agents = here.filter((presence) => presence.member.agent)
  const runners = new Set(people.map((presence) => presence.member))

  const joined = [
    ...people.flatMap((person) => [person, ...agents.filter((agent) => agent.member.runBy === person.member)]),
    ...agents.filter((agent) => !agent.member.runBy || !runners.has(agent.member.runBy))
  ]

  const rank = (presence: Presence) => {
    if (presence.member === following) {
      return 0
    }

    return presence.away ? 2 : 1
  }

  return joined.toSorted((a, b) => rank(a) - rank(b))
}

/*
 * Faces overlap a little, short of their initials, and spread apart while the pointer's over the stack or a face in it
 * has focus, so each is easy to hit. The margin eases as Parity's drags settle.
 */
const overlap =
  "-ml-1 transition-[margin] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover/stack:ml-1 group-focus-within/stack:ml-1 motion-reduce:transition-none"

interface FaceStackProps {
  here: Presence[]
  /** You, at the end, past a line. */
  you?: Member
  following?: Member
  max?: number
  size?: number
  /** Whether where everyone is might be out of date, while the connection's down: their faces fade, yours doesn't. */
  stale?: boolean
  /** The face whose card starts open, for a story. */
  defaultOpen?: Member
}

/**
 * Who's here, on a bar of its own at the canvas's top-right, built as the toolbar and zoom are: up to `max` faces, then
 * a count of the rest that opens everyone, and, past an etched line, your own face. The faces overlap and spread apart
 * under the pointer; each shows who it is on hover and opens their card on click. Your face opens your own card.
 */
export function FaceStack({ here, you, following, max = 4, size = 28, stale = false, defaultOpen }: FaceStackProps) {
  const everyone = arrange(here, following)
  const shown = everyone.slice(0, everyone.length > max ? max - 1 : max)
  const more = everyone.length - shown.length

  return (
    <div className={`${floatingBar} flex w-max items-center [--face-cutout:var(--floating-bar)]`}>
      {everyone.length > 0 && (
        <ul aria-label="People here" className="group/stack flex items-center px-1.5">
          {shown.map((presence, index) => (
            <li
              key={presence.member.name}
              className={`flex h-8 items-center ${index > 0 ? overlap : ""} ${presence.member === following ? "mr-1.5" : ""}`}
            >
              <StackFace
                presence={presence}
                size={size}
                following={presence.member === following}
                stale={stale}
                defaultOpen={presence.member === defaultOpen}
              />
            </li>
          ))}
          {more > 0 && (
            <li className={`flex h-8 items-center ${overlap}`}>
              <EveryoneCount everyone={everyone} more={more} size={size} following={following} />
            </li>
          )}
        </ul>
      )}
      {you && (
        <>
          {everyone.length > 0 && <BarDivider />}
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <button type="button" aria-label="You" className={`${faceButton} mx-1.5`}>
                        <Face member={you} size={size} />
                      </button>
                    }
                  />
                }
              />
              <TooltipContent side="bottom">You</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" sideOffset={10} className="w-72 gap-0 overflow-hidden p-0">
              <YouCard you={you} others={here.length} />
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  )
}
