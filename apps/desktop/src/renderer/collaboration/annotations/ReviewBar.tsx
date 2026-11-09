import type { ReviewTool } from "@parity-app/editor"
import { floatingBar } from "../../chrome/toolbar-parts.tsx"
import { reviewToolLook } from "./annotation-kinds.ts"
import { DoneButton } from "./DoneButton.tsx"

interface ReviewBarProps {
  tool: ReviewTool
}

/**
 * A bar beside the toolbar saying what a click does while a review tool is picked, with Done: the other way to show a
 * review tool, kept from PAR-780's exploration, where it stacked above the toolbar. The app warps the toolbar instead.
 */
export function ReviewBar({ tool }: ReviewBarProps) {
  const { doing, hint, icon: Icon, color } = reviewToolLook(tool)

  return (
    <div className={`flex w-fit items-center gap-2 pl-3 text-sm whitespace-nowrap ${floatingBar}`}>
      <Icon className="size-4" style={{ color }} />
      <span className="font-medium">{doing}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <DoneButton compact />
    </div>
  )
}
