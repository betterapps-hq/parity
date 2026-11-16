import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { MonitorPlay } from "lucide-react"
import { shortcutOf } from "../chrome/keymap.ts"
import { CanvasBanner } from "./CanvasBanner.tsx"
import { CanvasFrame } from "./CanvasFrame.tsx"
import { Face } from "./Face.tsx"
import { gradient, type Member } from "./member.ts"

/**
 * The presenter's own side: their canvas framed in their color, as their followers' is, and the banner every canvas bar
 * shares, led by a presenting mark on their gradient, with who's following and Stop.
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
    <>
      <CanvasFrame palette={palette} />
      <CanvasBanner
        lead={
          <span
            className="grid size-5.5 place-items-center rounded-full"
            style={{ background: gradient(palette, 135), color: palette.ink }}
          >
            <MonitorPlay className="size-3" strokeWidth={2.5} />
          </span>
        }
        title="Presenting"
        hint={
          followers.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="flex" aria-hidden>
                {shown.map((member, index) => (
                  <span key={member.name} className={index > 0 ? "-ml-1" : ""}>
                    <Face member={member} size={16} />
                  </span>
                ))}
              </span>
              {followers.length} following
            </span>
          ) : (
            "Waiting for people to follow"
          )
        }
      >
        <Button size="xs" variant="secondary" onClick={onStop} aria-label="Stop presenting" className="gap-1.5">
          Stop <Kbd>{shortcutOf("close")}</Kbd>
        </Button>
      </CanvasBanner>
    </>
  )
}
