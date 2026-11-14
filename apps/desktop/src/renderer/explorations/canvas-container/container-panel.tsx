import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { MousePointerClick } from "lucide-react"
import { DesignIcon, kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { Name } from "../../chrome/Name.tsx"
import { panelEnd } from "../../chrome/PanelSection.tsx"
import { headingIcon, headingName, SelectionHeading } from "../../chrome/SelectionHeading.tsx"
import { useSketch } from "./sketch-state.tsx"

/*
 * The inspector's Design tab for a design on the exploration's canvas: its heading. How the design shows on the canvas,
 * its stories, modes and each preview's values, is set on the canvas, in its title and its previews' headers.
 */

export function ContainerPanel() {
  const { boards, selection } = useSketch()
  const board = boards.find((each) => each.id === selection.board)

  if (!board) {
    return (
      <div className="type-empty flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a screen, component or frame on the canvas or in Layers.
      </div>
    )
  }

  const Action = board.action.icon

  return (
    <div className={`border-b py-3 pl-4 ${panelEnd}`}>
      <SelectionHeading
        icon={
          <DesignIcon
            kind="screen"
            route={board.kind === "page"}
            story={board.kind === "story"}
            className={headingIcon}
          />
        }
        color={kindColors.screen}
        kind={board.kind === "page" ? "Route" : "Story"}
        detail={board.kind === "page" ? "Route, read from the app's router" : "Story, read from its Storybook file"}
        name={<Name className={`px-1.5 ${headingName}`}>{board.name}</Name>}
        action={
          <Hint label={board.action.label}>
            <Button variant="ghost" size="icon-sm" aria-label={board.action.label}>
              <Action />
            </Button>
          </Hint>
        }
      />
    </div>
  )
}
