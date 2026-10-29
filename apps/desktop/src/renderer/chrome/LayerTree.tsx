import {
  boardTarget,
  childNodes,
  deleteNode,
  type DesignNode,
  editNode,
  insertNode,
  locateNode,
  nodeIds,
  withFreshIds
} from "@parity/core"
import { ChevronRight, EyeOff, FileWarning, Plus, MonitorSmartphone, PenLine, StickyNote } from "lucide-react"
import { type DragEvent, type KeyboardEvent, type MouseEvent, useEffect, useMemo, useState } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor, focusOnMount, kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { moveLayers, type MoveTarget } from "../canvas/layer-drag.ts"
import { activeState } from "../canvas/view.ts"
import { type ContainerEntry, useContainerEntries, useNotes } from "../design-store.ts"
import {
  designsSelection,
  layersSelection,
  selectedDesigns,
  selectedNodes,
  useHover,
  useRenameRequest,
  useSelection
} from "../selection.ts"
import { createDesign } from "./create.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { renameLayer } from "./LayerPanel.tsx"
import { revealSelection } from "./reveal.ts"

interface Row {
  id: string
  depth: number
  design: ContainerEntry
  node?: DesignNode
  hasChildren: boolean
}

/** Where dragged layers would land relative to a row: just above it, just below it, or inside it. */
type DropPosition = "before" | "after" | "inside"

/** The drag data type for layers dragged in the Layers panel. */
const layersMime = "application/x-parity-layers"

/**
 * Every design in the project as a tree, Figma style: components, then screens, at the top level, their layers
 * nested inside. Selecting, hovering and renaming here act on the canvas too.
 */
export function LayerTree() {
  const session = useProject()
  const { store, selection, errors } = session
  const entries = useContainerEntries(store)
  const notes = useNotes(store)
  const selected = useSelection(selection)
  const hover = useHover(selection)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string>()

  // Edit > Rename on a layer renames it here; a design's own name is renamed on its title, on the canvas.
  const renameRequest = useRenameRequest(selection)
  const [renameHandled, setRenameHandled] = useState(() => selection.getRename()?.id)
  if (renameRequest && renameRequest.id !== renameHandled) {
    setRenameHandled(renameRequest.id)
    if (renameRequest.node) setRenaming(rowId(renameRequest.design, renameRequest.node))
  }

  // Revealing a new selection: its design and every ancestor of its node open up. Adjusted while rendering, since
  // it follows from the selection rather than from anything outside React.
  const [revealed, setRevealed] = useState<string>()
  const selectionKey = `${selected.design ?? ""}/${selected.node ?? ""}`
  if (revealed !== selectionKey) {
    setRevealed(selectionKey)
    const entry = selected.design ? store.getEntry(selected.design) : undefined
    if (entry) {
      const ids = [entry.key, rowId(entry.key, entry.container.root.id)]
      for (const ancestor of selected.node ? (locateNode(entry.container.root, selected.node)?.ancestors ?? []) : []) {
        ids.push(rowId(entry.key, ancestor.id))
      }
      if (!ids.every((id) => expanded.has(id))) setExpanded(new Set([...expanded, ...ids]))
    }
  }

  const groups = useMemo(() => {
    const components = entries.filter((entry) => entry.container.kind === "component")
    const screens = entries.filter((entry) => entry.container.kind !== "component")
    return [
      { title: "Components", kind: "component" as const, entries: components },
      { title: "Screens", kind: "screen" as const, entries: screens }
    ]
  }, [entries])
  const rows = useMemo(() => {
    const list: Row[] = []
    for (const entry of groups.flatMap((group) => group.entries)) {
      list.push({ id: entry.key, depth: 0, design: entry, hasChildren: true })
      if (!expanded.has(entry.key)) continue
      const visit = (node: DesignNode, depth: number) => {
        const id = rowId(entry.key, node.id)
        const children = childNodes(node)
        list.push({ id, depth, design: entry, node, hasChildren: children.length > 0 })
        if (expanded.has(id)) for (const child of children) visit(child, depth + 1)
      }
      visit(entry.container.root, 1)
    }
    return list
  }, [groups, expanded])

  const toggle = (id: string, open?: boolean) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (open ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })

  /**
   * A click selects the row. Ctrl or Cmd adds it to the selection or takes it out; Shift selects every row between it
   * and the last one picked, among the same design's layers or among designs.
   */
  const select = (row: Row, event?: MouseEvent | KeyboardEvent) => {
    const toggle = !!event && (event.ctrlKey || event.metaKey)
    const range = !!event && event.shiftKey
    const layer = row.node && row.node.id !== row.design.container.root.id ? row.node : undefined
    if ((toggle || range) && layer && selected.design === row.design.key && selected.node) {
      const ids = selectedNodes(selected)
      if (toggle) {
        const next = ids.includes(layer.id) ? ids.filter((id) => id !== layer.id) : [...ids, layer.id]
        selection.set(layersSelection(row.design.key, next, selected))
      } else {
        const from = rows.findIndex((candidate) => candidate.id === rowId(row.design.key, selected.node!))
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

  const selectedRow = selected.design
    ? selected.node
      ? rowId(selected.design, selected.node)
      : selected.design
    : undefined
  const selectedRows = new Set([
    ...(selected.design ? selectedNodes(selected).map((id) => rowId(selected.design!, id)) : []),
    ...selectedDesigns(selected)
  ])

  // Something selected elsewhere, on the canvas or by an agent, scrolls into view here if it's out of sight. Selecting
  // in the tree itself leaves the scroll alone. Runs once the reveal above has opened the row's ancestors.
  useEffect(() => {
    if (!selectedRow) return
    const row = document.getElementById(`layer-${selectedRow}`)
    if (row && !row.closest("[role=tree]")?.contains(document.activeElement)) row.scrollIntoView({ block: "nearest" })
  }, [selectedRow, rows])

  // Dragging layers: where they'd land shows as a line between rows, or a ring around a layout to drop into.
  const [dropAt, setDropAt] = useState<{ row: string; position: DropPosition }>()
  const dragStart = (row: Row, event: DragEvent) => {
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
    if (!event.dataTransfer.types.includes(layersMime)) return undefined
    const rect = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - rect.top) / rect.height
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
    const { design, ids } = JSON.parse(event.dataTransfer.getData(layersMime)) as { design: string; ids: string[] }
    const source = store.getEntry(design)
    const target = dropTargetFor(row, position)
    if (source && target) moveLayers(session, source, ids, target)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const index = rows.findIndex((row) => row.id === selectedRow)
    const row = rows[index]
    if (!row) return
    const move = (target: Row | undefined) => {
      if (!target) return
      event.preventDefault()
      select(target)
      document.getElementById(`layer-${target.id}`)?.scrollIntoView({ block: "nearest" })
    }
    if (event.key === "ArrowDown") move(rows[index + 1])
    else if (event.key === "ArrowUp") move(rows[index - 1])
    else if (event.key === "ArrowRight") {
      event.preventDefault()
      if (row.hasChildren && !expanded.has(row.id)) toggle(row.id, true)
      else move(rows[index + 1]?.depth === row.depth + 1 ? rows[index + 1] : undefined)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      if (row.hasChildren && expanded.has(row.id)) toggle(row.id, false)
      else move(rows.slice(0, index).findLast((candidate) => candidate.depth < row.depth))
    } else if (event.key === "F2" || event.key === "Enter") {
      event.preventDefault()
      setRenaming(row.id)
    }
  }

  return (
    <div className="flex flex-col py-2 text-[13px]" role="tree" aria-label="Layers" tabIndex={0} onKeyDown={onKeyDown}>
      {groups.map((group) => (
        <div key={group.title} className="mb-2">
          <div className="group/heading flex h-7 items-center gap-1 pr-1.5 pl-3 text-xs text-muted-foreground">
            <span className="flex-1">{group.title}</span>
            <span className="tabular-nums group-focus-within/heading:hidden group-hover/heading:hidden">
              {group.entries.length}
            </span>
            <IconButton
              label={group.kind === "component" ? "New component" : "New screen"}
              onClick={() => createDesign(session, group.kind)}
              className="sr-only size-6 group-hover/heading:not-sr-only focus-visible:not-sr-only"
            >
              <Plus />
            </IconButton>
          </div>
          {group.entries.length === 0 && (
            <p className="px-3 py-1 text-xs text-muted-foreground/70">
              {group.kind === "component" ? "No components yet." : "No screens yet."}
            </p>
          )}
          {rows
            .filter((row) => group.entries.includes(row.design))
            .map((row) => (
              <LayerRow
                key={row.id}
                row={row}
                expanded={expanded.has(row.id)}
                selected={selectedRows.has(row.id)}
                dropPosition={dropAt?.row === row.id ? dropAt.position : undefined}
                onDragStart={(event) => dragStart(row, event)}
                onDragOver={(event) => {
                  const position = dropPosition(row, event)
                  if (!position) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = "move"
                  if (dropAt?.row !== row.id || dropAt.position !== position) setDropAt({ row: row.id, position })
                }}
                onDragLeave={() => setDropAt((current) => (current?.row === row.id ? undefined : current))}
                onDrop={(event) => drop(row, event)}
                onDragEnd={() => setDropAt(undefined)}
                hovered={hover?.design === row.design.key && hover.node === row.node?.id}
                renaming={renaming === row.id}
                onToggle={() => toggle(row.id)}
                onSelect={(event) => select(row, event)}
                onHover={(on) => selection.setHover(on ? { design: row.design.key, node: row.node?.id } : undefined)}
                onRename={() => setRenaming(row.id)}
                onRenamed={(name) => {
                  setRenaming(undefined)
                  if (name !== undefined) rename(session, row, name)
                }}
              />
            ))}
        </div>
      ))}
      {notes.length > 0 && (
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
  )
}

interface LayerRowProps {
  row: Row
  expanded: boolean
  selected: boolean
  hovered: boolean
  renaming: boolean
  dropPosition?: DropPosition
  onDragStart(event: DragEvent): void
  onDragOver(event: DragEvent): void
  onDragLeave(): void
  onDrop(event: DragEvent): void
  onDragEnd(): void
  onToggle(): void
  onSelect(event?: MouseEvent | KeyboardEvent): void
  onHover(on: boolean): void
  onRename(): void
  onRenamed(name: string | undefined): void
}

function LayerRow({
  row,
  expanded,
  selected,
  hovered,
  renaming,
  dropPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onToggle,
  onSelect,
  onHover,
  onRename,
  onRenamed
}: LayerRowProps) {
  const session = useProject()
  const { container } = row.design
  const state = activeState(container)
  const color = row.node ? nodeColor(row.node) : designColor(container.kind)
  const entries = useContainerEntries(session.store)
  const label = row.node ? layerLabel(row.node, entries) : container.name
  const changed = row.node && state.overrides?.[row.node.id]
  const viewports = row.node ? Object.keys(row.node.responsive ?? {}) : []

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`layer-${row.id}`}
          role="treeitem"
          aria-selected={selected}
          aria-expanded={row.hasChildren ? expanded : undefined}
          aria-level={row.depth + 1}
          tabIndex={-1}
          draggable={!!row.node && row.depth > 1 && !renaming}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onClick={(event) => onSelect(event)}
          onKeyDown={(event) => event.key === " " && onSelect(event)}
          onDoubleClick={onRename}
          onPointerEnter={() => onHover(true)}
          onPointerLeave={() => onHover(false)}
          className={`group relative flex h-7 cursor-default items-center gap-1.5 pr-2 ${
            selected ? "bg-accent text-accent-foreground" : hovered ? "bg-accent/40" : "hover:bg-accent/40"
          } ${row.node?.hidden ? "text-muted-foreground/60" : ""} ${row.depth === 0 ? "font-medium" : ""}`}
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
              style={{ left: 8 + row.depth * 14, background: kindColors.layer }}
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
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            className={`grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground hover:text-foreground ${
              row.hasChildren ? "" : "invisible"
            }`}
          >
            <ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
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
              onBlur={(event) => onRenamed(event.currentTarget.value.trim() || undefined)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === "Enter") event.currentTarget.blur()
                if (event.key === "Escape") onRenamed(undefined)
              }}
              className="h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{label}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
            {changed && (
              <PenLine className="size-3" style={{ color: kindColors.agent }} aria-label={`Changed in ${state.name}`} />
            )}
            {viewports.length > 0 && (
              <MonitorSmartphone className="size-3" aria-label={`Changes on ${viewports.join(", ")}`} />
            )}
            {row.node?.hidden && <EyeOff className="size-3" aria-label="Hidden" />}
            {row.depth === 0 && (
              <Hint label={container.states.length === 1 ? "1 state" : `${container.states.length} states`} wait>
                <span className="text-xs tabular-nums opacity-70">{container.states.length}</span>
              </Hint>
            )}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onRename}>
          Rename <ContextMenuShortcut>{keymap.rename.keys[0]}</ContextMenuShortcut>
        </ContextMenuItem>
        {row.node && (
          <>
            <ContextMenuItem onSelect={() => toggleHidden(session, row)}>
              {row.node.hidden ? "Show" : "Hide"} in {state.name}
            </ContextMenuItem>
            {row.depth > 1 && <ContextMenuItem onSelect={() => duplicate(session, row)}>Duplicate</ContextMenuItem>}
          </>
        )}
        {(row.depth > 1 || !row.node) && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => remove(session, row)}>
              Delete <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function rowId(design: string, node: string): string {
  return `${design}/${node}`
}

type Session = ReturnType<typeof useProject>

function rename(session: Session, row: Row, name: string): void {
  if (!row.node) {
    session.store.updateContainer(row.design.key, "Rename design", (container) => ({ ...container, name }))
    return
  }
  const nodeId = row.node.id
  session.store.updateContainer(row.design.key, "Rename layer", (container) => renameLayer(container, nodeId, name))
}

function toggleHidden(session: Session, row: Row): void {
  if (!row.node) return
  const nodeId = row.node.id
  session.store.updateContainer(row.design.key, "Toggle visibility", (container) => {
    const state = activeState(container)
    const current = state.overrides?.[nodeId]?.hidden ?? row.node!.hidden ?? false
    return editNode(container, boardTarget(container, state.id), nodeId, { hidden: !current })
  })
}

export function duplicate(session: Session, row: { design: ContainerEntry; node?: DesignNode }): void {
  if (!row.node) return
  const nodeId = row.node.id
  let copyId: string | undefined
  session.store.updateContainer(row.design.key, "Duplicate layer", (container) => {
    const location = locateNode(container.root, nodeId)
    const parent = location?.ancestors.at(-1)
    if (!location || !parent) return container
    const copy = withFreshIds(location.node, nodeIds(container.root))
    copyId = copy.id
    return {
      ...container,
      root: insertNode(container.root, parent.id, copy, { index: location.index + 1, slot: location.slot })
    }
  })
  if (copyId) session.selection.set({ design: row.design.key, node: copyId })
}

export function remove(session: Session, row: { design: ContainerEntry; node?: DesignNode }): void {
  if (!row.node) {
    session.store.removeContainer(row.design.key)
    session.selection.set({})
    return
  }
  const nodeId = row.node.id
  const parent = locateNode(row.design.container.root, nodeId)?.ancestors.at(-1)
  if (!parent) return
  session.store.updateContainer(row.design.key, "Delete layer", (container) => deleteNode(container, nodeId))
  session.selection.set({
    design: row.design.key,
    node: parent.id === row.design.container.root.id ? undefined : parent.id
  })
}
