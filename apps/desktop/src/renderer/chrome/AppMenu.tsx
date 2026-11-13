import {
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
} from "@buildkitgg/shadcn-baseui-kit"
import {
  Bug,
  Check,
  Gauge,
  Grid3x3,
  type LucideIcon,
  Magnet,
  PanelsLeftRight,
  SquareTerminal,
  FolderDown,
  History,
  ImageOff,
  Info,
  ListX,
  LogOut,
  MessageSquareWarning,
  RefreshCw,
  Terminal
} from "lucide-react"
import { createContext, type ReactNode, useContext } from "react"
import { useActiveTabId, useRecentProjects, workspace } from "../workspace.ts"
import { actions, commandsFor } from "./actions.ts"
import { openDialog } from "./app-dialogs.ts"
import { installCliCommand } from "./cli-command.ts"
import { iconFor } from "./command-icons.ts"
import type { CommandStates } from "./command-state.ts"
import { activeSession, clearBitmapCache, exit, exportAllImages } from "./commands.ts"
import { type Command, keymap } from "./keymap.ts"
import { formatKeys, isMac } from "./keys.ts"
import { setLayout, useLayout } from "./layout.ts"
import { setPreferences, usePreferences } from "./preferences.ts"
import { openReport } from "./ReportProblemDialog.tsx"
import { checkForUpdates } from "./updates.tsx"

const mac = isMac()

/**
 * File, Edit, View, Object, Arrange and Help, in the title bar, like a desktop app's menus, named and ordered as
 * Figma's are. Each menu reads the active tab when it opens, so what it offers matches what's selected. Every item's
 * keys come from the keymap, its icon from `commandIcons`, and whether it applies and what it's called from
 * `commandsFor`, as the shortcuts read them. Each command is in one menu only.
 */
export function AppMenu() {
  // Re-renders the bar when the active tab changes; the menus read the rest when they open.
  useActiveTabId()

  const menus: [string, () => ReactNode][] = [
    ["File", FileItems],
    ["Edit", EditItems],
    ["View", ViewItems],
    ["Object", ObjectItems],
    ["Arrange", ArrangeItems],
    ["Help", HelpItems]
  ]

  return (
    <Menubar className="mr-2 mb-1.5 shrink-0 border-0 [-webkit-app-region:no-drag]" aria-label="Application">
      {menus.map(([name, Items]) => (
        <MenubarMenu key={name}>
          <MenubarTrigger className="font-normal">{name}</MenubarTrigger>
          {/* As wide as what it holds; the kit's are as wide as their trigger, which wraps the items. */}
          <MenubarContent className="w-auto">
            <MenuItems items={Items} />
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  )
}

/** Each command's state in the active tab, as the open menu read it. */
const States = createContext<CommandStates | undefined>(undefined)

/** A menu's items, with every command's state read once as it opens. */
function MenuItems({ items: Items }: { items: () => ReactNode }) {
  return (
    <States.Provider value={commandsFor()}>
      <Items />
    </States.Provider>
  )
}

/** Each command's state, as the open menu read it. */
function useStates(): CommandStates {
  const states = useContext(States)

  if (!states) {
    throw new Error("A menubar item rendered outside its menu")
  }

  return states
}

/**
 * A command's menu item: its icon from `iconFor`, its action, its keys, and its name and whether it applies from
 * `commandsFor`. `children` is for a menu's own fixed wording, as Save a copy… says it asks where, only for a command
 * whose name never changes.
 */
function Item({ command, variant, children }: { command: Command; variant?: "destructive"; children?: ReactNode }) {
  const state = useStates()[command]
  const icon = iconFor(command)

  return (
    <MenubarItem
      variant={variant}
      inset={icon ? undefined : true}
      disabled={!state.enabled}
      onClick={() => void actions[command].run("menu")}
    >
      {icon} {children ?? state.label}
      <MenubarShortcut>{formatKeys(keymap[command].keys[0])}</MenubarShortcut>
    </MenubarItem>
  )
}

/**
 * A setting that's on or off: its icon where every item's goes, so it lines up with the rest, and a tick on the right,
 * before its keys, while it's on. The kit's own tick takes the icon's place, which pushes an icon and label right.
 */
function Toggle({
  icon: Icon,
  checked,
  onChange,
  keys,
  children
}: {
  icon: LucideIcon
  checked: boolean
  onChange: (checked: boolean) => void
  keys?: string
  children: ReactNode
}) {
  return (
    <MenubarCheckboxItem checked={checked} onCheckedChange={onChange} className="ps-1.5 [&>span:first-child]:hidden">
      <Icon /> {children}
      <MenubarShortcut className="flex items-center gap-1.5">
        {checked && <Check className="text-foreground" />}
        {keys && formatKeys(keys)}
      </MenubarShortcut>
    </MenubarCheckboxItem>
  )
}

/** Tabs and projects: open, save, export, Settings, then close. New screen and New component are Object's. */
function FileItems() {
  const session = activeSession()
  const recent = useRecentProjects()
  const designs = session?.store.getEntries().length ?? 0

  return (
    <>
      <Item command="newTab" />
      <MenubarSeparator />
      <Item command="openFolder">Open project folder…</Item>
      <Item command="openFile">Open project file…</Item>
      <MenubarSub>
        <MenubarSubTrigger>
          <History /> Open recent
        </MenubarSubTrigger>
        <MenubarSubContent className="max-w-96 min-w-64">
          {recent.length === 0 && (
            <MenubarGroup>
              <MenubarLabel className="font-normal text-muted-foreground">Nothing opened yet</MenubarLabel>
            </MenubarGroup>
          )}
          {recent.map((root) => (
            <MenubarItem key={root} onClick={() => void workspace.open(root)} className="flex-col items-start gap-0">
              <span>{basename(root)}</span>
              <span className="text-xs wrap-anywhere text-muted-foreground">{root}</span>
            </MenubarItem>
          ))}
          {recent.length > 0 && (
            <>
              <MenubarSeparator />
              <MenubarItem onClick={() => workspace.forgetRecent()}>
                <ListX /> Clear recent projects
              </MenubarItem>
            </>
          )}
        </MenubarSubContent>
      </MenubarSub>
      <MenubarSeparator />
      <Item command="save" />
      <Item command="saveCopy">Save a copy…</Item>
      <MenubarSeparator />
      <Item command="exportSelection">Export selected…</Item>
      <MenubarItem disabled={designs === 0} onClick={() => void exportAllImages()}>
        <FolderDown /> Export all…
      </MenubarItem>
      <MenubarSeparator />
      <Item command="settings">Settings{mac ? "…" : ""}</Item>
      <MenubarSeparator />
      <Item command="closeTab" />
      {/* On a Mac, Quit is in the Parity menu, as every app's is. */}
      {!mac && (
        <MenubarItem onClick={exit}>
          <LogOut /> Exit <MenubarShortcut>{formatKeys("Alt F4")}</MenubarShortcut>
        </MenubarItem>
      )}
    </>
  )
}

/** History, the clipboard, copying pictures and styles, then what changes or selects what's selected. */
function EditItems() {
  return (
    <>
      <Item command="undo" />
      <Item command="redo" />
      <Item command="repeat" />
      <MenubarSeparator />
      <Item command="cut" />
      <Item command="copy" />
      <Item command="paste" />
      <Item command="pasteOver" />
      <Item command="pasteReplace" />
      <MenubarSeparator />
      <Item command="copyAsPng" />
      <Item command="copyStyle" />
      <Item command="pasteStyle" />
      <MenubarSeparator />
      <Item command="duplicate" />
      <Item command="rename" />
      <Item command="delete" variant="destructive" />
      <MenubarSeparator />
      <Item command="selectAll" />
      <Item command="selectMatching" />
      <Item command="selectInverse" />
    </>
  )
}

/** Home, zoom, and what the window shows. */
function ViewItems() {
  const layout = useLayout()
  const preferences = usePreferences()

  return (
    <>
      <Item command="home" />
      <MenubarSeparator />
      <Item command="zoomIn" />
      <Item command="zoomOut" />
      <Item command="zoomTo100" />
      <Item command="zoomToFit" />
      <Item command="zoomToSelection" />
      <MenubarSeparator />
      <Toggle
        icon={PanelsLeftRight}
        checked={layout.left || layout.right}
        onChange={(open) => setLayout({ left: open, right: open })}
        keys={keymap.panels.keys[0]}
      >
        Panels
      </Toggle>
      <Toggle
        icon={SquareTerminal}
        checked={!!layout.console}
        onChange={(open) => setLayout({ console: open })}
        keys={keymap.console.keys[0]}
      >
        Console
      </Toggle>
      <Toggle
        icon={Grid3x3}
        checked={preferences.layoutGrid}
        onChange={(layoutGrid) => setPreferences({ layoutGrid })}
        keys={keymap.layoutGrid.keys[0]}
      >
        Layout grid
      </Toggle>
      <Toggle icon={Magnet} checked={preferences.snapping} onChange={(snapping) => setPreferences({ snapping })}>
        Snap to screens and components
      </Toggle>
    </>
  )
}

function ObjectItems() {
  return (
    <>
      <Item command="newScreen" />
      <Item command="newComponent" />
      <Item command="insert">Insert…</Item>
      <Item command="findReferences">Find references…</Item>
      <MenubarSeparator />
      <Item command="wrap" />
      <Item command="unwrap" />
      <MenubarSeparator />
      <Item command="makeComponent" />
      <Item command="goToMain" />
      <Item command="detach" />
      <MenubarSeparator />
      <Item command="bringToFront" />
      <Item command="bringForward" />
      <Item command="sendBackward" />
      <Item command="sendToBack" />
      <MenubarSeparator />
      <Item command="hide" />
      <Item command="lock" />
    </>
  )
}

const alignCommands: Command[] = ["alignLeft", "alignCenter", "alignRight", "alignTop", "alignMiddle", "alignBottom"]

function ArrangeItems() {
  return (
    <>
      {alignCommands.map((command) => (
        <Item key={command} command={command} />
      ))}
      <MenubarSeparator />
      <Item command="distributeHorizontal" />
      <Item command="distributeVertical" />
    </>
  )
}

/** Finding things, reporting a problem, upkeep under Developer, then updates, the Parity CLI and About. */
function HelpItems() {
  const preferences = usePreferences()

  return (
    <>
      <Item command="actions">Search actions…</Item>
      <Item command="shortcuts" />
      <MenubarSeparator />
      <MenubarItem onClick={() => void openReport()}>
        <MessageSquareWarning /> Report a problem…
      </MenubarItem>
      <MenubarSub>
        <MenubarSubTrigger>
          <Bug /> Developer
        </MenubarSubTrigger>
        <MenubarSubContent className="w-auto">
          <Item command="developerTools" />
          <Toggle
            icon={Gauge}
            checked={preferences.performanceStats}
            onChange={(performanceStats) => setPreferences({ performanceStats })}
          >
            Performance stats
          </Toggle>
          <MenubarItem onClick={() => void clearBitmapCache()}>
            <ImageOff /> Clear bitmap cache
          </MenubarItem>
        </MenubarSubContent>
      </MenubarSub>
      <MenubarSeparator />
      <MenubarItem onClick={checkForUpdates}>
        <RefreshCw /> Check for updates
      </MenubarItem>
      <MenubarItem onClick={() => void installCliCommand()}>
        <Terminal /> Install the Parity CLI…
      </MenubarItem>
      <MenubarItem onClick={() => openDialog("about")}>
        <Info /> About Parity
      </MenubarItem>
    </>
  )
}

function basename(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}
