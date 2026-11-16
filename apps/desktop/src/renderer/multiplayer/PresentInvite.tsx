import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Face } from "./Face.tsx"
import { type Member, shortName } from "./member.ts"

/**
 * Someone presenting asks everyone to follow them, for a walkthrough: the invitation as everyone else sees it, at the
 * top of the canvas where the follow banner will be. Following them is the same as following anyone; not now leaves
 * them a face in the stack.
 */
export function PresentInvite({
  presenter,
  board,
  onFollow,
  onDismiss
}: {
  presenter: Member
  /** The board they're presenting. */
  board: string
  onFollow?: () => void
  onDismiss?: () => void
}) {
  return (
    <output className="pointer-events-auto absolute top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full border bg-popover py-1 pr-1 pl-1 text-xs whitespace-nowrap text-popover-foreground shadow-md">
      <Face member={presenter} size={22} />
      <span>
        <span className="font-semibold">{shortName(presenter)}</span> is presenting {board}
      </span>
      <span className="flex gap-1">
        <Button size="xs" onClick={onFollow}>
          Follow
        </Button>
        <Button size="xs" variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
      </span>
    </output>
  )
}
