import { componentUses } from "@parity-app/editor"
import { Columns2, Component } from "lucide-react"
import { boardKeyOf } from "../canvas/component-boards.ts"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import { useLensActions } from "../lenses/shell.ts"
import type { ContainerEntry } from "../project-doc.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { Name } from "./Name.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { revealOnceShown } from "./reveal.ts"

/**
 * A page's links to the other lenses: the components it places, each on its board in Screens, its route's own first. A
 * click shows one there, selected, as a link does; Show beside splits Screens to the right. Outside the lens shell,
 * there's nowhere to show them.
 */
export function PageLinks({ entry, route: id }: { entry: ContainerEntry; route: string }) {
  const session = useProject()
  const actions = useLensActions()
  const own = session.info.routes.find((each) => each.id === id)?.component
  const placed = [...componentUses([entry.container.root]).keys()]

  const linked = [...new Set(own === undefined ? placed : [own, ...placed])].flatMap((component) => {
    const board = boardKeyOf(session.id, component)

    return board ? [{ component, board }] : []
  })

  if (!actions || linked.length === 0) {
    return null
  }

  const show = (board: string, beside: boolean) => {
    // Shown first, so the selection finds it there rather than following the board to Screens in Pages' place.
    actions.followLink("screens", beside)
    session.selection.set({ design: board })
    revealOnceShown(board)
  }

  return (
    <PanelSection title="Components">
      <ul className="-mx-1.5 flex flex-col">
        {linked.map(({ component, board }) => (
          <li key={board} className="group/link flex h-8 items-center gap-0.5 rounded-md hover:bg-accent/50">
            <Hint label="Show in Screens" wait>
              <button
                type="button"
                onClick={() => show(board, false)}
                className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Component className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
                <Name className="min-w-0">{component}</Name>
              </button>
            </Hint>
            <span className="opacity-0 group-focus-within/link:opacity-100 group-hover/link:opacity-100">
              <IconButton label="Show beside" onClick={() => show(board, true)}>
                <Columns2 />
              </IconButton>
            </span>
          </li>
        ))}
      </ul>
    </PanelSection>
  )
}
