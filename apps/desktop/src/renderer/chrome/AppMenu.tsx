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
  BringToFront,
  ClipboardPaste,
  Code,
  Copy,
  Diamond,
  EyeOff,
  FileInput,
  FolderOpen,
  Gauge,
  ImageOff,
  Grid3x3,
  Group,
  History,
  Images,
  Info,
  Keyboard,
  LogOut,
  Magnet,
  Maximize,
  Paintbrush,
  PanelsLeftRight,
  PenLine,
  Redo2,
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
  ZoomOut
} from "lucide-react"
import type { ReactNode } from "react"
import { useActiveTabId, useRecentProjects, workspace } from "../workspace.ts"
import { actions } from "./actions.ts"
import { openDialog } from "./app-dialogs.ts"
import { activeSession, clearBitmapCache, exit, exportImages, selectedDesign, selectedInstance } from "./commands.ts"
import { type Command, keymap } from "./keymap.ts"
import { formatKeys, isMac } from "./keys.ts"
import { setLayout, useLayout } from "./layout.ts"
import { setPreferences, usePreferences } from "./preferences.ts"
import { checkForUpdates } from "./updates.tsx"

const mac = isMac()

/**
 * File, Edit, View, Object, Arrange and Help, in the title bar, like a desktop app's menus, named and ordered as
 * Figma's are. Each menu reads the active tab when it opens, so what it offers matches what's selected. Every item's
 * keys, and whether it applies, come from the keymap and its actions, the same ones the shortcuts run.
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
          <MenubarTrigger>{name}</MenubarTrigger>
          {/* As wide as what it holds; the kit's are as wide as their trigger, which wraps the items. */}
          <MenubarContent className="w-auto">
            <Items />
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  )
}

/** A command's menu item: its action, its keys, and unavailable when the action doesn't apply. */
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
  const action = actions[command]
  return (
    <MenubarItem
      variant={variant}
      inset={Icon ? undefined : true}
      disabled={action.available?.() === false}
      onClick={() => void action.run()}
    >
      {Icon && <Icon />} {children ?? keymap[command].label}
      <MenubarShortcut>{formatKeys(keymap[command].keys[0])}</MenubarShortcut>
    </MenubarItem>
  )
}

function FileItems() {
  const session = activeSession()
  const recent = useRecentProjects()
  const designs = session?.store.getEntries().length ?? 0
  return (
    <>
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
              <MenubarLabel>Nothing opened yet</MenubarLabel>
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
      <MenubarItem disabled={!session?.selection.get().design} onClick={() => void exportImages("selection")}>
        <Images /> Export selected…
        <MenubarShortcut>{formatKeys(keymap.exportSelection.keys[0])}</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={designs === 0} onClick={() => void exportImages("all")}>
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
  const history = activeSession()?.store.getHistory()
  return (
    <>
      <Item command="undo" icon={Undo2}>
        {history?.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : "Undo"}
      </Item>
      <Item command="redo" icon={Redo2}>
        {history?.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : "Redo"}
      </Item>
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
  const design = selectedDesign()
  const instance = selectedInstance()
  const current = activeSession()?.selection.get() ?? {}
  let makeComponent = "Make component"
  if (design?.container.kind === "component") makeComponent = "Make it a screen"
  else if (design) makeComponent = "Make it a component"
  return (
    <>
      <Item command="insert" icon={SquarePlus}>
        Insert…
      </Item>
      <MenubarSeparator />
      <Item command="wrap" icon={Group} />
      <Item command="unwrap" icon={Ungroup} />
      <MenubarSeparator />
      <Item command="makeComponent" icon={Diamond}>
        {makeComponent}
      </Item>
      <Item command="goToMain" icon={Diamond}>
        {instance ? `Go to ${mainName(instance.node.design)}` : "Go to the main component"}
      </Item>
      <Item command="detach" icon={Unlink} />
      <MenubarSeparator />
      <Item command="bringForward" />
      <Item command="sendBackward" />
      <Item command="bringToFront" icon={BringToFront} />
      <Item command="sendToBack" icon={SendToBack} />
      <MenubarSeparator />
      <Item command="hide" icon={EyeOff} />
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
  const unavailable = actions.alignLeft.available?.() === false
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
      <MenubarLabel className="flex items-center gap-1.5 font-normal">
        <SquareDashed className="size-3.5" /> {children}
      </MenubarLabel>
    </MenubarGroup>
  )
}

/** The name of the component design an instance copies. */
function mainName(design: string): string {
  return (
    activeSession()
      ?.store.getEntries()
      .find((entry) => entry.container.id === design)?.container.name ?? "the main component"
  )
}

function basename(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}
