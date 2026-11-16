import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { CanvasBanner } from "./CanvasBanner.tsx"
import { Face } from "./Face.tsx"
import { type Member, shortName } from "./member.ts"

interface PresentInviteProps {
  presenter: Member
  /** The board they're presenting. */
  board: string
  onFollow?: () => void
  onDismiss?: () => void
}

/**
 * Someone presenting asks everyone to follow them, for a walkthrough: the invitation as everyone else sees it, on the
 * banner where following will show. Following them is the same as following anyone; Not now leaves them a face in the
 * stack, where their card can still follow them.
 */
export function PresentInvite({ presenter, board, onFollow, onDismiss }: PresentInviteProps) {
  return (
    <CanvasBanner
      lead={<Face member={presenter} size={22} />}
      title={`${shortName(presenter)} is presenting`}
      hint={board}
    >
      <Button size="xs" variant="ghost" onClick={onDismiss}>
        Not now
      </Button>
      <Button size="xs" onClick={onFollow}>
        Follow
      </Button>
    </CanvasBanner>
  )
}
