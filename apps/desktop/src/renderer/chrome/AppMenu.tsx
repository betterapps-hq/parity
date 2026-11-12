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
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  AppWindow,
  BringToFront,
  ClipboardPaste,
  Code,
  Component,
  Copy,
  Diamond,
  EyeOff,
  FileInput,
  FolderOpen,
  Gauge,
  ImageOff,
  Grid3x3,
  House,
  Group,
  History,
  Images,
  Info,
  Keyboard,
  Lock,
  LogOut,
  Magnet,
  Maximize,
  Paintbrush,
  PanelsLeftRight,
  SquareTerminal,
  PenLine,
  Telescope,
  Terminal,
  Plus,
  Redo2,
  Repeat2,
  RefreshCw,
  Save,
  SaveAll,
  Scan,
  Scissors,
  Search,
  SendToBack,
  Settings,
  SquareDashed,
  SquarePlus,
  TextSelect,
  Trash2,
  Undo2,
  Ungroup,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
  MessageSquareWarning
} from "lucide-react"
import { createContext, type ReactNode, useContext } from "react"
import { useActiveTabId, useRecentProjects, workspace } from "../workspace.ts"
import { actions, commandsFor } from "./actions.ts"
import { openDialog } from "./app-dialogs.ts"
import { installCliCommand } from "./cli-command.ts"
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
 * keys come from the keymap, and whether it applies and what it's called from `commandsFor`, as the shortcuts read them.
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
 * A command's menu item: its action, its keys, and its name and whether it applies from `commandsFor`. `children` is
 * for a menu's own fixed wording, as Save a copy… says it asks where, only for a command whose name never changes.
 */
function Item({
  command,
  icon: Icon,
  variant,
  children
}: {
  command: Command
  icon?: typeof Save
  variant?: "destructive"
  children?: ReactNode
}) {
  const state = useStates()[command]

  return (
    <MenubarItem
      variant={variant}
      inset={Icon ? undefined : true}
      disabled={!state.enabled}
      onClick={() => void actions[command].run("menu")}
    >
      {Icon && <Icon />} {children ?? state.label}
      <MenubarShortcut>{formatKeys(keymap[command].keys[0])}</MenubarShortcut>
    </MenubarItem>
  )
}

/** New screen and New component, which lead File and Object, each made right of everything. */
function NewItems() {
  return (
    <>
      <Item command="newScreen" icon={AppWindow} />
      <Item command="newComponent" icon={Component} />
    </>
  )
}

function FileItems() {
  const session = activeSession()
  const recent = useRecentProjects()
  const designs = session?.store.getEntries().length ?? 0

  return (
    <>
      <Item command="newTab" icon={Plus} />
      <MenubarSeparator />
      <NewItems />
      <MenubarSeparator />
      <Item command="openFolder" icon={FolderOpen}>
        Open project folder…
      </Item>
      <Item command="openFile" icon={FileInput}>
        Open project file…
      </Item>
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
              <MenubarItem onClick={() => workspace.forgetRecent()}>Clear recent projects</MenubarItem>
            </>
          )}
        </MenubarSubContent>
      </MenubarSub>
      <MenubarSeparator />
      <Item command="save" icon={Save} />
      <Item command="saveCopy" icon={SaveAll}>
        Save a copy…
      </Item>
      <MenubarSeparator />
      <Item command="exportSelection" icon={Images}>
        Export selected…
      </Item>
      <MenubarItem disabled={designs === 0} onClick={() => void exportAllImages()}>
        <Images /> Export all…
      </MenubarItem>
      <MenubarSeparator />
      <Item command="closeTab" icon={X} />
      {/* On a Mac, Quit is in the Parity menu, as every app's is. */}
      {!mac && (
        <MenubarItem onClick={exit}>
          <LogOut /> Exit <MenubarShortcut>{formatKeys("Alt F4")}</MenubarShortcut>
        </MenubarItem>
      )}
    </>
  )
}

function EditItems() {
  return (
    <>
      <Item command="undo" icon={Undo2} />
      <Item command="redo" icon={Redo2} />
      <Item command="repeat" icon={Repeat2} />
      <MenubarSeparator />
      <Item command="cut" icon={Scissors} />
      <Item command="copy" icon={Copy} />
      <Item command="paste" icon={ClipboardPaste} />
      <Item command="pasteOver" />
      <Item command="pasteReplace" />
      <Item command="duplicate" icon={Copy} />
      <Item command="delete" icon={Trash2} variant="destructive" />
      <MenubarSeparator />
      <Item command="copyStyle" icon={Paintbrush} />
      <Item command="pasteStyle" icon={Paintbrush} />
      <MenubarSeparator />
      <Item command="selectAll" icon={TextSelect} />
      <Item command="selectMatching" />
      <Item command="selectInverse" />
      <Item command="rename" icon={PenLine} />
      <MenubarSeparator />
      <Item command="settings" icon={Settings}>
        Settings{mac ? "…" : ""}
      </Item>
    </>
  )
}

function ViewItems() {
  const layout = useLayout()
  const preferences = usePreferences()

  return (
    <>
      <Item command="home" icon={House} />
      <MenubarSeparator />
      <Item command="zoomIn" icon={ZoomIn} />
      <Item command="zoomOut" icon={ZoomOut} />
      <Item command="zoomTo100" />
      <Item command="zoomToFit" icon={Maximize} />
      <Item command="zoomToSelection" icon={Scan} />
      <Item command="previousDesign" />
      <Item command="nextDesign" />
      <MenubarSeparator />
      <MenubarCheckboxItem
        checked={layout.left || layout.right}
        onCheckedChange={(open) => setLayout({ left: open, right: open })}
      >
        <PanelsLeftRight /> Panels <MenubarShortcut>{formatKeys(keymap.panels.keys[0])}</MenubarShortcut>
      </MenubarCheckboxItem>
      <MenubarCheckboxItem checked={!!layout.console} onCheckedChange={(open) => setLayout({ console: open })}>
        <SquareTerminal /> Console <MenubarShortcut>{formatKeys(keymap.console.keys[0])}</MenubarShortcut>
      </MenubarCheckboxItem>
      <MenubarCheckboxItem
        checked={preferences.layoutGrid}
        onCheckedChange={(layoutGrid) => setPreferences({ layoutGrid })}
      >
        <Grid3x3 /> Layout grid <MenubarShortcut>{formatKeys(keymap.layoutGrid.keys[0])}</MenubarShortcut>
      </MenubarCheckboxItem>
      <MenubarCheckboxItem checked={preferences.snapping} onCheckedChange={(snapping) => setPreferences({ snapping })}>
        <Magnet /> Snap to screens and components
      </MenubarCheckboxItem>
      <MenubarCheckboxItem
        checked={preferences.performanceStats}
        onCheckedChange={(performanceStats) => setPreferences({ performanceStats })}
      >
        <Gauge /> Performance stats
      </MenubarCheckboxItem>
      <MenubarItem onClick={() => void clearBitmapCache()}>
        <ImageOff /> Clear bitmap cache
      </MenubarItem>
    </>
  )
}

function ObjectItems() {
  const current = activeSession()?.selection.get() ?? {}

  return (
    <>
      <NewItems />
      <Item command="insert" icon={SquarePlus}>
        Insert…
      </Item>
      <Item command="findReferences" icon={Telescope}>
        Find references…
      </Item>
      <MenubarSeparator />
      <Item command="wrap" icon={Group} />
      <Item command="unwrap" icon={Ungroup} />
      <MenubarSeparator />
      <Item command="makeComponent" icon={Diamond} />
      <Item command="goToMain" icon={Diamond} />
      <Item command="detach" icon={Unlink} />
      <MenubarSeparator />
      <Item command="bringForward" />
      <Item command="sendBackward" />
      <Item command="bringToFront" icon={BringToFront} />
      <Item command="sendToBack" icon={SendToBack} />
      <MenubarSeparator />
      <Item command="hide" icon={EyeOff} />
      <Item command="lock" icon={Lock} />
      {!current.design && !current.note && (
        <SelectionHint>Select layers, a screen or a component to act on them</SelectionHint>
      )}
    </>
  )
}

const alignCommands: { command: Command; icon: typeof AlignStartVertical }[] = [
  { command: "alignLeft", icon: AlignStartVertical },
  { command: "alignCenter", icon: AlignCenterVertical },
  { command: "alignRight", icon: AlignEndVertical },
  { command: "alignTop", icon: AlignStartHorizontal },
  { command: "alignMiddle", icon: AlignCenterHorizontal },
  { command: "alignBottom", icon: AlignEndHorizontal }
]

function ArrangeItems() {
  const unavailable = !useStates().alignLeft.enabled

  return (
    <>
      {alignCommands.map(({ command, icon }) => (
        <Item key={command} command={command} icon={icon} />
      ))}
      <MenubarSeparator />
      <Item command="distributeHorizontal" icon={AlignHorizontalSpaceAround} />
      <Item command="distributeVertical" icon={AlignVerticalSpaceAround} />
      {unavailable && <SelectionHint>Select layers, screens or components to arrange them</SelectionHint>}
    </>
  )
}

function HelpItems() {
  return (
    <>
      <Item command="actions" icon={Search}>
        Search actions…
      </Item>
      <Item command="shortcuts" icon={Keyboard}>
        Keyboard shortcuts
      </Item>
      <MenubarSeparator />
      <Item command="developerTools" icon={Code} />
      <MenubarItem onClick={() => void installCliCommand()}>
        <Terminal /> Install the Parity CLI…
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem onClick={() => void openReport()}>
        <MessageSquareWarning /> Report a problem…
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem onClick={checkForUpdates}>
        <RefreshCw /> Check for updates
      </MenubarItem>
      <MenubarItem onClick={() => openDialog("about")}>
        <Info /> About Parity
      </MenubarItem>
    </>
  )
}

/** Says what to select for a menu whose items all need a selection. */
function SelectionHint({ children }: { children: ReactNode }) {
  return (
    <MenubarGroup>
      <MenubarLabel className="flex items-center gap-1.5 font-normal text-muted-foreground">
        <SquareDashed className="size-3.5" /> {children}
      </MenubarLabel>
    </MenubarGroup>
  )
}

function basename(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}
