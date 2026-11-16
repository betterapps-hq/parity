import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { Face } from "./Face.tsx"
import type { Member, Presence } from "./member.ts"
import { PersonCard } from "./PersonCard.tsx"

/**
 * Who's here, at the canvas's top-right edge: up to `max` faces, then how many more. The person you're following comes
 * first and anyone away comes last. Each face opens its person's card; the count opens everyone else.
 */
export function FaceStack({
  here,
  following,
  max = 4,
  size = 28,
  defaultOpen
}: {
  here: Presence[]
  following?: Member
  max?: number
  size?: number
  /** The face whose card starts open, for a story. */
  defaultOpen?: Member
}) {
  const rank = (presence: Presence) => {
    if (presence.member === following) {
      return 0
    }

    return presence.away ? 2 : 1
  }

  const ordered = here.toSorted((a, b) => rank(a) - rank(b))
  const shown = ordered.slice(0, max)
  const rest = ordered.slice(max)

  return (
    <ul
      aria-label="People here"
      className="flex items-center rounded-full border bg-background/85 p-1 shadow-sm backdrop-blur-md"
    >
      {shown.map((presence, index) => (
        <li key={presence.member.name} className="flex">
          <Popover defaultOpen={presence.member === defaultOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`${presence.member.name}, ${presence.away ? `away for ${presence.away}` : presence.activity}`}
                  className={`rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring ${index > 0 ? "-ml-1.5" : ""}`}
                >
                  <Face
                    member={presence.member}
                    size={size}
                    away={Boolean(presence.away)}
                    following={presence.member === following}
                  />
                </button>
              }
            />
            <PopoverContent align="end" className="w-72 p-3">
              <PersonCard presence={presence} following={presence.member === following} />
            </PopoverContent>
          </Popover>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="flex">
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`${rest.length} more here`}
                  className="-ml-1.5 grid place-items-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums ring-2 ring-background outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                  style={{ height: size, minWidth: size }}
                >
                  +{rest.length}
                </button>
              }
            />
            <PopoverContent align="end" className="w-64 p-1.5">
              <ul className="flex flex-col">
                {rest.map((presence) => (
                  <li key={presence.member.name} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
                    <Face member={presence.member} size={24} away={Boolean(presence.away)} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{presence.member.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {presence.away ? `Away for ${presence.away}` : presence.activity}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </li>
      )}
    </ul>
  )
}
