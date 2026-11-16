import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Kbd,
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from "@buildkitgg/shadcn"
import {
  Bug,
  Check,
  ChevronDown,
  Columns2,
  FolderDown,
  FolderOpen,
  History,
  Info,
  LogOut,
  MessageSquareWarning,
  Minus,
  PanelsLeftRight,
  RefreshCw,
  Square,
  SquareArrowOutDownLeft,
  SquareArrowOutUpRight,
  SquareTerminal,
  Terminal,
  X
} from "lucide-react"
import { type KeyboardEvent, type ReactNode, useState } from "react"
import { AccountMenu } from "../../account/AccountMenu.tsx"
import { iconFor } from "../../chrome/command-icons.ts"
import { Hint } from "../../chrome/Hint.tsx"
import { type Command, keymap, shortcutOf } from "../../chrome/keymap.ts"
import { lensOrder, lenses, project as openProject, recentProjects } from "./data.ts"
import type { LensId } from "./model.ts"

/** The window's chrome: the title bar's strip and the lens bar down the left, one surface, as the tab strip was. */
export const chromeSurface = "bg-neutral-100 dark:bg-[#0a0a0a]"

/** What a lens dragged from the lens bar carries, so a canvas takes it: on its side to split, in its middle to show it. */
export const lensDragType = "application/x-parity-lens"

/** What the title bar and the lens bar do, for the window they're in. */
export interface ChromeActions {
  /** Whether a project is open: on Home, what acts on one is unavailable. */
  project: boolean
  /** Which lens shows in the canvas in focus, and which show in other canvases or windows. */
  current: LensId
  elsewhere: (lens: LensId) => "canvas" | "window" | undefined
  show: (lens: LensId) => void
  splitRight: (lens: LensId) => void
  canSplit: (lens: LensId) => boolean
  toWindow: (lens: LensId) => void
  canMoveToWindow: (lens: LensId) => boolean
  toMain: (lens: LensId) => void
  canMoveToMain: (lens: LensId) => boolean
  close: (lens: LensId) => void
  canClose: (lens: LensId) => boolean
  panels: { left: boolean; right: boolean }
  togglePanels: () => void
  closeProject: () => void
  openProject: (name: string) => void
}

/**
 * The main window's title bar: the app's menus, the open project's name in the middle, which opens the project's
 * menu, then your account and the system's window buttons. There are no tabs: the window holds one project.
 */
export function TitleBar({ name, actions }: { name?: string; actions: ChromeActions }) {
  return (
    <header
      className={`relative flex h-10 shrink-0 items-end border-b pl-2 ${chromeSurface} [-webkit-app-region:drag]`}
    >
      <AppMenus actions={actions} />
      {name && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
          <div className="pointer-events-auto">
            <ProjectMenu name={name} actions={actions} />
          </div>
        </div>
      )}
      <div className="ml-auto flex h-full items-center">
        {/* Home has your account at its top, as it does today. */}
        {name && (
          <div className="mr-2 [-webkit-app-region:no-drag]">
            <AccountMenu />
          </div>
        )}
        <WindowButtons />
      </div>
    </header>
  )
}

/** The system's window buttons, drawn, since the story's windows aren't the system's. */
function WindowButtons() {
  return (
    <div className="flex h-full text-foreground/80" aria-hidden>
      {[Minus, Square, X].map((Icon, index) => (
        <span
          key={index}
          className={`grid h-full w-[46px] place-items-center ${index === 2 ? "hover:bg-red-600 hover:text-white" : "hover:bg-foreground/5"}`}
        >
          <Icon className={index === 1 ? "size-3" : "size-4"} strokeWidth={1.25} />
        </span>
      ))}
    </div>
  )
}

/**
 * The project's name, which opens what can be done with the project: open another in its place, one opened before, or
 * close it, which leaves the window on Home. Its hint names its folder, as the project's tab did.
 */
function ProjectMenu({ name, actions }: { name: string; actions: ChromeActions }) {
  const [open, setOpen] = useState(false)

  const folder =
    name === openProject.name ? openProject.folder : recentProjects.find((each) => each.name === name)?.folder

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Hint label={folder} side="bottom" wait hidden={open}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 font-medium [-webkit-app-region:no-drag] aria-expanded:bg-accent"
            />
          }
        >
          {name}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="center" className="w-72">
        <DropdownMenuItem>
          <FolderOpen /> Open project folder…
          <DropdownMenuShortcut>{shortcutOf("openFolder")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Recent</DropdownMenuLabel>
          {[openProject, ...recentProjects].flatMap((each) =>
            each.name === name
              ? []
              : [
                  <DropdownMenuItem
                    key={each.name}
                    onClick={() => actions.openProject(each.name)}
                    className="flex-col items-start gap-0"
                  >
                    <span>{each.name}</span>
                    <span className="text-xs wrap-anywhere text-muted-foreground">{each.folder}</span>
                  </DropdownMenuItem>
                ]
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={actions.closeProject}>
          <X /> Close project
          <DropdownMenuShortcut>{shortcutOf("closeTab")}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A command's menu item as the app's menus draw one: its icon, its name and its keys. */
function Cmd({ command, children }: { command: Command; children?: ReactNode }) {
  const icon = iconFor(command)

  return (
    <MenubarItem inset={icon ? undefined : true}>
      {icon} {children ?? keymap[command].label}
      <MenubarShortcut>{shortcutOf(command)}</MenubarShortcut>
    </MenubarItem>
  )
}

const editCommands: (Command | "-")[] = [
  "undo",
  "redo",
  "repeat",
  "-",
  "cut",
  "copy",
  "paste",
  "pasteOver",
  "pasteReplace",
  "-",
  "copyAsPng",
  "copyStyle",
  "pasteStyle",
  "-",
  "duplicate",
  "rename",
  "delete",
  "-",
  "selectAll",
  "selectMatching",
  "selectInverse"
]

const objectCommands: (Command | "-")[] = [
  "newScreen",
  "newComponent",
  "insert",
  "findReferences",
  "-",
  "wrap",
  "unwrap",
  "-",
  "makeComponent",
  "goToMain",
  "detach",
  "-",
  "bringToFront",
  "bringForward",
  "sendBackward",
  "sendToBack",
  "-",
  "hide",
  "lock"
]

const arrangeCommands: (Command | "-")[] = [
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignTop",
  "alignMiddle",
  "alignBottom",
  "-",
  "distributeHorizontal",
  "distributeVertical"
]

function Commands({ list }: { list: (Command | "-")[] }) {
  return list.map((command, index) =>
    command === "-" ? <MenubarSeparator key={index} /> : <Cmd key={command} command={command} />
  )
}

/**
 * The app's menus, as they are today, with File and View changed for one project and its lenses: File opens a project
 * in place of this one and closes it, where it had tabs; View shows each lens, splits it or moves it to a window of
 * its own, where it had Home.
 */
function AppMenus({ actions }: { actions: ChromeActions }) {
  const lens = lenses[actions.current]

  return (
    <Menubar
      className="mr-2 mb-1.5 shrink-0 border-0 bg-transparent [-webkit-app-region:no-drag]"
      aria-label="Application"
    >
      <MenubarMenu>
        <MenubarTrigger className="font-normal">File</MenubarTrigger>
        <MenubarContent className="w-auto">
          <Cmd command="openFolder">Open project folder…</Cmd>
          <Cmd command="openFile">Open project file…</Cmd>
          <MenubarSub>
            <MenubarSubTrigger>
              <History /> Open recent
            </MenubarSubTrigger>
            <MenubarSubContent className="max-w-96 min-w-64">
              {recentProjects.map((each) => (
                <MenubarItem
                  key={each.name}
                  onClick={() => actions.openProject(each.name)}
                  className="flex-col items-start gap-0"
                >
                  <span>{each.name}</span>
                  <span className="text-xs wrap-anywhere text-muted-foreground">{each.folder}</span>
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <Cmd command="save" />
          <Cmd command="saveCopy">Save a copy…</Cmd>
          <MenubarSeparator />
          <Cmd command="exportSelection">Export selected…</Cmd>
          <MenubarItem>
            <FolderDown /> Export all…
          </MenubarItem>
          <MenubarSeparator />
          <Cmd command="settings" />
          <MenubarSeparator />
          <MenubarItem disabled={!actions.project} onClick={actions.closeProject}>
            {iconFor("closeTab")} Close project
            <MenubarShortcut>{shortcutOf("closeTab")}</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <LogOut /> Exit <MenubarShortcut>{shortcutOf("exit")}</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="font-normal">Edit</MenubarTrigger>
        <MenubarContent className="w-auto">
          <Commands list={editCommands} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="font-normal">View</MenubarTrigger>
        <MenubarContent className="w-auto">
          <MenubarGroup>
            <MenubarLabel className="text-xs font-medium text-muted-foreground">Lenses</MenubarLabel>
            {lensOrder.map((id) => {
              const { label, icon: Icon, keys } = lenses[id]

              return (
                <MenubarCheckboxItem
                  key={id}
                  disabled={!actions.project}
                  checked={actions.project && id === actions.current}
                  onCheckedChange={() => actions.show(id)}
                  className="ps-1.5 [&>span:first-child]:hidden"
                >
                  <Icon className="size-4" /> {label}
                  <MenubarShortcut className="flex items-center gap-1.5">
                    {actions.project && id === actions.current && <Check className="text-foreground" />}
                    {keys}
                  </MenubarShortcut>
                </MenubarCheckboxItem>
              )
            })}
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarItem
            disabled={!actions.canSplit(actions.current)}
            onClick={() => actions.splitRight(actions.current)}
          >
            <Columns2 /> Split {lens.label} right
          </MenubarItem>
          <MenubarItem
            disabled={!actions.canMoveToWindow(actions.current)}
            onClick={() => actions.toWindow(actions.current)}
          >
            <SquareArrowOutUpRight /> Move {lens.label} to new window
          </MenubarItem>
          <MenubarSeparator />
          <Cmd command="zoomIn" />
          <Cmd command="zoomOut" />
          <Cmd command="zoomTo100" />
          <Cmd command="zoomToFit" />
          <Cmd command="zoomToSelection" />
          <MenubarSeparator />
          <MenubarCheckboxItem
            disabled={!actions.project}
            checked={actions.panels.left || actions.panels.right}
            onCheckedChange={actions.togglePanels}
            className="ps-1.5 [&>span:first-child]:hidden"
          >
            <PanelsLeftRight className="size-4" /> Panels
            <MenubarShortcut className="flex items-center gap-1.5">
              {(actions.panels.left || actions.panels.right) && <Check className="text-foreground" />}
              {shortcutOf("panels")}
            </MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarItem>
            <SquareTerminal /> Console <MenubarShortcut>{shortcutOf("console")}</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="font-normal">Object</MenubarTrigger>
        <MenubarContent className="w-auto">
          <Commands list={objectCommands} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="font-normal">Arrange</MenubarTrigger>
        <MenubarContent className="w-auto">
          <Commands list={arrangeCommands} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="font-normal">Help</MenubarTrigger>
        <MenubarContent className="w-auto">
          <Cmd command="actions">Search actions…</Cmd>
          <Cmd command="shortcuts" />
          <MenubarSeparator />
          <MenubarItem>
            <MessageSquareWarning /> Report a problem…
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>
              <Bug /> Developer
            </MenubarSubTrigger>
            <MenubarSubContent className="w-auto">
              <Cmd command="developerTools" />
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>
            <RefreshCw /> Check for updates
          </MenubarItem>
          <MenubarItem>
            <Terminal /> Install the Parity CLI…
          </MenubarItem>
          <MenubarItem>
            <Info /> About Parity
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

/**
 * The lenses, one above another down the window's left edge, as VS Code's activity bar lists its views, on the same
 * surface as the title bar. Clicking one shows it in the canvas in focus, in place of that canvas's lens, which is
 * picked out; one shown in another canvas or window has a dot, and clicking it goes there. A lens the project has
 * nothing for sits at the bottom, quieter. Clicking the lens in focus hides or shows the left panel, as VS Code's does.
 * The arrow keys move between lenses, and each has a menu to split it or move it to a window, and can be dragged onto a
 * canvas or out of the window.
 */
export function LensBar({ actions }: { actions: ChromeActions }) {
  const available = lensOrder.filter((id) => !lenses[id].missing)
  const missing = lensOrder.filter((id) => lenses[id].missing)

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return
    }

    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-lens]")]
    const at = buttons.findIndex((button) => button === document.activeElement)

    const to = {
      ArrowDown: Math.min(buttons.length - 1, at + 1),
      ArrowUp: Math.max(0, at - 1),
      Home: 0,
      End: buttons.length - 1
    }[event.key]

    buttons[to]?.focus()
    event.preventDefault()
  }

  return (
    <div
      role="toolbar"
      aria-label="Lenses"
      aria-orientation="vertical"
      tabIndex={-1}
      className={`flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2 ${chromeSurface}`}
      onKeyDown={onKeyDown}
    >
      {available.map((id) => (
        <LensButton key={id} lens={id} actions={actions} />
      ))}
      <div className="mt-auto" />
      {missing.map((id) => (
        <LensButton key={id} lens={id} actions={actions} />
      ))}
    </div>
  )
}

/** Where a lens shows when it isn't the canvas in focus's, for its hint. */
const placeWords = { canvas: "In another canvas", window: "In its own window" }

function LensButton({ lens, actions }: { lens: LensId; actions: ChromeActions }) {
  const { label, icon: Icon, keys, missing } = lenses[lens]
  const current = actions.current === lens
  const elsewhere = actions.elsewhere(lens)
  const where = elsewhere && placeWords[elsewhere]
  const said = missing?.title ?? where

  let look =
    "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground dark:hover:bg-input/20"

  if (current) {
    look = "border-border bg-background text-foreground shadow-sm dark:border-white/10 dark:bg-white/10"
  } else if (elsewhere) {
    look = "border-transparent text-foreground hover:bg-background/70 dark:hover:bg-input/20"
  } else if (missing) {
    look =
      "border-transparent text-muted-foreground/60 hover:bg-background/70 hover:text-muted-foreground dark:hover:bg-input/20"
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Hint
            label={
              <span className="flex items-center gap-1.5">
                {label} <Kbd>{keys}</Kbd>
              </span>
            }
            detail={said}
            side="right"
          >
            <button
              type="button"
              data-lens={lens}
              aria-label={said ? `${label}, ${said.toLowerCase()}` : label}
              aria-pressed={current}
              tabIndex={current ? 0 : -1}
              onClick={() => actions.show(lens)}
              draggable={!missing}
              onDragStart={(event) => {
                event.dataTransfer.setData(lensDragType, lens)
                event.dataTransfer.effectAllowed = "move"
              }}
              className={`relative grid size-9 place-items-center rounded-lg border outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 ${look}`}
            >
              <Icon className="size-[18px]" strokeWidth={current ? 2 : 1.75} />
              {/* The bar at the window's edge, as Layers marks its selected row and VS Code its open view. */}
              {current && (
                <span aria-hidden className="absolute inset-y-1 -left-[7px] w-0.5 rounded-r-full bg-(--canvas-layer)" />
              )}
              {elsewhere && (
                <span aria-hidden className="absolute right-1 bottom-1 size-1.5 rounded-full bg-foreground/60" />
              )}
            </button>
          </Hint>
        }
      />
      <ContextMenuContent className="w-auto min-w-52">
        <ContextMenuItem onClick={() => actions.show(lens)}>
          <Icon /> Show {label}
          <ContextMenuShortcut>{keys}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!actions.canSplit(lens)} onClick={() => actions.splitRight(lens)}>
          <Columns2 /> Split right
        </ContextMenuItem>
        {actions.canMoveToMain(lens) ? (
          <ContextMenuItem onClick={() => actions.toMain(lens)}>
            <SquareArrowOutDownLeft /> Move to main window
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled={!actions.canMoveToWindow(lens)} onClick={() => actions.toWindow(lens)}>
            <SquareArrowOutUpRight /> Move to new window
          </ContextMenuItem>
        )}
        {actions.canClose(lens) && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => actions.close(lens)}>
              <X /> Close
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
