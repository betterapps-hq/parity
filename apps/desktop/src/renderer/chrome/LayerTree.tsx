import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut
} from "@buildkitgg/shadcn-baseui-kit"
import { boardTarget, type DesignNode, editTargetName, locateNode, nodeOnBoard, toggleHidden } from "@parity-app/core"
import {
  activeState,
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
  toggleRow,
  type TreeRow,
  treeRows
} from "@parity-app/editor"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ChevronRight,
  ChevronsDownUp,
  Eye,
  EyeOff,
  FileWarning,
  Plus,
  MonitorSmartphone,
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
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor, focusOnMount, kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { moveLayers, type MoveTarget } from "../canvas/layer-drag.ts"
import { type ContainerEntry, useContainerEntries, useNotes } from "../design-store.ts"
import { useHover, useRenameRequest, useSelection } from "../selection.ts"
import { actions } from "./actions.ts"
import { SearchField } from "./AssetsPanel.tsx"
import { createDesign } from "./create.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"
import { renameLayer } from "./LayerPanel.tsx"
import { type LayersRow, layersMenu, rowSelection } from "./layers-menu.ts"
import { revealSelection } from "./reveal.ts"

type Row = TreeRow<ContainerEntry>

/** Where dragged layers or designs would land relative to a row: just above it, just below it, or inside it. */
type DropPosition = "before" | "after" | "inside"

/** The drag data types for layers and designs dragged in the Layers panel. */
const layersMime = "application/x-parity-layers"
const designMime = "application/x-parity-design"

interface Group {
  title: string
  kind: "component" | "screen"
  command: "newComponent" | "newScreen"
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
 * nested inside. Selecting, hovering and renaming here act on the canvas too. Each group's heading has its count and a
 * + that makes a new one, always showing, with its keys in the tooltip; an empty group's row is a button that makes
 * the first one (PAR-546). A search above the tree finds layers and designs by name, and Collapse all closes every
 * row. Only the rows in view are drawn (PAR-187).
 */
export function LayerTree() {
  const session = useProject()
  const { store, selection, errors } = session
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
    if (renameRequest.node) setRenaming(layerRowId(renameRequest.design, renameRequest.node))
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
      const next = revealRows(expansion, revealIds(entry, selectedNodes(selected)), pickedHere === selectionKey)
      if (next !== expansion) setExpansion(next)
    }
  }

  const groups = useMemo((): Group[] => {
    const components = entries.filter((entry) => entry.container.kind === "component")
    const screens = entries.filter((entry) => entry.container.kind !== "component")
    return [
      {
        title: "Components",
        kind: "component",
        command: "newComponent",
        none: "No components yet.",
        entries: components
      },
      { title: "Screens", kind: "screen", command: "newScreen", none: "No screens yet.", entries: screens }
    ]
  }, [entries])
  const { rows, lines } = useMemo(() => {
    const library = store.getComponentLibrary()
    const label = (entry: ContainerEntry, node?: DesignNode) =>
      node ? layerLabel(node, entries, library) : entry.container.name
    const all: Row[] = []
    const list: Line[] = []
    for (const group of groups) {
      const found = search ? searchRows(group.entries, search, label) : treeRows(group.entries, expanded)
      if (search && found.length === 0) continue
      list.push({ type: "heading", key: `heading:${group.kind}`, group })
      if (group.entries.length === 0) list.push({ type: "empty", key: `empty:${group.kind}`, group })
      for (const row of found) list.push({ type: "row", key: row.id, row })
      list.push({ type: "gap", key: `gap:${group.kind}` })
      all.push(...found)
    }
    if (search && all.length === 0) list.push({ type: "none", key: "none" })
    return { rows: all, lines: list }
  }, [groups, expanded, search, entries, store])
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
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: "auto" })
  }

  const toggle = (id: string, open?: boolean) => setExpansion((current) => toggleRow(current, id, open))

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
    const layer = row.node && row.node.id !== row.design.container.root.id ? row.node : undefined
    if ((toggle || range) && layer && selected.design === row.design.key && selected.node) {
      const ids = selectedNodes(selected)
      if (toggle) {
        const next = ids.includes(layer.id) ? ids.filter((id) => id !== layer.id) : [...ids, layer.id]
        selection.set(layersSelection(row.design.key, next, selected))
      } else {
        const from = rows.findIndex((candidate) => candidate.id === layerRowId(row.design.key, selected.node!))
        const to = rows.indexOf(row)
        const between = rows
          .slice(Math.min(from, to), Math.max(from, to) + 1)
          .filter((candidate) => candidate.design === row.design && candidate.node && candidate.depth > 1)
          .map((candidate) => candidate.node!.id)
        selection.set(layersSelection(row.design.key, [...between.filter((id) => id !== layer.id), layer.id], selected))
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
    selection.set(row.node ? { design: row.design.key, node: row.node.id } : { design: row.design.key })
    revealSelection(session)
  }

  let selectedRow: string | undefined
  if (selected.design) selectedRow = selected.node ? layerRowId(selected.design, selected.node) : selected.design
  const selectedRows = new Set([
    ...(selected.design ? selectedNodes(selected).map((id) => layerRowId(selected.design!, id)) : []),
    ...selectedDesigns(selected)
  ])

  // Something selected elsewhere, on the canvas or by an agent, scrolls into view here if it's out of sight. Selecting
  // in the tree itself leaves the scroll alone. Runs once the reveal above has opened the row's ancestors.
  useEffect(() => {
    if (!selectedRow || treeRef.current?.contains(document.activeElement)) return
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
    if (!row.node || row.depth < 2) {
      event.preventDefault()
      return
    }
    const inSelection = selected.design === row.design.key && selectedNodes(selected).includes(row.node.id)
    const ids = inSelection ? selectedNodes(selected) : [row.node.id]
    if (!inSelection) selection.set({ design: row.design.key, node: row.node.id })
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(layersMime, JSON.stringify({ design: row.design.key, ids }))
  }
  const dropPosition = (row: Row, event: DragEvent): DropPosition | undefined => {
    const rect = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - rect.top) / rect.height
    if (event.dataTransfer.types.includes(designMime)) {
      const dragged = draggedDesign?.design
      const component = (entry: ContainerEntry) => entry.container.kind === "component"
      if (row.node || !dragged || dragged === row.design || dragged.path !== row.design.path) return undefined
      if (component(dragged) !== component(row.design)) return undefined
      return y < 0.5 ? "before" : "after"
    }
    if (!event.dataTransfer.types.includes(layersMime)) return undefined
    const container = !row.node || row.node.type === "layout"
    if (row.depth <= 1) return container ? "inside" : undefined
    if (container && y > 0.25 && y < 0.75) return "inside"
    return y < 0.5 ? "before" : "after"
  }
  const dropTargetFor = (row: Row, position: DropPosition): MoveTarget | undefined => {
    const { root } = row.design.container
    if (position === "inside") {
      const parent = row.node ?? root
      if (parent.type !== "layout") return undefined
      return { design: row.design.key, parent: parent.id, index: parent.children.length }
    }
    const location = row.node ? locateNode(root, row.node.id) : undefined
    const parent = location?.ancestors.at(-1)
    if (!location || !parent) return undefined
    return {
      design: row.design.key,
      parent: parent.id,
      index: location.index + (position === "after" ? 1 : 0),
      ...(location.slot ? { slot: location.slot } : {})
    }
  }
  const drop = (row: Row, event: DragEvent) => {
    const position = dropPosition(row, event)
    setDropAt(undefined)
    if (!position) return
    event.preventDefault()
    if (event.dataTransfer.types.includes(designMime)) {
      if (draggedDesign && position !== "inside")
        store.reorderContainer(draggedDesign.design.key, row.design.key, position)
      setDraggedDesign(undefined)
      return
    }
    const dragged = readLayersDrag(event.dataTransfer.getData(layersMime))
    if (!dragged) return
    const { design, ids } = dragged
    const source = store.getEntry(design)
    const target = dropTargetFor(row, position)
    if (source && target) moveLayers(session, source, ids, target)
  }

  // Hovering a design's row outlines its board on the canvas, as hovering the board itself does (`CanvasEditor.tsx`).
  const hoverRow = (row: Row, on: boolean) =>
    selection.setHover(on ? { design: row.design.key, node: row.node?.id } : undefined)

  const onKeyDown = (event: KeyboardEvent) => {
    // A heading's + and an empty group's row keep their keys, so Enter makes a new one rather than renaming.
    const from = event.target
    if (from instanceof Element && from.closest("button") && !from.closest("[role=treeitem]")) return
    const index = rows.findIndex((row) => row.id === selectedRow)
    const row = rows[index]
    if (!row) return
    const move = (target: Row | undefined) => {
      if (!target) return
      event.preventDefault()
      select(target)
      scrollToRow(target.id)
    }
    if (event.key === "ArrowDown") move(rows[index + 1])
    else if (event.key === "ArrowUp") move(rows[index - 1])
    else if (event.key === "ArrowRight") {
      event.preventDefault()
      // A search opens what it found and nothing else, so the arrows only move through it.
      if (row.hasChildren && !row.expanded && !search) toggle(row.id, true)
      else move(rows[index + 1]?.depth === row.depth + 1 ? rows[index + 1] : undefined)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      if (row.hasChildren && row.expanded && !search) toggle(row.id, false)
      else move(rows.slice(0, index).findLast((candidate) => candidate.depth < row.depth))
    } else if (event.key === "F2" || event.key === "Enter") {
      event.preventDefault()
      setRenaming(row.id)
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
        if (!position) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        if (dropAt?.row !== row.id || dropAt.position !== position) setDropAt({ row: row.id, position })
      },
      dragLeave: (row) => setDropAt((current) => (current?.row === row.id ? undefined : current)),
      drop,
      dragEnd: () => {
        setDropAt(undefined)
        setDraggedDesign(undefined)
      },
      toggle: (row) => toggle(row.id),
      select,
      hover: hoverRow,
      rename: (row) => setRenaming(row.id),
      renamed: (row, name) => {
        setRenaming(undefined)
        if (name !== undefined) rename(session, row, name)
      }
    }
  })
  const [rowActions] = useState((): RowActions => ({
    dragStart: (row, event) => latest.current?.dragStart(row, event),
    dragOver: (row, event) => latest.current?.dragOver(row, event),
    dragLeave: (row) => latest.current?.dragLeave(row),
    drop: (row, event) => latest.current?.drop(row, event),
    dragEnd: () => latest.current?.dragEnd(),
    toggle: (row) => latest.current?.toggle(row),
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
              if (event.key !== "Escape" || !query) return
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
          className="flex flex-col pb-2 text-[13px]"
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
                        line.row.node ? layerLabel(line.row.node, entries, library) : line.row.design.container.name
                      }
                      searching={!!search}
                      selected={selectedRows.has(line.row.id)}
                      dropPosition={dropAt?.row === line.row.id ? dropAt.position : undefined}
                      hovered={hover?.design === line.row.design.key && hover.node === line.row.node?.id}
                      renaming={renaming === line.row.id}
                      handlers={rowActions}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {notes.length > 0 && !search && (
            <div className="mb-2">
              <div className="px-3 py-1 text-xs text-muted-foreground">Text on the canvas</div>
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
          {errors.map((error) => (
            <div
              key={error.path}
              className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs"
            >
              <div className="mb-1 flex items-center gap-1.5 font-medium text-destructive">
                <FileWarning className="size-3.5" />
                {error.path}
              </div>
              <code className="break-words text-muted-foreground">{error.error}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A group's heading: its title, how many it has, and a + that makes a new one. */
function GroupHeading({ group }: { group: Group }) {
  const session = useProject()
  return (
    // Positioned, so nothing in it is ever placed against the window, which made the page taller (PAR-424).
    <div className="relative flex h-7 items-center gap-1 pr-1.5 pl-3 text-xs text-muted-foreground">
      <span className="flex-1">{group.title}</span>
      {/* At none, the empty row says so. */}
      {group.entries.length > 0 && <span className="tabular-nums">{group.entries.length}</span>}
      <IconButton
        label={keymap[group.command].label}
        shortcut={keymap[group.command].keys[0]}
        onClick={() => createDesign(session, group.kind)}
        className="size-6"
      >
        <Plus />
      </IconButton>
    </div>
  )
}

/** An empty group's row, a button that makes its first design. */
function EmptyGroup({ group }: { group: Group }) {
  const session = useProject()
  return (
    <button
      type="button"
      onClick={() => createDesign(session, group.kind)}
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
  toggle: (row: Row) => void
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
    before.dropPosition === after.dropPosition
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
  handlers
}: LayerRowProps) {
  const session = useProject()
  const { container } = row.design
  const state = activeState(container)
  const color = row.node ? nodeColor(row.node) : designColor(container.kind)
  const changed = row.node && state.overrides?.[row.node.id]
  const viewports = row.node ? Object.keys(row.node.responsive ?? {}) : []
  // Whether the board hides it in the state it shows, as Hide and Show read it.
  const hidden = row.node ? (nodeOnBoard(container, row.node, state).hidden ?? false) : false
  // The page itself can't be hidden; any layer inside it can, from its eye, in the state its board shows.
  const hideable = !!row.node && row.depth > 1
  const draggable = !renaming && (row.depth === 0 ? !searching : hideable)
  let background = "hover:bg-accent/40"
  if (selected) background = "bg-accent text-accent-foreground"
  else if (hovered) background = "bg-accent/40"

  return (
    <ContextMenu
      onOpenChange={(open) => {
        // A right-click selects the row first, unless it's in the selection, as on the canvas.
        if (open) session.selection.set(rowSelection(session.selection.get(), rowTarget(row)))
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
            } ${hidden ? "text-muted-foreground/60" : ""} ${row.depth === 0 ? "font-medium" : ""}`}
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
                handlers.toggle(row)
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
              <DesignIcon kind={container.kind} className="size-3.5 shrink-0" style={{ color }} />
            )}
            {renaming ? (
              <input
                ref={focusOnMount}
                defaultValue={label}
                onClick={(event) => event.stopPropagation()}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => handlers.renamed(row, event.currentTarget.value.trim() || undefined)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key !== "Enter" && event.key !== "Escape") return
                  // Done with the keys, the keys go back to the tree, on the row renamed.
                  const tree = event.currentTarget.closest<HTMLElement>("[role=tree]")
                  if (event.key === "Enter") event.currentTarget.blur()
                  else handlers.renamed(row, undefined)
                  requestAnimationFrame(() => tree?.focus())
                }}
                className="h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{label}</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
              {changed && (
                <PenLine
                  className="size-3"
                  style={{ color: kindColors.agent }}
                  aria-label={`Changed in ${state.name}`}
                />
              )}
              {viewports.length > 0 && (
                <MonitorSmartphone className="size-3" aria-label={`Changes on ${viewports.join(", ")}`} />
              )}
              {hideable && (hidden || hovered) && (
                <VisibilityToggle
                  hidden={hidden}
                  where={editTargetName(container, boardTarget(container, state.id))}
                  onToggle={() =>
                    session.store.updateContainer(row.design.key, "Toggle visibility", (current) =>
                      toggleHidden(current, activeState(current).id, [row.node!.id])
                    )
                  }
                />
              )}
              {row.depth === 0 && (
                <Hint label={container.states.length === 1 ? "1 state" : `${container.states.length} states`} wait>
                  <span className="text-xs tabular-nums opacity-70">{container.states.length}</span>
                </Hint>
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
function VisibilityToggle({ hidden, where, onToggle }: { hidden: boolean; where: string; onToggle: () => void }) {
  const label = `${hidden ? "Show" : "Hide"} in ${where}`
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

type Session = ReturnType<typeof useProject>

function rename(session: Session, row: Row, name: string): void {
  if (!row.node) {
    session.store.updateContainer(row.design.key, `Rename ${kindName(row.design.container.kind)}`, (container) => ({
      ...container,
      name
    }))
    return
  }
  const nodeId = row.node.id
  session.store.updateContainer(row.design.key, "Rename layer", (container) => renameLayer(container, nodeId, name))
}

/** The row as the row menu reads it: its design, and its layer unless it's the design's own row. */
function rowTarget(row: Row): LayersRow {
  return row.node ? { design: row.design.key, node: row.node.id } : { design: row.design.key }
}

/**
 * A row's menu, for what the right-click selected (see `layersMenu`). Rename renames the row in place, as a
 * double-click does; the rest run the menubar's commands on the selection.
 */
function RowMenuItems({ row, onRename }: { row: Row; onRename: () => void }) {
  const session = useProject()
  const selection = useSelection(session.selection)
  const entries = useContainerEntries(session.store)
  return layersMenu(rowTarget(row), selection, entries).map((entry, index) => {
    if (entry.kind === "separator") return <ContextMenuSeparator key={`line-${index}`} />
    if (entry.kind !== "item" || entry.action === "pasteHere") return null
    const { action } = entry
    return (
      <ContextMenuItem
        key={action}
        disabled={!entry.enabled}
        variant={action === "delete" ? "destructive" : undefined}
        onClick={() => (action === "rename" ? onRename() : void actions[action].run())}
      >
        {entry.label}
        {entry.keys && <ContextMenuShortcut>{formatKeys(entry.keys)}</ContextMenuShortcut>}
      </ContextMenuItem>
    )
  })
}
