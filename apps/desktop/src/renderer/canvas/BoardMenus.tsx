import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { designStates, shownStates } from "@parity-app/core"
import { Columns3, Rows3, Settings2 } from "lucide-react"
import { createContext, type ReactNode, useContext, useState } from "react"
import { Hint } from "../chrome/Hint.tsx"
import { setLayout } from "../chrome/layout.ts"
import { PanelSectionTitle } from "../chrome/PanelSection.tsx"
import { type ContainerEntry, useModeSettings } from "../design-store.ts"
import { useProject } from "./context.ts"
import { ModesList, StatesList, stateNouns } from "./view-lists.tsx"
import { containerModes } from "./view.ts"

/**
 * A board's stories or states menu and its modes menu, in its title (PAR-1071): each an icon with how many show, which
 * opens the design's list to show, hide and put them in order, as its Modes section does. A design with one state has
 * no states menu.
 */
export function BoardMenus({ entry, triggerClassName }: { entry: ContainerEntry; triggerClassName: string }) {
  const { store } = useProject()
  const settings = useModeSettings(store)
  const { container, key } = entry
  const { ordered, companions } = containerModes(settings, container)
  const nouns = stateNouns(entry)
  const title = nouns.many[0]!.toUpperCase() + nouns.many.slice(1)

  return (
    <>
      {designStates(container).length > 1 && (
        <ListMenu
          title={title}
          icon={<Rows3 aria-hidden className="size-3.5" />}
          shown={shownStates(container).length}
          triggerClassName={triggerClassName}
        >
          <StatesList entry={entry} group={`states:${key}`} />
        </ListMenu>
      )}
      {ordered.length > 1 && (
        <ListMenu
          title="Modes"
          icon={<Columns3 aria-hidden className="size-3.5" />}
          shown={companions.length + 1}
          triggerClassName={triggerClassName}
          action={<EditModesButton />}
        >
          <ModesList entry={entry} group={`modes:${key}`} />
        </ListMenu>
      )}
    </>
  )
}

/** Closes the menu it's in. */
const CloseMenu = createContext<(() => void) | undefined>(undefined)

/** Opens the project's modes on the inspector's Modes tab, closing the menu it's in. */
function EditModesButton() {
  const close = useContext(CloseMenu)

  return (
    <Hint label="Edit modes">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Edit modes"
        onClick={() => {
          close?.()
          setLayout({ right: true, rightTab: "modes" })
        }}
      >
        <Settings2 />
      </Button>
    </Hint>
  )
}

/** A title's menu: its icon and how many show, opening its list under a heading with an action beside it. */
function ListMenu({
  title,
  icon,
  shown,
  triggerClassName,
  action,
  children
}: {
  title: string
  icon: ReactNode
  shown: number
  triggerClassName: string
  action?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Hint label={title} hidden={open}>
            <button type="button" className={triggerClassName} aria-label={`${title}, ${shown} shown`}>
              {icon}
              <span className="tabular-nums">{shown}</span>
            </button>
          </Hint>
        }
      />
      <PopoverContent align="end" className="w-64 gap-0 p-2 pl-1">
        <CloseMenu value={() => setOpen(false)}>
          <div className="pl-2">
            <PanelSectionTitle title={title} action={action} />
          </div>
          {children}
        </CloseMenu>
      </PopoverContent>
    </Popover>
  )
}
