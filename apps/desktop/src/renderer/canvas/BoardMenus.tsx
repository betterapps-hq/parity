import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { designStates, shownStates } from "@parity-app/core"
import { ChevronDown, MonitorSmartphone, Settings2, SquareStack } from "lucide-react"
import { createContext, type ReactNode, useContext, useState } from "react"
import { pageOffers, runAction } from "../chrome/adapter-actions.ts"
import { Hint } from "../chrome/Hint.tsx"
import { setLayout } from "../chrome/layout.ts"
import { PanelSectionTitle } from "../chrome/PanelSection.tsx"
import { HeaderActions } from "../chrome/SelectionHeading.tsx"
import { type ContainerEntry, useModeSettings } from "../design-store.ts"
import { useProject } from "./context.ts"
import { routePageTarget } from "./route-pages.ts"
import { ModesList, StatesList, stateNouns } from "./view-lists.tsx"
import { containerModes } from "./view.ts"

/**
 * A board's stories or states menu and its modes menu, in its title (PAR-1071): each an icon with how many show, which
 * opens the design's list to show, hide and put them in order, as its Modes section does. A design with one state has
 * no states menu. A page's title then has what the project's adapters offer for it, as the Design tab's heading does:
 * Open in browser.
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
          icon={<SquareStack aria-hidden className="size-3.5" />}
          count={designStates(container).length}
          shown={shownStates(container).length}
          triggerClassName={triggerClassName}
        >
          <StatesList entry={entry} group={`states:${key}`} />
        </ListMenu>
      )}
      <ListMenu
        title="Modes"
        icon={<MonitorSmartphone aria-hidden className="size-3.5" />}
        count={ordered.length}
        shown={companions.length + 1}
        triggerClassName={triggerClassName}
        action={<EditModesButton />}
      >
        <ModesList entry={entry} group={`modes:${key}`} />
      </ListMenu>
      <BoardActions entry={entry} />
    </>
  )
}

/** What the project's adapters offer for a page of the app, as Open in browser, as icon buttons. */
function BoardActions({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const target = routePageTarget(session.id, entry.container)

  if (!target) {
    return null
  }

  return (
    <HeaderActions
      adapterOffers={pageOffers(session.info, target.route)}
      page
      onAdapterAction={({ action }) => void runAction(session.id, action, undefined, target)}
    />
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
  count,
  shown,
  triggerClassName,
  action,
  children
}: {
  title: string
  icon: ReactNode
  /** How many there are, which its heading counts. */
  count: number
  /** How many of them show, which its button counts. */
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
              <ChevronDown aria-hidden className="-ml-0.5 size-3.5 opacity-60" />
            </button>
          </Hint>
        }
      />
      <PopoverContent align="end" className="w-64 gap-0 py-3 pr-1 pl-3">
        <CloseMenu value={() => setOpen(false)}>
          <PanelSectionTitle title={title} count={count} action={action} spacing="mb-2 pr-2" />
          <div className="max-h-96 overflow-y-auto">{children}</div>
        </CloseMenu>
      </PopoverContent>
    </Popover>
  )
}
