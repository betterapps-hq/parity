import type { ReviewTool } from "@parity-app/editor"
import { CommentBar } from "./CommentBar.tsx"
import { KindBar } from "./KindBar.tsx"

interface ReviewToolBarProps {
  tool: ReviewTool
}

/** What the toolbar warps into while a review tool is picked: Comment's bar, or the kind of annotation's. */
export function ReviewToolBar({ tool }: ReviewToolBarProps) {
  return tool === "comment" ? <CommentBar /> : <KindBar key={tool} kind={tool} />
}
