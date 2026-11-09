import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { annotationKinds, isReviewTool, type Review, type ReviewTool } from "@parity-app/editor"
import { useProject } from "../../canvas/context.ts"
import { reviewToolLook } from "../../collaboration/annotations/annotation-kinds.ts"
import type { Tool } from "../../selection.ts"
import { actions } from "../actions.ts"
import { keymap } from "../keymap.ts"
import { formatKeys } from "../keys.ts"
import { CommandTip, MenuArrow, toolButton } from "../toolbar-parts.tsx"

interface ReviewButtonProps {
  review: Review<Tool>
}

/**
 * The review button and its menu, from PAR-184's annotations design (PAR-795). The menu lists Comment, then each kind of
 * annotation; the button shows the one picked last, in its kind's color, and the toolbar warps around it into that
 * tool's bar. It sits in the tools' group, which picks it, so arrow keys reach it with the tools.
 */
export function ReviewButton({ review }: ReviewButtonProps) {
  const { selection } = useProject()
  const { label, icon: Icon, color, command } = reviewToolLook(review.shown)
  const picked = review.picked === review.shown

  return (
    <>
      <CommandTip command={command} label={label}>
        <ToggleGroupItem data-warp-anchor value={review.shown} aria-label={label} className={toolButton}>
          <Icon style={picked || !color ? undefined : { color }} />
        </ToggleGroupItem>
      </CommandTip>
      <DropdownMenu modal={false}>
        <MenuArrow label="Comment or annotate" />
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-60">
          <DropdownMenuRadioGroup
            value={review.picked ?? review.shown}
            onValueChange={(value) => {
              if (value === "comment") {
                void actions.comment.run("toolbar")
              } else if (isReviewTool(value)) {
                selection.startReviewing(value)
              }
            }}
          >
            <ReviewMenuItem tool="comment" shortcut={keymap.comment.keys[0]} />
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center">
              {keymap.annotate.label}
              <DropdownMenuShortcut>{formatKeys(keymap.annotate.keys[0])}</DropdownMenuShortcut>
            </DropdownMenuLabel>
            {annotationKinds.map((kind) => (
              <ReviewMenuItem key={kind} tool={kind} />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

interface ReviewMenuItemProps {
  tool: ReviewTool
  shortcut?: string
}

function ReviewMenuItem({ tool, shortcut }: ReviewMenuItemProps) {
  const { name, icon: Icon, color } = reviewToolLook(tool)

  return (
    <DropdownMenuRadioItem value={tool} closeOnClick>
      <Icon style={color ? { color } : undefined} />
      {name}
      {shortcut && <DropdownMenuShortcut>{formatKeys(shortcut)}</DropdownMenuShortcut>}
    </DropdownMenuRadioItem>
  )
}
