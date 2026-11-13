import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut
} from "@buildkitgg/shadcn-baseui-kit"
import {
  boardTarget,
  type ComponentLibrary,
  type ContainerKind,
  type DesignNode,
  editInner,
  layerOnBoard,
  locateNode,
  nodeLabel,
  nodeOnBoard,
  toggleHidden
} from "@parity-app/core"
import {
  boardComponentNode,
  activeState,
  branchIds,
  closedTree,
  designsSelection,
  expandedRows,
  kindName,
  layerRowId,
  layersSelection,
  readLayersDrag,
  revealIds,
  revealRows,
  searchRows,
  selectedDesigns,
  selectedNodes,
  siblingIds,
  toggleRow,
  toggleRows,
  type LockSource,
  lockSource,
  setDesignLocked,
  toggleLockedLayers,
  type TreeRow,
  treeRows
} from "@parity-app/editor"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ChevronRight,
  ChevronsDownUp,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Plus,
  MonitorSmartphone,
  OctagonAlert,
  PenLine,
  StickyNote
} from "lucide-react"
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { componentBoardsFile } from "../canvas/component-boards.ts"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor, focusOnMount, kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { moveLayers, type MoveTarget } from "../canvas/layer-drag.ts"
import { routePagesFile } from "../canvas/route-pages.ts"
import { storyScreensFile } from "../canvas/story-screens.ts"
import { type ContainerEntry, useContainerEntries, useNotes } from "../design-store.ts"
import { useLayerFailure } from "../failures-store.ts"
import { useHover, useRenameRequest, useSelection } from "../selection.ts"
import { actions, commandsFor } from "./actions.ts"
import { SearchField } from "./AssetsPanel.tsx"
import { iconFor } from "./command-icons.ts"
import { showConsole } from "./ConsolePanel.tsx"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { renameAndRecord } from "./inspector-events.ts"
import { keymap } from "./keymap.ts"
import { type LayersRow, layersMenu, rowSelection } from "./layers-menu.ts"
import { Name, NameInput } from "./Name.tsx"
import { GroupLabel } from "./PanelSection.tsx"
import { revealSelection } from "./reveal.ts"

type Row = TreeRow<ContainerEntry>

/** Where dragged layers or designs would land relative to a row: just above it, just below it, or inside it. */
type DropPosition = "before" | "after" | "inside"

/** The drag data types for layers and designs dragged in the Layers panel. An instance's slot takes layers too. */
export const layersMime = "application/x-parity-layers"
const designMime = "application/x-parity-design"

/** A component's board opens straight to what the component draws, since the board is the component. */
function boardOpensTo(entry: ContainerEntry): DesignNode | undefined {
  return entry.path === componentBoardsFile ? boardComponentNode(entry.container) : undefined
}

interface Group {
  id: string
  title: string
  kind: "component" | "screen" | "frame"
  /** What its + makes; the app's routes have none, since they're read from its code. */
  command?: "newComponent" | "newScreen" | "frame"
  none: string
  entries: ContainerEntry[]
}

/**
 * What the tree draws, top to bottom: each group's heading, its rows (or, with none, a row that makes the first), and a
 * gap after it. Only the lines in view are drawn, so a project of thousands of layers costs what a small one does.
 */
type Line =
  | { type: "heading" | "empty"; key: string; group: Group }
  | { type: "row"; key: string; row: Row }
  | { type: "gap" | "none"; key: string }

const lineHeights: Record<Line["type"], number> = { heading: 28, empty: 28, row: 28, gap: 8, none: 28 }

/**
 * Every design in the project as a tree, Figma style: components, then screens, at the top level, their layers
 * nested inside. Selecting, hovering and renaming here act on the canvas too. Each group's heading has a + that makes a
 * new one, always showing, with its keys in the tooltip; an empty group's row is a button that makes
 * the first one (PAR-546). A search above the tree finds layers and designs by name, and Collapse all closes every
 * row. Only the rows in view are drawn (PAR-187).
 */
export function LayerTree() {
  const session = useProject()
  const { store, selection } = session
  const entries = useContainerEntries(store)
  const notes = useNotes(store)
  const selected = useSelection(selection)
  const hover = useHover(selection)
  const [expansion, setExpansion] = useState(closedTree)
  const expanded = useMemo(() => expandedRows(expansion), [expansion])
  const [renaming, setRenaming] = useState<string>()
  const [query, setQuery] = useState("")
  const search = query.trim()
  const scrollRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  // Edit > Rename on a layer renames it here; a design's own name is renamed on its title, on the canvas.
  const renameRequest = useRenameRequest(selection)
  const [renameHandled, setRenameHandled] = useState(() => selection.getRename()?.id)

  if (renameRequest && renameRequest.id !== renameHandled) {
    setRenameHandled(renameRequest.id)

    if (renameRequest.node) {
      setRenaming(layerRowId(renameRequest.design, renameRequest.node))
    }
  }

  // Revealing a new selection: its design and every ancestor of its layers open up. Selected anywhere but here, the
  // rows opened for the last selection close again. Adjusted while rendering, since it follows from the selection
  // rather than from anything outside React.
  const selectionKey = `${selected.design ?? ""}/${selectedNodes(selected).join(",")}`
  const [revealed, setRevealed] = useState<string>()
  const [pickedHere, setPickedHere] = useState<string>()

  if (revealed !== selectionKey) {
    setRevealed(selectionKey)
    setPickedHere(undefined)
    const entry = selected.design ? store.getEntry(selected.design) : undefined

    if (entry) {
      const ids = revealIds(entry, selectedNodes(selected), store.getComponentLibrary())
      const next = revealRows(expansion, ids, pickedHere === selectionKey)

      if (next !== expansion) {
        setExpansion(next)
      }
    }
  }

  // The app's routes come first, then the screens designed for it, then the project's own components on their boards, then
  // frames (PAR-1076).
  const groups = useMemo((): Group[] => {
    const routes = entries.filter((entry) => entry.path === routePagesFile)

    const stories = entries.filter((entry) => entry.path === storyScreensFile)

    const screens = entries.filter(
      (entry) =>
        entry.path !== routePagesFile &&
        entry.path !== storyScreensFile &&
        (!entry.container.kind || entry.container.kind === "screen")
    )

    const components = entries.filter((entry) => entry.path === componentBoardsFile)
    const frames = entries.filter((entry) => entry.container.kind === "frame" && entry.path !== componentBoardsFile)
    const listed: Group[] = []

    // Routes are listed once the app has some, as its router says.
    if (routes.length > 0) {
      listed.push({ id: "routes", title: "Routes", kind: "screen", none: "", entries: routes })
    }

    listed.push({
      id: "screens",
      title: "Screens",
      kind: "screen",
      command: "newScreen",
      none: "No screens yet.",
      entries: screens
    })

    // The project's stories are listed once it has some, read from its Storybook, so there's nothing to add.
    if (stories.length > 0) {
      listed.push({ id: "stories", title: "Stories", kind: "screen", none: "", entries: stories })
    }

    // The project's components are listed once it has some, drawn from its code, so there's nothing to add.
    if (components.length > 0) {
      listed.push({ id: "components", title: "Components", kind: "component", none: "", entries: components })
    }

    // Frames are listed once there are some; the frame tool draws them on the canvas.
    if (frames.length > 0) {
      listed.push({ id: "frames", title: "Frames", kind: "frame", command: "frame", none: "", entries: frames })
    }

    return listed
  }, [entries])

  const { rows, lines } = useMemo(() => {
    const library = store.getComponentLibrary()

    const label = (entry: ContainerEntry, node?: DesignNode) =>
      node ? layerLabel(node, entries, library, session.info.libraries) : entry.container.name

    const all: Row[] = []
    const list: Line[] = []

    for (const group of groups) {
      const found = search
        ? searchRows(group.entries, search, label, library, boardOpensTo)
        : treeRows(group.entries, expanded, library, boardOpensTo)

      if (search && found.length === 0) {
        continue
      }

      list.push({ type: "heading", key: `heading:${group.id}`, group })

      if (group.entries.length === 0) {
        list.push({ type: "empty", key: `empty:${group.id}`, group })
      }

      for (const row of found) {
        list.push({ type: "row", key: row.id, row })
      }

      list.push({ type: "gap", key: `gap:${group.id}` })
      all.push(...found)
    }

    if (search && all.length === 0) {
      list.push({ type: "none", key: "none" })
    }

    return { rows: all, lines: list }
  }, [groups, expanded, search, entries, store, session.info.libraries])

  const lineIndex = useMemo(() => new Map(lines.map((line, index) => [line.key, index])), [lines])

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => lineHeights[lines[index]!.type],
    getItemKey: (index) => lines[index]!.key,
    paddingStart: 8,
    // Ten rows either side, so a row just out of view is there to drag onto or to scroll to.
    overscan: 10,
    // The panel's size before it's measured, so its first frame already draws the rows in view.
    initialRect: { width: 256, height: 900 }
  })

  const scrollToRow = (id: string) => {
    const index = lineIndex.get(id)

    if (index !== undefined) {
      virtualizer.scrollToIndex(index, { align: "auto" })
    }
  }

  const toggle = (id: string, open?: boolean) => setExpansion((current) => toggleRow(current, id, open))

  // Alt+click on an arrow opens or closes the row with everything inside it, as Finder does.
  const toggleBranch = (row: Row) =>
    setExpansion((current) => toggleRows(current, branchIds(row, store.getComponentLibrary()), !row.expanded))

  /**
   * A click selects the row. Ctrl or Cmd adds it to the selection or takes it out; Shift selects every row between it
   * and the last one picked, among the same design's layers or among designs.
   */
  const select = (row: Row, event?: MouseEvent | KeyboardEvent) => {
    pick(row, event)
    // Selected here, the rows opened for the last selection stay open, so none moves under the pointer.
    setPickedHere(`${selection.get().design ?? ""}/${selectedNodes(selection.get()).join(",")}`)
  }

  const pick = (row: Row, event?: MouseEvent | KeyboardEvent) => {
    const toggle = !!event && (event.ctrlKey || event.metaKey)
    const range = !!event && event.shiftKey
    const layer = row.path !== undefined && row.path !== row.design.container.root.id ? row.path : undefined

    if ((toggle || range) && layer && selected.design === row.design.key && selected.node) {
      const ids = selectedNodes(selected)

      if (toggle) {
        const next = ids.includes(layer) ? ids.filter((id) => id !== layer) : [...ids, layer]
        selection.set(layersSelection(row.design.key, next, selected))
      } else {
        const from = rows.findIndex((candidate) => candidate.id === layerRowId(row.design.key, selected.node!))
        const to = rows.indexOf(row)

        const between = rows
          .slice(Math.min(from, to), Math.max(from, to) + 1)
          .filter((candidate) => candidate.design === row.design && candidate.path && candidate.depth > 1)
          .map((candidate) => candidate.path!)

        selection.set(layersSelection(row.design.key, [...between.filter((id) => id !== layer), layer], selected))
      }

      return
    }

    if ((toggle || range) && !row.node && selectedDesigns(selected).length > 0) {
      const keys = selectedDesigns(selected)
      const key = row.design.key

      if (toggle) {
        selection.set(designsSelection(keys.includes(key) ? keys.filter((other) => other !== key) : [...keys, key]))
      } else {
        const designRows = rows.filter((candidate) => candidate.depth === 0)
        const from = designRows.findIndex((candidate) => candidate.design.key === selected.design)
        const to = designRows.indexOf(row)

        const between = designRows
          .slice(Math.min(from, to), Math.max(from, to) + 1)
          .map((candidate) => candidate.design.key)

        selection.set(designsSelection([...between.filter((other) => other !== key), key]))
      }

      return
    }

    selection.set(row.path ? { design: row.design.key, node: row.path } : { design: row.design.key })
    revealSelection(session)
  }

  let selectedRow: string | undefined

  if (selected.design) {
    selectedRow = selected.node ? layerRowId(selected.design, selected.node) : selected.design
  }

  const selectedRows = new Set([
    ...(selected.design ? selectedNodes(selected).map((id) => layerRowId(selected.design!, id)) : []),
    ...selectedDesigns(selected)
  ])

  // Something selected elsewhere, on the canvas or by an agent, scrolls into view here if it's out of sight. Selecting
  // in the tree itself leaves the scroll alone. Runs once the reveal above has opened the row's ancestors.
  useEffect(() => {
    if (!selectedRow || treeRef.current?.contains(document.activeElement)) {
      return
    }

    scrollToRow(selectedRow)
    // Only a new selection, or rows opening or closing, can take it out of view.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow, expanded])

  // Dragging layers: where they'd land shows as a line between rows, or a ring around a layout to drop into. A design
  // dragged among the designs of its group goes before or after another in its file, the order the tree lists them in.
  const [dropAt, setDropAt] = useState<{ row: string; position: DropPosition }>()
  const [draggedDesign, setDraggedDesign] = useState<Row>()

  const dragStart = (row: Row, event: DragEvent) => {
    if (!row.node && !search) {
      setDraggedDesign(row)
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData(designMime, row.design.key)

      return
    }

    if (!row.node || row.depth < 2 || row.within.length > 0) {
      event.preventDefault()

      return
    }

    // The selection stays put while a row is dragged, so the inspector keeps what it shows, as an instance's slot to
    // drop it on (PAR-1046); a drop in Layers selects what moved.
    const inSelection = selected.design === row.design.key && selectedNodes(selected).includes(row.node.id)
    const ids = inSelection ? selectedNodes(selected) : [row.node.id]

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(layersMime, JSON.stringify({ design: row.design.key, ids }))
  }

  const dropPosition = (row: Row, event: DragEvent): DropPosition | undefined => {
    const rect = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - rect.top) / rect.height

    if (event.dataTransfer.types.includes(designMime)) {
      const dragged = draggedDesign?.design
      const group = (entry: ContainerEntry) => entry.container.kind ?? "screen"

      if (row.node || !dragged || dragged === row.design || dragged.path !== row.design.path) {
        return undefined
      }

      if (group(dragged) !== group(row.design)) {
        return undefined
      }

      return y < 0.5 ? "before" : "after"
    }

    if (!event.dataTransfer.types.includes(layersMime) || row.within.length > 0) {
      return undefined
    }

    const container = !row.node || row.node.type === "layout"

    if (row.depth <= 1) {
      return container ? "inside" : undefined
    }

    if (container && y > 0.25 && y < 0.75) {
      return "inside"
    }

    return y < 0.5 ? "before" : "after"
  }

  const dropTargetFor = (row: Row, position: DropPosition): MoveTarget | undefined => {
    const { root } = row.design.container

    if (position === "inside") {
      const parent = row.node ?? root

      if (parent.type !== "layout") {
        return undefined
      }

      return { design: row.design.key, parent: parent.id, index: parent.children.length }
    }

    const location = row.node ? locateNode(root, row.node.id) : undefined
    const parent = location?.ancestors.at(-1)

    if (!location || !parent) {
      return undefined
    }

    const target: MoveTarget = {
      design: row.design.key,
      parent: parent.id,
      index: location.index + (position === "after" ? 1 : 0)
    }

    if (location.slot) {
      target.slot = location.slot
    }

    return target
  }

  const drop = (row: Row, event: DragEvent) => {
    const position = dropPosition(row, event)
    setDropAt(undefined)

    if (!position) {
      return
    }

    event.preventDefault()

    if (event.dataTransfer.types.includes(designMime)) {
      if (draggedDesign && position !== "inside") {
        store.reorderContainer(draggedDesign.design.key, row.design.key, position)
      }

      setDraggedDesign(undefined)

      return
    }

    const dragged = readLayersDrag(event.dataTransfer.getData(layersMime))

    if (!dragged) {
      return
    }

    const { design, ids } = dragged
    const source = store.getEntry(design)
    const target = dropTargetFor(row, position)

    if (source && target) {
      moveLayers(session, source, ids, target)
    }
  }

  // Hovering a design's row outlines its board on the canvas, as hovering the board itself does (`CanvasEditor.tsx`).
  const hoverRow = (row: Row, on: boolean) =>
    selection.setHover(on ? { design: row.design.key, node: row.path } : undefined)

  const onKeyDown = (event: KeyboardEvent) => {
    // A heading's + and an empty group's row keep their keys, so Enter makes a new one rather than renaming.
    const from = event.target

    if (from instanceof Element && from.closest("button") && !from.closest("[role=treeitem]")) {
      return
    }

    const index = rows.findIndex((row) => row.id === selectedRow)
    const row = rows[index]

    if (!row) {
      return
    }

    const move = (target: Row | undefined) => {
      if (!target) {
        return
      }

      event.preventDefault()
      select(target)
      scrollToRow(target.id)
    }

    if (event.key === "ArrowDown") {
      move(rows[index + 1])
    } else if (event.key === "ArrowUp") {
      move(rows[index - 1])
    } else if (event.key === "ArrowRight") {
      event.preventDefault()

      // A search opens what it found and nothing else, so the arrows only move through it.
      if (row.hasChildren && !row.expanded && !search) {
        toggle(row.id, true)
      } else {
        move(rows[index + 1]?.depth === row.depth + 1 ? rows[index + 1] : undefined)
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()

      if (row.hasChildren && row.expanded && !search) {
        toggle(row.id, false)
      } else {
        move(rows.slice(0, index).findLast((candidate) => candidate.depth < row.depth))
      }
    } else if (event.key === "*") {
      // As in any tree, * opens the row and every row beside it, in its own group.
      event.preventDefault()
      const group = (candidate: Row) => candidate.design.container.kind ?? "screen"
      const among = rows.filter((candidate) => group(candidate) === group(row))

      if (!search) {
        setExpansion((current) => toggleRows(current, siblingIds(among, among.indexOf(row)), true))
      }
    } else if (event.key === "F2" || event.key === "Enter") {
      event.preventDefault()

      if (row.within.length === 0) {
        setRenaming(row.id)
      }
    }
  }

  // Each row is drawn again only when what it shows changes, so its handlers come from one object that never changes,
  // whose methods call this render's.
  const latest = useRef<RowActions>(null)
  useLayoutEffect(() => {
    latest.current = {
      dragStart,
      dragOver: (row, event) => {
        const position = dropPosition(row, event)

        if (!position) {
          return
        }

        event.preventDefault()
        event.dataTransfer.dropEffect = "move"

        if (dropAt?.row !== row.id || dropAt.position !== position) {
          setDropAt({ row: row.id, position })
        }
      },
      dragLeave: (row) => setDropAt((current) => (current?.row === row.id ? undefined : current)),
      drop,
      dragEnd: () => {
        setDropAt(undefined)
        setDraggedDesign(undefined)
      },
      toggle: (row, branch) => (branch ? toggleBranch(row) : toggle(row.id)),
      select,
      hover: hoverRow,
      // A layer inside an instance keeps its component's name.
      rename: (row) => row.within.length === 0 && setRenaming(row.id),
      renamed: (row, name) => {
        setRenaming(undefined)

        if (name !== undefined) {
          rename(session, row, name)
        }
      }
    }
  })

  const [rowActions] = useState((): RowActions => ({
    dragStart: (row, event) => latest.current?.dragStart(row, event),
    dragOver: (row, event) => latest.current?.dragOver(row, event),
    dragLeave: (row) => latest.current?.dragLeave(row),
    drop: (row, event) => latest.current?.drop(row, event),
    dragEnd: () => latest.current?.dragEnd(),
    toggle: (row, branch) => latest.current?.toggle(row, branch),
    select: (row, event) => latest.current?.select(row, event),
    hover: (row, on) => latest.current?.hover(row, on),
    rename: (row) => latest.current?.rename(row),
    renamed: (row, name) => latest.current?.renamed(row, name)
  }))

  const library = store.getComponentLibrary()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 pr-2">
        <div className="flex-1">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search layers"
            onKeyDown={(event) => {
              // Escape clears a search before it does anything else.
              if (event.key !== "Escape" || !query) {
                return
              }

              event.stopPropagation()
              setQuery("")
            }}
          />
        </div>
        <IconButton label="Collapse all" onClick={() => setExpansion(closedTree)} className="mt-2 size-8">
          <ChevronsDownUp />
        </IconButton>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div
          ref={treeRef}
          className="flex flex-col pb-2 text-sm"
          role="tree"
          aria-label="Layers"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const line = lines[item.index]!

              return (
                <div
                  key={item.key}
                  className="absolute top-0 left-0 w-full"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  {line.type === "heading" && <GroupHeading group={line.group} />}
                  {line.type === "empty" && <EmptyGroup group={line.group} />}
                  {line.type === "none" && (
                    <p className="flex h-7 items-center px-3 text-xs text-muted-foreground">
                      No layers or designs match &ldquo;{search}&rdquo;
                    </p>
                  )}
                  {line.type === "row" && (
                    <LayerRow
                      row={line.row}
                      label={
                        line.row.node
                          ? layerLabel(line.row.node, entries, library, session.info.libraries)
                          : line.row.design.container.name
                      }
                      searching={!!search}
                      selected={selectedRows.has(line.row.id)}
                      dropPosition={dropAt?.row === line.row.id ? dropAt.position : undefined}
                      hovered={hover?.design === line.row.design.key && hover.node === line.row.path}
                      renaming={renaming === line.row.id}
                      library={library}
                      handlers={rowActions}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {notes.length > 0 && !search && (
            <div className="mb-2">
              <GroupLabel as="div" className="px-3 py-1">
                Text on the canvas
              </GroupLabel>
              {notes.map((note) => (
                <button
                  key={note.key}
                  type="button"
                  onClick={() => {
                    selection.set({ note: note.key })
                    revealSelection(session)
                  }}
                  className={`flex h-7 w-full items-center gap-2 px-3 text-left hover:bg-accent/50 ${
                    selected.note === note.key ? "bg-accent" : ""
                  }`}
                >
                  <StickyNote className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{note.note.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The + for frames picks the frame tool, to draw one; the others make a design. */
function addDesign(session: Session, kind: ContainerKind): void {
  if (kind === "frame") {
    void actions.frame.run("panel", { session })
  } else {
    void actions[kind === "screen" ? "newScreen" : "newComponent"].run("panel", { session })
  }
}

/** A group's heading: its title, a group label, and a + that makes a new one. */
function GroupHeading({ group }: { group: Group }) {
  const session = useProject()

  return (
    // Positioned, so nothing in it is ever placed against the window, which made the page taller (PAR-424).
    <div className="relative flex h-7 items-center gap-1 pr-1.5 pl-3 text-xs text-muted-foreground">
      <GroupLabel className="flex-1">{group.title}</GroupLabel>
      {group.command && (
        <IconButton
          label={keymap[group.command].label}
          shortcut={group.command}
          onClick={() => addDesign(session, group.kind)}
          className="size-6"
        >
          <Plus />
        </IconButton>
      )}
    </div>
  )
}

/** An empty group's row, a button that makes its first design. */
function EmptyGroup({ group }: { group: Group }) {
  const session = useProject()

  if (!group.command) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => addDesign(session, group.kind)}
      className="group/empty mx-1.5 flex h-7 w-[calc(100%-0.75rem)] items-center gap-1 rounded-md px-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {group.none}{" "}
      <span
        className="font-medium underline-offset-2 group-hover/empty:underline"
        style={{ color: designColor(group.kind) }}
      >
        {keymap[group.command].label}
      </span>
    </button>
  )
}

/** What a row does, each given the row it's done to. */
interface RowActions {
  dragStart: (row: Row, event: DragEvent) => void
  dragOver: (row: Row, event: DragEvent) => void
  dragLeave: (row: Row) => void
  drop: (row: Row, event: DragEvent) => void
  dragEnd: () => void
  /** Opens or closes the row; with `branch`, everything inside it too. */
  toggle: (row: Row, branch?: boolean) => void
  select: (row: Row, event?: MouseEvent | KeyboardEvent) => void
  hover: (row: Row, on: boolean) => void
  rename: (row: Row) => void
  renamed: (row: Row, name: string | undefined) => void
}

interface LayerRowProps {
  row: Row
  /** Its name as Layers shows it. */
  label: string
  /** A search is showing, which opens what it found itself. */
  searching: boolean
  selected: boolean
  hovered: boolean
  renaming: boolean
  dropPosition?: DropPosition
  /** The project's components, which a layer inside an instance is drawn from. */
  library: ComponentLibrary
  /** The same object for every row on every render, so a row that shows the same draws nothing again. */
  handlers: RowActions
}

/** Whether a row would show the same as it did, since rows are listed afresh whenever the tree changes. */
function sameRow(before: LayerRowProps, after: LayerRowProps): boolean {
  const [a, b] = [before.row, after.row]

  return (
    a.id === b.id &&
    a.node === b.node &&
    a.design.container === b.design.container &&
    a.depth === b.depth &&
    a.expanded === b.expanded &&
    a.hasChildren === b.hasChildren &&
    a.position === b.position &&
    a.siblings === b.siblings &&
    before.label === after.label &&
    before.searching === after.searching &&
    before.selected === after.selected &&
    before.hovered === after.hovered &&
    before.renaming === after.renaming &&
    before.dropPosition === after.dropPosition &&
    (a.within.length === 0 || before.library === after.library)
  )
}

const LayerRow = memo(function LayerRow({
  row,
  label,
  searching,
  selected,
  hovered,
  renaming,
  dropPosition,
  library,
  handlers
}: LayerRowProps) {
  const session = useProject()
  const { container } = row.design
  const state = activeState(container)
  // Inside an instance a layer is its component's, and drawn in the component's color, as the instance is.
  const inside = row.within.length > 0
  // A component's board shows as the component it draws.
  const board = row.design.path === componentBoardsFile
  let color = designColor(board ? "component" : container.kind)

  if (row.node) {
    color = inside ? kindColors.component : nodeColor(row.node)
  }

  const changed = row.path && state.overrides?.[row.path]
  // A layer whose component fails to draw in one of the design's frames, which its board's badge counts. Inside an
  // instance the canvas names it by its path.
  const failing = useLayerFailure(session.id, row.design.key, row.path ?? "")
  const failure = row.node ? failing : undefined
  const viewports = row.node ? Object.keys(row.node.responsive ?? {}) : []
  // Whether the board hides it in the state it shows, as Hide and Show read it: inside an instance, as this copy shows
  // it there.
  let hidden = false

  if (row.node && inside) {
    hidden = layerOnBoard(container, row.path!, library, state)?.hidden ?? false
  } else if (row.node) {
    hidden = nodeOnBoard(container, row.node, state).hidden ?? false
  }

  // The page itself can't be hidden; any layer inside it can, from its eye, in the state its board shows.
  const hideable = !!row.node && row.depth > 1
  // Layers inside an instance only show or hide; the rest of them is the component's, and the instance locks them.
  const draggable = !renaming && (row.depth === 0 ? !searching : hideable && !inside)
  // A design locks from its own row and a layer from its own, as Hide does; the page is locked with its design.
  const lockable = row.depth === 0 || (hideable && !inside)
  const lock = row.path ? lockSource(container, row.path) : designLock(container)
  let background = "hover:bg-accent/40"

  if (selected) {
    background = "bg-accent text-accent-foreground"
  } else if (hovered) {
    background = "bg-accent/40"
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        // A right-click selects the row first, unless it's in the selection, as on the canvas.
        if (open) {
          session.selection.set(rowSelection(session.selection.get(), rowTarget(row)))
        }
      }}
    >
      <ContextMenuTrigger
        render={
          <div
            id={`layer-${row.id}`}
            role="treeitem"
            aria-selected={selected}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            aria-level={row.depth + 1}
            aria-posinset={row.position}
            aria-setsize={row.siblings}
            tabIndex={-1}
            draggable={draggable}
            onDragStart={(event) => handlers.dragStart(row, event)}
            onDragOver={(event) => handlers.dragOver(row, event)}
            onDragLeave={() => handlers.dragLeave(row)}
            onDrop={(event) => handlers.drop(row, event)}
            onDragEnd={() => handlers.dragEnd()}
            onClick={(event) => handlers.select(row, event)}
            onKeyDown={(event) => event.key === " " && handlers.select(row, event)}
            onDoubleClick={() => handlers.rename(row)}
            onPointerEnter={() => handlers.hover(row, true)}
            onPointerLeave={() => handlers.hover(row, false)}
            className={`group relative flex h-7 cursor-default items-center gap-1.5 pr-2 ${
              background
            } ${hidden ? "text-muted-foreground/60" : ""}`}
            style={{ paddingLeft: 8 + row.depth * 14 }}
          >
            {selected && <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: color }} />}
            {dropPosition === "inside" && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-sm border-2"
                style={{ borderColor: kindColors.layer }}
              />
            )}
            {(dropPosition === "before" || dropPosition === "after") && (
              <span
                aria-hidden
                className={`pointer-events-none absolute right-1 h-0.5 rounded-full ${
                  dropPosition === "before" ? "-top-px" : "-bottom-px"
                }`}
                style={{ left: 8 + row.depth * 14, background: row.node ? kindColors.layer : color }}
              />
            )}
            {Array.from({ length: row.depth }, (_, level) => (
              <span
                key={level}
                aria-hidden
                className="absolute inset-y-0 w-px bg-border/70"
                style={{ left: 15 + level * 14 }}
              />
            ))}
            <button
              type="button"
              tabIndex={-1}
              aria-label={row.expanded ? "Collapse" : "Expand"}
              onClick={(event) => {
                event.stopPropagation()
                handlers.toggle(row, event.altKey)
              }}
              className={`grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground hover:text-foreground ${
                row.hasChildren && !searching ? "" : "invisible"
              }`}
            >
              <ChevronRight className={`size-3.5 transition-transform ${row.expanded ? "rotate-90" : ""}`} />
            </button>
            {row.node ? (
              <NodeIcon node={row.node} className="size-3.5 shrink-0" style={{ color }} />
            ) : (
              <DesignIcon
                kind={board ? "component" : container.kind}
                route={row.design.path === routePagesFile}
                className="size-3.5 shrink-0"
                style={{ color }}
              />
            )}
            {renaming ? (
              <NameInput
                ref={focusOnMount}
                defaultValue={label}
                onClick={(event) => event.stopPropagation()}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => handlers.renamed(row, event.currentTarget.value.trim() || undefined)}
                onKeyDown={(event) => {
                  event.stopPropagation()

                  if (event.key !== "Enter" && event.key !== "Escape") {
                    return
                  }

                  // Done with the keys, the keys go back to the tree, on the row renamed.
                  const tree = event.currentTarget.closest<HTMLElement>("[role=tree]")

                  if (event.key === "Enter") {
                    event.currentTarget.blur()
                  } else {
                    handlers.renamed(row, undefined)
                  }

                  requestAnimationFrame(() => tree?.focus())
                }}
                className="h-5 min-w-0 flex-1 rounded-sm border-ring bg-background px-1 py-0 text-sm focus-visible:ring-0 dark:bg-background"
              />
            ) : (
              <Name className="min-w-0 flex-1">{label}</Name>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
              {failure && (
                <Hint label={`${failure.component} fails to draw`} detail="Click to show why in the console">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`${failure.component} fails to draw. Show why in the console`}
                    className="grid size-4 place-items-center rounded-sm hover:bg-accent"
                    onClick={(event) => {
                      event.stopPropagation()
                      showConsole(session, row.design.key)
                    }}
                  >
                    <OctagonAlert className="size-3 text-destructive" />
                  </button>
                </Hint>
              )}
              {/* A component's slot says which: children, or the prop that takes it. */}
              {row.node?.type === "layout" && row.node.slot !== undefined && container.kind === "component" && (
                <span className="font-mono text-2xs" style={{ color: kindColors.component }}>
                  {row.node.slot}
                </span>
              )}
              {changed && (
                <PenLine
                  className="size-3"
                  style={{ color: kindColors.component }}
                  aria-label={`Changed in ${state.name}`}
                />
              )}
              {viewports.length > 0 && (
                <Hint label="Changes at some screen sizes" wait>
                  <span className="flex">
                    <MonitorSmartphone className="size-3" aria-label="Changes at some screen sizes" />
                  </span>
                </Hint>
              )}
              {lock && lock.by !== "itself" && hovered && (
                <Hint label={`Locked with ${lock.by === "design" ? container.name : nodeLabel(lock.layer)}`}>
                  <span className="flex opacity-60">
                    <Lock className="size-3" aria-label="Locked" />
                  </span>
                </Hint>
              )}
              {lockable && (lock?.by === "itself" || (!lock && hovered)) && (
                <LockToggle
                  locked={lock?.by === "itself"}
                  onToggle={() => {
                    if (row.node) {
                      const id = row.node.id
                      const label = lock ? "Unlock layer" : "Lock layer"
                      session.store.updateContainer(row.design.key, label, (current) =>
                        toggleLockedLayers(current, [id])
                      )
                    } else {
                      const label = `${lock ? "Unlock" : "Lock"} ${kindName(container.kind)}`
                      session.store.updateContainer(row.design.key, label, (current) => setDesignLocked(current, !lock))
                    }
                  }}
                />
              )}
              {hideable && (hidden || hovered) && (
                <VisibilityToggle
                  hidden={hidden}
                  onToggle={() =>
                    session.store.updateContainer(row.design.key, "Toggle visibility", (current) => {
                      const stateId = activeState(current).id

                      if (!inside) {
                        return toggleHidden(current, stateId, [row.node!.id])
                      }

                      // Only this copy changes, in the state its board shows.
                      const change = { hidden: !hidden }

                      return editInner(current, boardTarget(current, stateId), row.path!, change, library)
                    })
                  }
                />
              )}
              {/* A design with one state says nothing; with more, how many, in words. */}
              {row.depth === 0 && container.states && container.states.length > 1 && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {container.states.length} states
                </span>
              )}
            </span>
          </div>
        }
      />
      <ContextMenuContent className="w-52" aria-label={label}>
        <RowMenuItems row={row} onRename={() => handlers.rename(row)} />
      </ContextMenuContent>
    </ContextMenu>
  )
}, sameRow)

/**
 * A layer's eye: it hides the layer in the state its board shows, or shows it again, without selecting it. A hidden
 * layer's eye is crossed out and always shows; a shown one's appears while the layer is hovered, here or on the canvas. The keyboard hides the
 * selection with Ctrl+Shift+H instead, so the eye stays out of the tab order, as the row's arrow does.
 */
function VisibilityToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const label = hidden ? "Show" : "Hide"

  return (
    <Hint label={label}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className="grid size-4 place-items-center rounded-sm hover:text-foreground"
      >
        {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </Hint>
  )
}

/** A design's own lock, read as `lockSource` reads a layer's. */
function designLock(container: Row["design"]["container"]): LockSource | undefined {
  return container.locked ? { by: "itself" } : undefined
}

/**
 * A layer's or design's lock (PAR-192): locked, it can't be selected or moved on the canvas, only here. Like the eye, a
 * locked one's always shows and an unlocked one's appears while the row is hovered, and it stays out of the tab order:
 * Ctrl+Shift+L locks the selection from the keyboard.
 */
function LockToggle({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  const label = locked ? "Unlock" : "Lock"

  return (
    <Hint label={label}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className="grid size-4 place-items-center rounded-sm hover:text-foreground"
      >
        {locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
      </button>
    </Hint>
  )
}

type Session = ReturnType<typeof useProject>

function rename(session: Session, row: Row, name: string): void {
  renameAndRecord(session.store, row.design.key, name, row.node?.id)
}

/** The row as the row menu reads it: its design, and its layer unless it's the design's own row. */
function rowTarget(row: Row): LayersRow {
  return row.path ? { design: row.design.key, node: row.path } : { design: row.design.key }
}

/**
 * A row's menu, for what the right-click selected (see `layersMenu`). Rename renames the row in place, as a
 * double-click does; the rest run the menubar's commands on the selection.
 */
function RowMenuItems({ row, onRename }: { row: Row; onRename: () => void }) {
  const session = useProject()
  const selection = useSelection(session.selection)
  // What the commands can do changes with the designs as well as the selection.
  useContainerEntries(session.store)

  return layersMenu(rowTarget(row), commandsFor(session), selection).map((entry, index) => {
    if (entry.kind === "separator") {
      return <ContextMenuSeparator key={`line-${index}`} />
    }

    if (entry.kind !== "item" || entry.action === "pasteHere") {
      return null
    }

    const { action } = entry
    const icon = iconFor(action)

    return (
      <ContextMenuItem
        key={action}
        disabled={!entry.enabled}
        variant={action === "delete" ? "destructive" : undefined}
        onClick={() =>
          void actions[action].run("layersMenu", action === "rename" ? { session, instead: onRename } : { session })
        }
      >
        {icon}
        {entry.label}
        {entry.keys && <ContextMenuShortcut>{entry.keys}</ContextMenuShortcut>}
      </ContextMenuItem>
    )
  })
}
