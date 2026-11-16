import { RefreshCw, WifiOff } from "lucide-react"
import { Face } from "./Face.tsx"
import { type Member, shortName } from "./member.ts"

/**
 * When the connection to the room drops, at the top of the canvas: work carries on and is kept on this computer, and
 * everyone else's pointers and selections are hidden until it's back. While it reconnects, whose changes it's catching
 * up on.
 */
export function ConnectionNote({
  state,
  catchingUp = [],
  changes = 0
}: {
  state: "offline" | "reconnecting"
  /** Whose changes are on their way in, while reconnecting. */
  catchingUp?: Member[]
  changes?: number
}) {
  const names = catchingUp.map(shortName)
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]

  return (
    <output className="absolute top-2.5 left-1/2 z-10 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/40 bg-popover py-1 pr-3 pl-2 text-xs text-popover-foreground shadow-md">
      {state === "offline" ? (
        <>
          <WifiOff className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="truncate">
            <span className="font-semibold">Offline.</span> Your changes are kept here until you&apos;re back.
          </span>
        </>
      ) : (
        <>
          <RefreshCw className="size-3.5 shrink-0 animate-spin text-amber-600 [animation-duration:2s] dark:text-amber-400" />
          <span className="truncate">
            <span className="font-semibold">Reconnecting.</span> Catching up on {changes} changes from
            <span className="sr-only"> {who}</span>
          </span>
          <span className="flex shrink-0" aria-hidden>
            {catchingUp.map((member, index) => (
              <span key={member.name} className={index > 0 ? "-ml-1" : ""}>
                <Face member={member} size={16} />
              </span>
            ))}
          </span>
        </>
      )}
    </output>
  )
}
