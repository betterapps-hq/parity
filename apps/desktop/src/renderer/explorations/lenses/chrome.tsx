import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
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
  SquareArrowOutUpRight,
  SquareTerminal,
  Terminal,
  X
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { AccountMenu } from "../../account/AccountMenu.tsx"
import { iconFor } from "../../chrome/command-icons.ts"
import { Hint } from "../../chrome/Hint.tsx"
import { type Command, keymap, shortcutOf } from "../../chrome/keymap.ts"
import { chromeSurface } from "../../lenses/LensBar.tsx"
import type { LensActions } from "../../lenses/shell.ts"
import { lensOrder, lenses, project as openProject, recentProjects } from "./data.ts"
import type { LensId } from "./model.ts"

/** What the title bar does: the lenses' actions its View menu uses, and what it does with the project. */
export type ChromeActions = Pick<
  LensActions<LensId>,
  "current" | "show" | "splitRight" | "canSplit" | "toWindow" | "canMoveToWindow" | "panels" | "togglePanels"
> & {
  /** Whether a project is open: on Home, what acts on one is unavailable. */
  project: boolean
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
  const current = actions.current
  const lens = current && lenses[current]

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
              const { name: label, Icon, shortcut: keys } = lenses[id]

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
            disabled={!current || !actions.canSplit(current)}
            onClick={() => current && actions.splitRight(current)}
          >
            <Columns2 /> {lens ? `Split ${lens.name} right` : "Split right"}
          </MenubarItem>
          <MenubarItem
            disabled={!current || !actions.canMoveToWindow(current)}
            onClick={() => current && actions.toWindow(current)}
          >
            <SquareArrowOutUpRight /> {lens ? `Move ${lens.name} to new window` : "Move to new window"}
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
