import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Eye } from "lucide-react"
import type { ReactNode } from "react"
import { GroupLabel } from "../chrome/PanelSection.tsx"
import { BarDivider, floatingBar } from "../chrome/toolbar-parts.tsx"
import { Face } from "./Face.tsx"
import { type Member, type Presence, whereabouts, whoseAgent } from "./member.ts"
import { PersonCard } from "./PersonCard.tsx"
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

/** A face's button: it rises a little under the pointer, above its neighbours. */
const faceButton =
  "relative flex rounded-full outline-offset-2 transition-transform duration-150 hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0"

interface StackFaceProps {
  presence: Presence
  size: number
  following: boolean
  stale: boolean
  defaultOpen: boolean
}

/** A face in the stack: hover for who and what, click or Enter for their card. */
function StackFace({ presence, size, following, stale, defaultOpen }: StackFaceProps) {
  const { member } = presence

  return (
    <Popover defaultOpen={defaultOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button type="button" aria-label={`${member.name}, ${whereabouts(presence)}`} className={faceButton}>
                  <Face member={member} size={size} away={stale || Boolean(presence.away)} following={following} />
                </button>
              }
            />
          }
        />
        <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
          <span className="font-medium">{following ? `Following ${member.name}` : member.name}</span>
          <span className="text-background/70">{whereabouts(presence)}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={10} className="w-72 gap-0 overflow-hidden p-0">
        <PersonCard presence={presence} following={following} />
      </PopoverContent>
    </Popover>
  )
}

interface EveryoneRowProps {
  presence: Presence
  following: boolean
}

/** One of everyone, in the list the count opens: their face, name and where they are, and Follow on hover. */
function EveryoneRow({ presence, following }: EveryoneRowProps) {
  const { member, away } = presence
  const owner = whoseAgent(member)

  return (
    <li className="group/row flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted">
      <Face member={member} size={28} away={Boolean(away)} following={following} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-sm">{member.name}</span>
          {owner && <span className="shrink-0 text-2xs text-muted-foreground">{owner}</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{whereabouts(presence)}</span>
      </span>
      {!away && (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={following ? `Stop following ${member.name}` : `Follow ${member.name}`}
          aria-pressed={following}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
        >
          <Eye />
        </Button>
      )}
    </li>
  )
}

interface EveryoneGroupProps {
  label: string
  children: ReactNode
}

/** A group in the list of everyone: People, then Agents. */
function EveryoneGroup({ label, children }: EveryoneGroupProps) {
  return (
    <li className="flex flex-col">
      <GroupLabel className="px-2 pt-2 pb-1">{label}</GroupLabel>
      <ul className="flex flex-col">{children}</ul>
    </li>
  )
}

interface CountProps {
  everyone: Presence[]
  more: number
  size: number
  following?: Member
}

/** The count of faces past the first few: it opens everyone here, people and agents apart. */
function Count({ everyone, more, size, following }: CountProps) {
  const people = everyone.filter((presence) => !presence.member.agent)
  const agents = everyone.filter((presence) => presence.member.agent)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${more} more, of ${everyone.length} here`}
            className={`${faceButton} grid place-items-center bg-(--floating-bar-step) text-2xs font-medium text-muted-foreground tabular-nums shadow-[0_0_0_2px_var(--face-cutout)] hover:text-foreground dark:bg-muted`}
            style={{ width: size, height: size }}
          >
            +{more}
          </button>
        }
      />
      <PopoverContent align="end" sideOffset={10} className="w-80 gap-0 p-1.5 [--face-cutout:var(--popover)]">
        <span className="px-2 pt-1 text-sm font-medium">{everyone.length} here</span>
        <ul className="flex flex-col">
          <EveryoneGroup label="People">
            {people.map((presence) => (
              <EveryoneRow key={presence.member.name} presence={presence} following={presence.member === following} />
            ))}
          </EveryoneGroup>
          {agents.length > 0 && (
            <EveryoneGroup label="Agents">
              {agents.map((presence) => (
                <EveryoneRow key={presence.member.name} presence={presence} following={presence.member === following} />
              ))}
            </EveryoneGroup>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

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
 * under the pointer; each shows who and what on hover and opens their card on click. Your face opens your own card.
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
              <Count everyone={everyone} more={more} size={size} following={following} />
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
