import { childNodes, type DesignNode, locateNode, nodeOnBoard } from "@parity-app/core"
import { ChevronRight, EyeOff, MonitorSmartphone, PenLine, Plus } from "lucide-react"
import { type KeyboardEvent, useMemo, useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon, designColor, kindColors, layerLabel, nodeColor, NodeIcon } from "../../canvas/kinds.tsx"
import { activeState } from "../../canvas/view.ts"
import { createDesign } from "../../chrome/create.ts"
import { Hint } from "../../chrome/Hint.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { type ContainerEntry, useContainerEntries } from "../../design-store.ts"
import { selectedNodes, type Selection, useHover, useSelection } from "../../selection.ts"

/*
 * The Layers tab once a screen and its root are one thing: each screen or component lists its root's children straight
 * under its own row, as Figma lists a frame's, with no "Page" row between. Its rows look as LayerTree's do; dragging,
 * renaming and the right-click menu are left out, since they don't change. The headings and empty rows follow the
 * approved start design (PAR-541 in decisions.md).
 */

interface Row {
  id: string
  depth: number
  entry: ContainerEntry
  node?: DesignNode
  hasChildren: boolean
}

function rowId(design: string, node?: string): string {
  return node ? `${design}/${node}` : design
}

/** The rows a selection highlights: the design's own row for the design or its root, else each selected layer's. */
function selectedRows(selected: Selection, root: string | undefined): Set<string> {
  if (!selected.design) return new Set()
  const nodes = selectedNodes(selected).filter((id) => id !== root)
  const design = selected.design
  if (nodes.length === 0) return new Set(selected.designs ?? [design])
  return new Set(nodes.map((id) => rowId(design, id)))
}

export function ContainerLayers() {
  const session = useProject()
  const { store, selection } = session
  const entries = useContainerEntries(store)
  const selected = useSelection(selection)
  const hover = useHover(selection)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  // A new selection opens its design and every layer around it, as LayerTree's does, without a row for the root.
  const [revealed, setRevealed] = useState<string>()
  const revealKey = `${selected.design ?? ""}/${selected.node ?? ""}`
  if (revealed !== revealKey) {
    setRevealed(revealKey)
    const entry = selected.design ? store.getEntry(selected.design) : undefined
    if (entry) {
      const ancestors = selected.node ? (locateNode(entry.container.root, selected.node)?.ancestors ?? []) : []
      const ids = [entry.key, ...ancestors.slice(1).map((ancestor) => rowId(entry.key, ancestor.id))]
      if (!ids.every((id) => expanded.has(id))) setExpanded(new Set([...expanded, ...ids]))
    }
  }

  const groups = useMemo(
    () => [
      {
        title: "Components",
        kind: "component" as const,
        entries: entries.filter((entry) => entry.container.kind === "component"),
        action: "New component",
        keys: "Ctrl Alt Shift N",
        none: "No components yet."
      },
      {
        title: "Screens",
        kind: "screen" as const,
        entries: entries.filter((entry) => entry.container.kind !== "component"),
        action: "New screen",
        keys: "Ctrl Alt N",
        none: "No screens yet."
      }
    ],
    [entries]
  )
  const rows = useMemo(() => {
    const list: Row[] = []
    for (const entry of groups.flatMap((group) => group.entries)) {
      const top = childNodes(entry.container.root)
      list.push({ id: entry.key, depth: 0, entry, hasChildren: top.length > 0 })
      if (!expanded.has(entry.key)) continue
      const visit = (node: DesignNode, depth: number) => {
        const id = rowId(entry.key, node.id)
        const children = childNodes(node)
        list.push({ id, depth, entry, node, hasChildren: children.length > 0 })
        if (expanded.has(id)) for (const child of children) visit(child, depth + 1)
      }
      for (const node of top) visit(node, 1)
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
  const select = (row: Row) =>
    selection.set(row.node ? { design: row.entry.key, node: row.node.id } : { design: row.entry.key })

  const highlighted = selectedRows(
    selected,
    selected.design ? store.getEntry(selected.design)?.container.root.id : undefined
  )
  const focused = rows.find((row) => highlighted.has(row.id))?.id

  const onKeyDown = (event: KeyboardEvent) => {
    const index = rows.findIndex((row) => row.id === focused)
    const row = rows[index]
    if (!row) return
    const move = (target: Row | undefined) => {
      if (!target) return
      event.preventDefault()
      select(target)
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
    }
  }

  return (
    <div className="flex flex-col py-2 text-[13px]" role="tree" aria-label="Layers" tabIndex={0} onKeyDown={onKeyDown}>
      {groups.map((group) => (
        <div key={group.title} className="mb-2">
          {/* The headings and empty rows as PAR-541 settled them: the + always shows, with its keys, and the count is
              left out at none, where the row says so. */}
          <div className="flex h-7 items-center gap-1 pr-1.5 pl-3 text-xs text-muted-foreground">
            <span className="flex-1">{group.title}</span>
            {group.entries.length > 0 && <span className="tabular-nums">{group.entries.length}</span>}
            <IconButton
              label={group.action}
              shortcut={group.keys}
              onClick={() => createDesign(session, group.kind)}
              className="size-6"
            >
              <Plus />
            </IconButton>
          </div>
          {group.entries.length === 0 && (
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
                {group.action}
              </span>
            </button>
          )}
          {rows
            .filter((row) => group.entries.includes(row.entry))
            .map((row) => (
              <LayerRow
                key={row.id}
                row={row}
                expanded={expanded.has(row.id)}
                selected={highlighted.has(row.id)}
                hovered={hover?.design === row.entry.key && hover.node === row.node?.id}
                onToggle={() => toggle(row.id)}
                onSelect={() => select(row)}
                onHover={(on) => selection.setHover(on ? { design: row.entry.key, node: row.node?.id } : undefined)}
              />
            ))}
        </div>
      ))}
    </div>
  )
}

function LayerRow({
  row,
  expanded,
  selected,
  hovered,
  onToggle,
  onSelect,
  onHover
}: {
  row: Row
  expanded: boolean
  selected: boolean
  hovered: boolean
  onToggle: () => void
  onSelect: () => void
  onHover: (on: boolean) => void
}) {
  const session = useProject()
  const entries = useContainerEntries(session.store)
  const { container } = row.entry
  const state = activeState(container)
  const color = row.node ? nodeColor(row.node) : designColor(container.kind)
  const label = row.node ? layerLabel(row.node, entries, session.store.getComponentLibrary()) : container.name
  // The root's own changes, in the state shown or on a viewport, mark the screen's row, since the root has no row.
  const own = row.node ?? container.root
  const changed = state.overrides?.[own.id]
  const viewports = Object.keys(own.responsive ?? {})
  const hidden = row.node ? (nodeOnBoard(container, row.node, state).hidden ?? false) : false
  let background = "hover:bg-accent/40"
  if (selected) background = "bg-accent text-accent-foreground"
  else if (hovered) background = "bg-accent/40"

  return (
    <div
      id={`layer-${row.id}`}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.hasChildren ? expanded : undefined}
      aria-level={row.depth + 1}
      tabIndex={-1}
      onClick={onSelect}
      onKeyDown={(event) => event.key === " " && onSelect()}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className={`group relative flex h-7 cursor-default items-center gap-1.5 pr-2 ${background} ${
        hidden ? "text-muted-foreground/60" : ""
      } ${row.depth === 0 ? "font-medium" : ""}`}
      style={{ paddingLeft: 8 + row.depth * 14 }}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: color }} />}
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
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
        {changed && (
          <PenLine className="size-3" style={{ color: kindColors.agent }} aria-label={`Changed in ${state.name}`} />
        )}
        {viewports.length > 0 && (
          <MonitorSmartphone className="size-3" aria-label={`Changes on ${viewports.join(", ")}`} />
        )}
        {hidden && <EyeOff className="size-3" aria-label="Hidden" />}
        {row.depth === 0 && (
          <Hint label={container.states.length === 1 ? "1 state" : `${container.states.length} states`} wait>
            <span className="text-xs tabular-nums opacity-70">{container.states.length}</span>
          </Hint>
        )}
      </span>
    </div>
  )
}
