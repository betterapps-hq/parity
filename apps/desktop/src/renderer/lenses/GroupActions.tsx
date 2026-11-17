import type { IDockviewHeaderActionsProps } from "dockview-react"
import { SquareArrowOutDownLeft, SquareArrowOutUpRight } from "lucide-react"
import { IconButton } from "../chrome/IconButton.tsx"
import { useShell } from "./shell.ts"

/** At the end of each group's tabs: its tab out into a window of its own, or, in that window, back into the main one. */
export function GroupActions({ group: { id } }: IDockviewHeaderActionsProps) {
  const { layout, actions } = useShell()
  const group = layout.groups.find((each) => each.id === id)

  if (!group) {
    return null
  }

  const { where, tabs, open } = group

  return (
    <div className="flex h-full items-center pr-2">
      {where === "window" ? (
        <IconButton
          label="Move to main window"
          onClick={() => {
            for (const lens of tabs) {
              actions.toMain(lens)
            }
          }}
        >
          <SquareArrowOutDownLeft />
        </IconButton>
      ) : (
        open &&
        actions.canMoveToWindow(open) && (
          <IconButton label="Move to new window" onClick={() => actions.toWindow(open)}>
            <SquareArrowOutUpRight />
          </IconButton>
        )
      )}
    </div>
  )
}
