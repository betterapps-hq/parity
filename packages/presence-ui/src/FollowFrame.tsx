import { Button, Kbd } from "@buildkitgg/shadcn"
import { stopKey } from "./bar.tsx"
import { CanvasBanner } from "./CanvasBanner.tsx"
import { CanvasFrame } from "./CanvasFrame.tsx"
import { Face } from "./Face.tsx"
import { type Member, shortName } from "./member.ts"

interface FollowFrameProps {
  leader: Member
  onStop?: () => void
}

/**
 * Following someone: the canvas framed in their color, and a banner at the top with their face, whose view this is,
 * and Stop, which names its key so a mouse and a keyboard both see how.
 */
export function FollowFrame({ leader, onStop }: FollowFrameProps) {
  return (
    <>
      <CanvasFrame palette={leader.palette} />
      <CanvasBanner lead={<Face member={leader} size={22} />} title={`Following ${shortName(leader)}`}>
        <Button
          size="xs"
          variant="secondary"
          onClick={onStop}
          aria-label={`Stop following ${shortName(leader)}`}
          aria-keyshortcuts="Escape"
          className="gap-1.5"
        >
          Stop <Kbd aria-hidden>{stopKey}</Kbd>
        </Button>
      </CanvasBanner>
    </>
  )
}
