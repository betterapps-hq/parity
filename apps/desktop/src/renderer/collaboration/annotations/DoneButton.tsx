import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { actions } from "../../chrome/actions.ts"
import { shortcutOf } from "../../chrome/keymap.ts"
import { pressableWide, pressMotion } from "../../chrome/toolbar-parts.tsx"

interface DoneButtonProps {
  /** Smaller, for a bar beside the toolbar rather than in it. */
  compact?: boolean
}

/** Puts the review tool down and goes back to the tool before it, as Esc does: Esc's own step back (`stepBack`). */
export function DoneButton({ compact = false }: DoneButtonProps) {
  return (
    <Button
      variant="secondary"
      size={compact ? "xs" : "default"}
      className={compact ? undefined : `ml-0.5 h-8 gap-1.5 px-2.5 ${pressableWide}`}
      style={compact ? undefined : pressMotion}
      onClick={() => void actions.back.run("toolbar")}
    >
      Done <Kbd>{shortcutOf("back")}</Kbd>
    </Button>
  )
}
