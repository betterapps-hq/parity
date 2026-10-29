import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ClipboardPaste,
  Copy,
  Download,
  Gauge,
  Grid3x3,
  Group,
  Paintbrush,
  Scissors,
  SquareDashed,
  SquarePlus,
  TextSelect,
  Ungroup,
  FileInput,
  FolderOpen,
  History,
  Images,
  LogOut,
  Magnet,
  Maximize,
  Monitor,
  Moon,
  PanelsLeftRight,
  PenLine,
  Redo2,
  Save,
  SaveAll,
  Scan,
  Settings2,
  Sun,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react"
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from "@/components/ui/menubar"
import { useActiveTabId, useRecentProjects, workspace } from "../workspace.ts"
import type { Alignment } from "./arrange.ts"
import {
  activeSession,
  alignSelection,
  closeTab,
  copy,
  copySelectionStyle,
  cut,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  exit,
  exportImages,
  openProjectFile,
  openProjectFolder,
  paste,
  pasteSelectionStyle,
  redo,
  renameSelection,
  save,
  saveCopy,
  selectEverything,
  undo,
  unwrapSelection,
  wrapSelection,
  zoomToSelection
} from "./commands.ts"
import { setLayout, useLayout } from "./layout.ts"
import { type Preferences, setPreferences, type ThemePreference, usePreferences } from "./preferences.ts"
import { openQuickInsert } from "./QuickInsert.tsx"

const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
]

const mac = navigator.userAgent.includes("Mac")

/**
 * File, Edit and View, in the title bar, like a desktop app's menus. Each menu reads the active tab when it opens, so
 * what it offers matches what's selected.
 */
export function AppMenu() {
  // Re-renders the bar when the active tab changes; the menus read the rest when they open.
  useActiveTabId()
  return (
    <Menubar className="mr-2 mb-1.5 shrink-0 [-webkit-app-region:no-drag]" aria-label="Application">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <FileItems />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <EditItems />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <ViewItems />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Arrange</MenubarTrigger>
        <MenubarContent>
          <ArrangeItems />
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

function FileItems() {
  const session = activeSession()
  const recent = useRecentProjects()
  const preferences = usePreferences()
  const selected = session?.selection.get().design
  const designs = session?.store.getEntries().length ?? 0
  return (
    <>
      <MenubarItem onSelect={() => void openProjectFolder()}>
        <FolderOpen /> Open project folder… <MenubarShortcut>Ctrl O</MenubarShortcut>
      </MenubarItem>
      <MenubarItem onSelect={() => void openProjectFile()}>
        <FileInput /> Open project file… <MenubarShortcut>Ctrl Shift O</MenubarShortcut>
      </MenubarItem>
      <MenubarSub>
        <MenubarSubTrigger>
          <History /> Open recent
        </MenubarSubTrigger>
        <MenubarSubContent className="max-w-96 min-w-64">
          {recent.length === 0 && <MenubarLabel>Nothing opened yet</MenubarLabel>}
          {recent.map((root) => (
            <MenubarItem key={root} onSelect={() => void workspace.open(root)} title={root}>
              <span className="shrink-0">{basename(root)}</span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">{root}</span>
            </MenubarItem>
          ))}
          {recent.length > 0 && (
            <>
              <MenubarSeparator />
              <MenubarItem onSelect={() => workspace.forgetRecent()}>Clear recent projects</MenubarItem>
            </>
          )}
        </MenubarSubContent>
      </MenubarSub>
      <MenubarSeparator />
      <MenubarItem disabled={!session} onSelect={() => void save()}>
        <Save /> Save <MenubarShortcut>Ctrl S</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!session} onSelect={() => void saveCopy()}>
        <SaveAll /> Save a copy… <MenubarShortcut>Ctrl Shift S</MenubarShortcut>
      </MenubarItem>
      <MenubarSub>
        <MenubarSubTrigger disabled={!session}>
          <Download /> Export
        </MenubarSubTrigger>
        <MenubarSubContent className="min-w-60">
          <MenubarItem disabled={!selected} onSelect={() => void exportImages("selection")}>
            <Images /> Selected design as PNG… <MenubarShortcut>Ctrl Shift E</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={designs === 0} onSelect={() => void exportImages("all")}>
            <Images /> All designs as PNG…
          </MenubarItem>
          <MenubarSeparator />
          <MenubarLabel>Scale</MenubarLabel>
          <MenubarRadioGroup
            value={String(preferences.exportScale)}
            onValueChange={(value) => setPreferences({ exportScale: Number(value) as Preferences["exportScale"] })}
          >
            {[1, 2, 3].map((scale) => (
              <MenubarRadioItem key={scale} value={String(scale)} onSelect={(event) => event.preventDefault()}>
                {scale}x
              </MenubarRadioItem>
            ))}
          </MenubarRadioGroup>
        </MenubarSubContent>
      </MenubarSub>
      <MenubarSeparator />
      <MenubarSub>
        <MenubarSubTrigger>
          <Settings2 /> Preferences
        </MenubarSubTrigger>
        <MenubarSubContent className="min-w-44">
          <MenubarLabel>Theme</MenubarLabel>
          <MenubarRadioGroup
            value={preferences.theme}
            onValueChange={(theme) => setPreferences({ theme: theme as ThemePreference })}
          >
            {themes.map(({ value, label, icon: Icon }) => (
              <MenubarRadioItem key={value} value={value} onSelect={(event) => event.preventDefault()}>
                <Icon /> {label}
              </MenubarRadioItem>
            ))}
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={preferences.autosave}
            onCheckedChange={(autosave) => {
              setPreferences({ autosave })
              // Turning it on saves what's waiting now, rather than at the next edit.
              if (autosave) void workspace.flush().catch(() => undefined)
            }}
            onSelect={(event) => event.preventDefault()}
          >
            Save automatically
          </MenubarCheckboxItem>
        </MenubarSubContent>
      </MenubarSub>
      <MenubarSeparator />
      <MenubarItem disabled={!workspace.getActiveId()} onSelect={() => closeTab()}>
        <X /> Close tab <MenubarShortcut>Ctrl W</MenubarShortcut>
      </MenubarItem>
      <MenubarItem onSelect={exit}>
        <LogOut /> {mac ? "Quit Parity" : "Exit"} <MenubarShortcut>{mac ? "Cmd Q" : "Alt F4"}</MenubarShortcut>
      </MenubarItem>
    </>
  )
}

function EditItems() {
  const session = activeSession()
  const history = session?.store.getHistory()
  const current = session?.selection.get() ?? {}
  const something = !!current.design || !!current.note
  return (
    <>
      <MenubarItem disabled={!history?.canUndo} onSelect={() => undo()}>
        <Undo2 /> {history?.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : "Undo"}
        <MenubarShortcut>Ctrl Z</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!history?.canRedo} onSelect={() => redo()}>
        <Redo2 /> {history?.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : "Redo"}
        <MenubarShortcut>Ctrl Shift Z</MenubarShortcut>
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem disabled={!something} onSelect={() => void cut()}>
        <Scissors /> Cut <MenubarShortcut>Ctrl X</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!something} onSelect={() => void copy()}>
        <Copy /> Copy <MenubarShortcut>Ctrl C</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!session} onSelect={() => void paste()}>
        <ClipboardPaste /> Paste <MenubarShortcut>Ctrl V</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!current.node} onSelect={() => copySelectionStyle()}>
        <Paintbrush /> Copy style <MenubarShortcut>Ctrl Alt C</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!current.node} onSelect={() => pasteSelectionStyle()}>
        <Paintbrush /> Paste style <MenubarShortcut>Ctrl Alt V</MenubarShortcut>
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem disabled={!current.design} onSelect={() => openQuickInsert()}>
        <SquarePlus /> Insert… <MenubarShortcut>/</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!session} onSelect={() => selectEverything()}>
        <TextSelect /> Select all <MenubarShortcut>Ctrl A</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!current.design} onSelect={() => duplicateSelection()}>
        <Copy /> Duplicate <MenubarShortcut>Ctrl D</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!current.design} onSelect={() => renameSelection()}>
        <PenLine /> Rename <MenubarShortcut>F2</MenubarShortcut>
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem variant="destructive" disabled={!something} onSelect={() => deleteSelection()}>
        <Trash2 /> Delete <MenubarShortcut>Del</MenubarShortcut>
      </MenubarItem>
    </>
  )
}

function ViewItems() {
  const session = activeSession()
  const editor = session?.editor
  const layout = useLayout()
  const preferences = usePreferences()
  const current = session?.selection.get()
  return (
    <>
      <MenubarItem disabled={!editor} onSelect={() => editor?.zoomIn()}>
        <ZoomIn /> Zoom in <MenubarShortcut>Ctrl +</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!editor} onSelect={() => editor?.zoomOut()}>
        <ZoomOut /> Zoom out <MenubarShortcut>Ctrl −</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!editor} onSelect={() => editor?.resetZoom()} inset>
        Zoom to 100% <MenubarShortcut>Shift 0</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!editor} onSelect={() => editor?.zoomToFit({ animation: { duration: 200 } })}>
        <Maximize /> Zoom to fit <MenubarShortcut>Shift 1</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!current?.design && !current?.note} onSelect={() => zoomToSelection()}>
        <Scan /> Zoom to selection <MenubarShortcut>Shift 2</MenubarShortcut>
      </MenubarItem>
      <MenubarSeparator />
      <MenubarCheckboxItem
        checked={layout.left || layout.right}
        onCheckedChange={(open) => setLayout({ left: open, right: open })}
      >
        <PanelsLeftRight /> Panels <MenubarShortcut>Ctrl \</MenubarShortcut>
      </MenubarCheckboxItem>
      <MenubarCheckboxItem checked={preferences.snapping} onCheckedChange={(snapping) => setPreferences({ snapping })}>
        <Magnet /> Snap to designs
      </MenubarCheckboxItem>
      <MenubarCheckboxItem
        checked={preferences.layoutGrid}
        onCheckedChange={(layoutGrid) => setPreferences({ layoutGrid })}
      >
        <Grid3x3 /> Layout grid <MenubarShortcut>Shift G</MenubarShortcut>
      </MenubarCheckboxItem>
      <MenubarCheckboxItem
        checked={preferences.performanceStats}
        onCheckedChange={(performanceStats) => setPreferences({ performanceStats })}
      >
        <Gauge /> Performance stats
      </MenubarCheckboxItem>
    </>
  )
}

const alignItems: { value: Alignment; label: string; shortcut: string; icon: typeof AlignStartVertical }[] = [
  { value: "left", label: "Align left", shortcut: "Alt A", icon: AlignStartVertical },
  { value: "center", label: "Align horizontal centers", shortcut: "Alt H", icon: AlignCenterVertical },
  { value: "right", label: "Align right", shortcut: "Alt D", icon: AlignEndVertical },
  { value: "top", label: "Align top", shortcut: "Alt W", icon: AlignStartHorizontal },
  { value: "middle", label: "Align vertical centers", shortcut: "Alt V", icon: AlignCenterHorizontal },
  { value: "bottom", label: "Align bottom", shortcut: "Alt S", icon: AlignEndHorizontal }
]

function ArrangeItems() {
  const session = activeSession()
  const current = session?.selection.get() ?? {}
  const layers = current.nodes?.length ?? (current.node ? 1 : 0)
  const designs = current.designs?.length ?? (current.design && !current.node ? 1 : 0)
  const alignable = layers > 0 || designs > 1
  return (
    <>
      <MenubarItem disabled={layers === 0} onSelect={() => wrapSelection()}>
        <Group /> Wrap in layout <MenubarShortcut>Ctrl G</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={layers !== 1} onSelect={() => unwrapSelection()}>
        <Ungroup /> Unwrap layout <MenubarShortcut>Ctrl Shift G</MenubarShortcut>
      </MenubarItem>
      <MenubarSeparator />
      {alignItems.map(({ value, label, shortcut, icon: Icon }) => (
        <MenubarItem key={value} disabled={!alignable} onSelect={() => alignSelection(value)}>
          <Icon /> {label} <MenubarShortcut>{shortcut}</MenubarShortcut>
        </MenubarItem>
      ))}
      <MenubarSeparator />
      <MenubarItem disabled={designs < 3} onSelect={() => distributeSelection("horizontal")}>
        <AlignHorizontalSpaceAround /> Distribute horizontally <MenubarShortcut>Alt Shift H</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={designs < 3} onSelect={() => distributeSelection("vertical")}>
        <AlignVerticalSpaceAround /> Distribute vertically <MenubarShortcut>Alt Shift V</MenubarShortcut>
      </MenubarItem>
      {layers === 0 && designs < 2 && (
        <MenubarLabel className="flex items-center gap-1.5 font-normal">
          <SquareDashed className="size-3.5" /> Select layers or designs to arrange them
        </MenubarLabel>
      )}
    </>
  )
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}
