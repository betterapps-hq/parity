import { Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { MonitorPlay } from "lucide-react"
import { shortcutOf } from "../chrome/keymap.ts"
import { Face } from "./Face.tsx"
import { gradient, type Member } from "./member.ts"

/**
 * The presenter's own side: a banner in their color at the top of their canvas, with who's following and the way to
 * stop, built like the banner followers see.
 */
export function PresentingBar({
  presenter,
  followers,
  onStop
}: {
  presenter: Member
  followers: Member[]
  onStop?: () => void
}) {
  const { palette } = presenter
  const shown = followers.slice(0, 3)

  return (
    <output
      className="pointer-events-auto absolute top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full py-0.5 pr-0.5 pl-2 text-xs font-medium whitespace-nowrap shadow-md"
      style={{ background: gradient(palette), color: palette.ink }}
    >
      <MonitorPlay className="size-3.5" />
      <span>Presenting</span>
      {followers.length > 0 && (
        <span className="flex items-center gap-1">
          <span className="flex">
            {shown.map((member, index) => (
              <span key={member.name} className={index > 0 ? "-ml-1" : ""}>
                <Face member={member} size={16} />
              </span>
            ))}
          </span>
          <span className="font-normal">{followers.length} following</span>
        </span>
      )}
      <button
        type="button"
        onClick={onStop}
        className="flex h-[18px] items-center gap-1 rounded-full bg-black/12 pr-0.5 pl-2 font-semibold hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-current"
      >
        Stop
        <Kbd className="h-3.5 min-w-0 rounded-full bg-black/12 px-1.5 text-[10px] text-current">
          {shortcutOf("close")}
        </Kbd>
      </button>
    </output>
  )
}
