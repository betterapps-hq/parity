import { Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { shortcutOf } from "../chrome/keymap.ts"
import { Face } from "./Face.tsx"
import { gradient, type Member, shortName } from "./member.ts"

/**
 * Following someone: the canvas framed in their color, and a banner at the top saying whose view this is, with its
 * way out set into its end: a Stop button that names its key, so a mouse and a keyboard both see how.
 */
export function FollowFrame({ leader, onStop }: { leader: Member; onStop?: () => void }) {
  const { palette } = leader

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        style={{ boxShadow: `inset 0 0 0 2px ${palette.color}` }}
      />
      <output
        className="pointer-events-auto absolute top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full p-0.5 text-xs font-medium whitespace-nowrap shadow-md"
        style={{ background: gradient(palette), color: palette.ink }}
      >
        <Face member={leader} size={18} />
        <span>Following {shortName(leader)}</span>
        <button
          type="button"
          onClick={onStop}
          aria-label={`Stop following ${shortName(leader)}`}
          className="flex h-[18px] items-center gap-1 rounded-full bg-black/12 pr-0.5 pl-2 font-semibold hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-current"
        >
          Stop
          <Kbd className="h-3.5 min-w-0 rounded-full bg-black/12 px-1.5 text-[10px] text-current">
            {shortcutOf("close")}
          </Kbd>
        </button>
      </output>
    </>
  )
}
