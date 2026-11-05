import {
  Diamond,
  EyeOff,
  FileInput,
  FolderOpen,
  Group,
  History,
  Images,
  LogOut,
  Save,
  SaveAll,
  SquareDashed,
  SquarePlus,
  Ungroup,
  Unlink,
  X
} from "lucide-react"
import { type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode, useState } from "react"
import {
  Command as CommandRoot,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from "@/components/ui/menubar"
import { pasteAtPointer } from "../../canvas/clipboard.ts"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon } from "../../canvas/kinds.tsx"
import { actions } from "../../chrome/actions.ts"
import { closeDialog, useOpenDialog } from "../../chrome/app-dialogs.ts"
import { activeSession, exit, exportImages } from "../../chrome/commands.ts"
import { type Command, groups, keymap } from "../../chrome/keymap.ts"
import { isMac } from "../../chrome/keys.ts"
import { useRecentProjects, workspace } from "../../workspace.ts"
import { useCanvasEmpty } from "./CanvasStart.tsx"
import { keysOf, makeNew, startKeymap } from "./commands.ts"

const mac = isMac()

/**
 * The title bar's menus as proposed. File and Object open, with New screen and New component at the top of each; Edit,
 * View, Arrange and Help are unchanged, so they're drawn but don't open here.
 */
export function StartMenubar() {
  return (
    <Menubar className="mr-2 mb-1.5 shrink-0" aria-label="Application">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <FileItems />
        </MenubarContent>
      </MenubarMenu>
      <Unchanged name="Edit" />
      <Unchanged name="View" />
      <MenubarMenu>
        <MenubarTrigger>Object</MenubarTrigger>
        <MenubarContent>
          <ObjectItems />
        </MenubarContent>
      </MenubarMenu>
      <Unchanged name="Arrange" />
      <Unchanged name="Help" />
    </Menubar>
  )
}

/** A menu this exploration leaves as it is, drawn in its place. */
function Unchanged({ name }: { name: string }) {
  return <span className="rounded-md px-2 py-1 text-sm text-muted-foreground select-none">{name}</span>
}

/** New screen and New component, each with its keys, made where the app makes them today. */
function NewItems() {
  const session = activeSession()
  return (
    <>
      <MenubarItem disabled={!session} onSelect={() => session && makeNew(session, "screen")}>
        <DesignIcon kind="screen" /> {startKeymap.newScreen.label}
        <MenubarShortcut>{keysOf("newScreen")}</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={!session} onSelect={() => session && makeNew(session, "component")}>
        <DesignIcon kind="component" /> {startKeymap.newComponent.label}
        <MenubarShortcut>{keysOf("newComponent")}</MenubarShortcut>
      </MenubarItem>
    </>
  )
}

/** A command's menu item, as the app's menus draw one: its action, its keys, and unavailable when it doesn't apply. */
function Item({ command, icon: Icon, children }: { command: Command; icon?: typeof Save; children?: ReactNode }) {
  const action = actions[command]
  return (
    <MenubarItem
      inset={Icon ? undefined : true}
      disabled={action.available?.() === false}
      onSelect={() => void action.run()}
    >
      {Icon && <Icon />} {children ?? keymap[command].label}
      <MenubarShortcut>{keymap[command].keys[0]}</MenubarShortcut>
    </MenubarItem>
  )
}

function FileItems() {
  const session = activeSession()
  const recent = useRecentProjects()
  const designs = session?.store.getEntries().length ?? 0
  return (
    <>
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
          {recent.length === 0 && <MenubarLabel>Nothing opened yet</MenubarLabel>}
          {recent.map((root) => (
            <MenubarItem key={root} onSelect={() => void workspace.open(root)} className="flex-col items-start gap-0">
              <span>{root.split(/[\\/]/).findLast(Boolean) ?? root}</span>
              <span className="text-xs wrap-anywhere text-muted-foreground">{root}</span>
            </MenubarItem>
          ))}
        </MenubarSubContent>
      </MenubarSub>
      <MenubarSeparator />
      <Item command="save" icon={Save} />
      <Item command="saveCopy" icon={SaveAll}>
        Save a copy…
      </Item>
      <MenubarSeparator />
      <MenubarItem disabled={!session?.selection.get().design} onSelect={() => void exportImages("selection")}>
        <Images /> Export selected design…
        <MenubarShortcut>{keymap.exportSelection.keys[0]}</MenubarShortcut>
      </MenubarItem>
      <MenubarItem disabled={designs === 0} onSelect={() => void exportImages("all")}>
        <Images /> Export all designs…
      </MenubarItem>
      <MenubarSeparator />
      <Item command="closeTab" icon={X} />
      {!mac && (
        <MenubarItem onSelect={exit}>
          <LogOut /> Exit <MenubarShortcut>Alt F4</MenubarShortcut>
        </MenubarItem>
      )}
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
      <Item command="bringToFront" />
      <Item command="sendToBack" />
      <MenubarSeparator />
      <Item command="hide" icon={EyeOff} />
      {!current.design && !current.note && (
        <MenubarLabel className="flex items-center gap-1.5 font-normal">
          <SquareDashed className="size-3.5" /> Select layers, a screen or a component to act on them
        </MenubarLabel>
      )}
    </>
  )
}

/** Where the menu opened, on the screen. */
interface Point {
  x: number
  y: number
}

/**
 * The canvas's right-click menu, around its screens and components, as proposed: New screen and New component first,
 * made where the menu opened, then Insert, then today's Paste here, Select all and Zoom to fit. On an empty canvas,
 * Select all and Zoom to fit have nothing to act on, so they're unavailable. Over a screen or component, today's menu
 * is unchanged and isn't drawn here.
 */
export function StartCanvasMenu({ children }: { children: ReactElement }) {
  const session = useProject()
  const [at, setAt] = useState<Point>()
  const onContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    // tldraw keeps the system's menu from a right-click on the canvas, and sends its own when the button comes up.
    if (event.defaultPrevented) return
    const { editor } = session
    const from = event.target
    const onCanvas =
      from instanceof Element &&
      !!from.closest(".tl-container") &&
      !from.closest("button, input, textarea, select, a[href], [role=menuitem], .design-title, .text-editor")
    const point = { x: event.clientX, y: event.clientY }
    const overDesign =
      !!editor &&
      !!editor.getShapeAtPoint(editor.screenToPage(point), {
        hitInside: true,
        filter: (shape) => shape.type === "canvas-container"
      })
    if (session.selection.getTool() === "interact" || !onCanvas || overDesign) {
      event.preventDefault()
      return
    }
    setAt(point)
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-60 [&_[role=menuitem]]:whitespace-nowrap" aria-label="Canvas">
        {at && <CanvasItems at={at} />}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function CanvasItems({ at }: { at: Point }) {
  const session = useProject()
  const empty = useCanvasEmpty()
  return (
    <>
      <ContextMenuItem onSelect={() => makeNew(session, "screen", at)}>
        {startKeymap.newScreen.label}
        <ContextMenuShortcut>{keysOf("newScreen")}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => makeNew(session, "component", at)}>
        {startKeymap.newComponent.label}
        <ContextMenuShortcut>{keysOf("newComponent")}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void actions.insert.run()}>
        Insert…
        <ContextMenuShortcut>{keymap.insert.keys[0]}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void pasteAtPointer(session, at)}>Paste here</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={empty} onSelect={() => void actions.selectAll.run()}>
        {keymap.selectAll.label}
        <ContextMenuShortcut>{keymap.selectAll.keys[0]}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={empty} onSelect={() => void actions.zoomToFit.run()}>
        {keymap.zoomToFit.label}
        <ContextMenuShortcut>{keymap.zoomToFit.keys[0]}</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  )
}

/**
 * Matches an action by the start of a word in its name or group, best when its name starts with what's typed, rather
 * than by letters scattered through it, so "new" finds New screen and New component and not Interact with designs.
 */
function byWords(value: string, search: string): number {
  const text = value.toLowerCase()
  const typed = search.trim().toLowerCase()
  if (!typed) return 1
  if (text.startsWith(typed)) return 1
  return text.split(/\s+/).some((word) => word.startsWith(typed)) ? 0.5 : 0
}

interface SearchItem {
  id: string
  label: string
  group: string
  keys?: string
  available?: () => boolean
  run: () => unknown
}

/**
 * Search actions (Ctrl K) as proposed: New screen and New component join the Object group, first, so typing "new",
 * "screen" or "component" finds them. It opens as the app's does, from Ctrl K or Help > Search actions; everything else
 * in it is today's.
 */
export function StartActionsSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const open = useOpenDialog() === "actions"
  const [query, setQuery] = useState(initialQuery)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuery(initialQuery)
  }
  const session = activeSession()
  const added: SearchItem[] = (["newScreen", "newComponent"] as const).map((id) => ({
    id,
    ...startKeymap[id],
    keys: keysOf(id),
    available: () => !!session,
    run: () => session && makeNew(session, id === "newScreen" ? "screen" : "component")
  }))
  const existing: SearchItem[] = Object.keys(keymap)
    .filter((id): id is Command => id in keymap && id !== "actions")
    .filter((id) => !actions[id].byKey)
    .map((id) => ({ id, ...keymap[id], keys: keymap[id].keys[0], ...actions[id] }))
  const items = [...added, ...existing]
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && closeDialog()}
      title="Search actions"
      description="Search for an action to run"
    >
      <CommandRoot filter={byWords}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search actions" />
        <CommandList className="max-h-96">
          <CommandEmpty>No action matches.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.group} ${item.id}`}
                    disabled={item.available?.() === false}
                    onSelect={() => {
                      closeDialog()
                      void item.run()
                    }}
                  >
                    {item.label}
                    {item.keys && <CommandShortcut>{item.keys}</CommandShortcut>}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandRoot>
    </CommandDialog>
  )
}
