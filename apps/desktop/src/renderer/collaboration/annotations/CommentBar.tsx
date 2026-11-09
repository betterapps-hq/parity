import { reviewToolLook } from "./annotation-kinds.ts"
import { DoneButton } from "./DoneButton.tsx"

/**
 * Comment's bar (PAR-795): it has no options to pick, so it says what a click does, then Done. Its words are parts of
 * the toolbar's warp (`data-warp-part`), so they're pulled in and burst out like buttons. Starting threads is PAR-372's.
 */
export function CommentBar() {
  const { doing, hint, icon: Icon } = reviewToolLook("comment")

  return (
    <>
      <span data-warp-part className="flex items-center gap-2 pl-2 text-sm font-medium whitespace-nowrap">
        <Icon className="size-4" />
        {doing}
      </span>
      <span data-warp-part className="flex items-center px-1.5 text-xs whitespace-nowrap text-muted-foreground">
        {hint}
      </span>
      <DoneButton />
    </>
  )
}
