import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn"
import {
  ChevronRight,
  ChevronsDownUp,
  Component,
  Diamond,
  Frame,
  ImagePlay,
  KeyRound,
  Layers,
  Link2,
  type LucideIcon,
  Palette,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Server,
  Smile,
  Table2,
  Type
} from "lucide-react"
import { type ComponentType, type KeyboardEvent, type ReactNode, useMemo, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { ComponentsPanel, IconsPanel, SearchField } from "../../chrome/AssetsPanel.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { keymap } from "../../chrome/keymap.ts"
import { Name } from "../../chrome/Name.tsx"
import { GroupLabel } from "../../chrome/PanelSection.tsx"
import { TokensPanel } from "../../chrome/TokensPanel.tsx"
import { MediaPanel } from "../../media/MediaPanel.tsx"
import { type Column, kindLooks, lenses, members, type Thing, things } from "./data.ts"
import type { LensId } from "./model.ts"

export interface PanelTab {
  value: string
  label: string
  icon: ComponentType<{ className?: string }>
}

/**
 * A side panel's frame, as the app's are (`SidePanel`): its tabs in one row along the top, the open one named and the
 * rest just their icons, and the button that hides the panel at the row's end.
 */
export function PanelFrame({
  side,
  label,
  tabs,
  tab,
  onTab,
  onHide,
  children
}: {
  side: "left" | "right"
  label: string
  tabs: PanelTab[]
  tab: string
  onTab: (tab: string) => void
  onHide: () => void
  children: ReactNode
}) {
  const current = tabs.some((each) => each.value === tab) ? tab : tabs[0]!.value
  const Close = side === "left" ? PanelLeftClose : PanelRightClose

  return (
    <aside
      className={`relative flex shrink-0 flex-col bg-background ${side === "left" ? "w-64 border-r" : "w-72 border-l"}`}
      aria-label={label}
    >
      <Tabs value={current} onValueChange={(value: string) => onTab(value)} className="min-h-0 flex-1 gap-0">
        <div
          className={`flex h-9 shrink-0 items-center gap-1 border-b px-2 ${side === "right" ? "flex-row-reverse" : ""}`}
        >
          <TabsList className="min-w-0 bg-transparent group-data-horizontal/tabs:h-7" aria-label={label}>
            {tabs.map(({ value, label: name, icon: Icon }) => {
              const trigger = (
                <TabsTrigger key={value} value={value} aria-label={name} className="flex-none">
                  <Icon />
                  {value === current && <span className="truncate">{name}</span>}
                </TabsTrigger>
              )

              return value === current ? (
                trigger
              ) : (
                <Tooltip key={value}>
                  <TooltipTrigger render={trigger} />
                  <TooltipContent>{name}</TooltipContent>
                </Tooltip>
              )
            })}
          </TabsList>
          <div className="flex-1" />
          <IconButton label={`Hide ${label.toLowerCase()}`} shortcut="panels" onClick={onHide}>
            <Close />
          </IconButton>
        </div>
        {children}
      </Tabs>
    </aside>
  )
}

/** The outline tab's icon, where it isn't Layers': Data lists tables, API its endpoints. */
const outlineIcons: Partial<Record<LensId, LucideIcon>> = { data: Table2, api: Server }

/** What goes into designs, as today's left panel has it, for a lens that holds designs. */
const assetTabs: PanelTab[] = [
  { value: "components", label: "Components", icon: Component },
  { value: "icons", label: "Icons", icon: Smile },
  { value: "media", label: "Media", icon: ImagePlay },
  { value: "tokens", label: "Tokens", icon: Palette }
]

/**
 * The left panel for the lens in the canvas in focus: first what the lens draws, as Layers lists designs today, then,
 * for a lens that holds designs, the tabs of what goes into them. Those are the app's own panels.
 */
export function LensPanel({
  lens,
  tab,
  onTab,
  onHide,
  selected,
  onSelect
}: {
  lens: LensId
  tab: string
  onTab: (tab: string) => void
  onHide: () => void
  selected: string | undefined
  onSelect: (id: string) => void
}) {
  const info = lenses[lens]

  const tabs: PanelTab[] = [
    { value: "outline", label: info.outline.label, icon: outlineIcons[lens] ?? Layers },
    ...(info.assets ? assetTabs : [])
  ]

  return (
    <PanelFrame side="left" label={`${info.label} panel`} tabs={tabs} tab={tab} onTab={onTab} onHide={onHide}>
      <TabsContent value="outline" className="flex min-h-0 flex-col">
        <LensOutline key={lens} lens={lens} selected={selected} onSelect={onSelect} />
      </TabsContent>
      {info.assets && (
        <>
          <TabsContent value="components" className="flex min-h-0 flex-col">
            <ComponentsPanel />
          </TabsContent>
          <TabsContent value="icons" className="flex min-h-0 flex-col">
            <IconsPanel />
          </TabsContent>
          <TabsContent value="media" className="flex min-h-0 flex-col">
            <MediaPanel />
          </TabsContent>
          <TabsContent value="tokens" className="flex min-h-0 flex-col">
            <TokensPanel />
          </TabsContent>
        </>
      )}
    </PanelFrame>
  )
}

/** The heading each lens lists its things under, as Layers' groups are titled today. */
const sectionTitles: Record<LensId, string> = {
  pages: "Routes",
  screens: "Screens",
  components: "Components",
  stories: "Storybook",
  data: "Drizzle",
  api: "OpenAPI"
}

/** A row of the tree: a thing, a layer of one, or a table's column. */
interface Row {
  key: string
  depth: number
  label: string
  icon: LucideIcon
  color: string
  /** The thing a click selects. */
  select: string
  /** Whether it's the thing itself rather than something in it. */
  own: boolean
  /** It holds rows, open or closed. */
  opens?: boolean
  open?: boolean
  /** At its right: a column's type. */
  end?: string
  /** Its parent's key, for Left. */
  parent?: string
}

const layerIcons: Record<"frame" | "text" | "instance", LucideIcon> = { frame: Frame, text: Type, instance: Diamond }

/** A column's icon in the tree: a key, a link to the table it refers to, or a plain field. */
function columnIcon(key: Column["key"]): LucideIcon {
  if (key === "primary") {
    return KeyRound
  }

  return key === "foreign" ? Link2 : Type
}

/** The rows under a thing: its members, layers or columns. */
function inside(lens: LensId, item: Thing): number {
  return members(lens, item.id).length + (item.layers?.length ?? 0) + (item.columns?.length ?? 0)
}

function rowsFor(lens: LensId, open: Set<string>, query: string): Row[] {
  const rows: Row[] = []
  const match = (text: string) => text.toLowerCase().includes(query.toLowerCase())

  // A search finds what the tree lists: a thing, or a member, layer or column anywhere in it.
  const holds = (item: Thing): boolean =>
    match(item.name) ||
    (item.layers ?? []).some((layer) => match(layer.name)) ||
    (item.columns ?? []).some((column) => match(column.name)) ||
    members(lens, item.id).some(holds)

  // A thing that matches by name shows everything in it; otherwise only what matches inside it shows.
  const add = (item: Thing, depth: number, parent?: string, matched = false) => {
    const look = kindLooks[item.kind]
    const opens = inside(lens, item) > 0
    const isOpen = query ? true : open.has(item.id)
    const children = members(lens, item.id)
    const whole = !query || matched || match(item.name)

    if (!whole && !holds(item)) {
      return
    }

    rows.push({
      key: item.id,
      depth,
      label: item.name,
      icon: look.icon,
      color: look.color,
      select: item.id,
      own: true,
      opens,
      open: isOpen,
      parent
    })

    if (!isOpen) {
      return
    }

    for (const child of children) {
      add(child, depth + 1, item.id, whole)
    }

    for (const [index, layer] of (item.layers ?? []).entries()) {
      if (!whole && !match(layer.name)) {
        continue
      }

      rows.push({
        key: `${item.id}/${index}`,
        depth: depth + 1,
        label: layer.name,
        icon: layerIcons[layer.kind],
        color: layer.kind === "instance" ? kindColors.component : kindColors.layer,
        select: item.id,
        own: false,
        parent: item.id
      })
    }

    for (const column of item.columns ?? []) {
      if (!whole && !match(column.name)) {
        continue
      }

      rows.push({
        key: `${item.id}.${column.name}`,
        depth: depth + 1,
        label: column.name,
        icon: columnIcon(column.key),
        color: column.key ? look.color : "var(--muted-foreground)",
        select: item.id,
        own: false,
        end: column.type,
        parent: item.id
      })
    }
  }

  for (const item of things[lens].filter((each) => !each.parent)) {
    add(item, 0)
  }

  return rows
}

/**
 * What a lens draws, as Layers lists designs: its search, then its things under the heading of where they're read from,
 * each opening on what's in it. The tree takes the arrow keys as Layers does.
 */
function LensOutline({
  lens,
  selected,
  onSelect
}: {
  lens: LensId
  selected: string | undefined
  onSelect: (id: string) => void
}) {
  const info = lenses[lens]
  const [query, setQuery] = useState("")

  // Groups start open, so a lens's pages and stories show at once; the rest open on what's in them.
  const [open, setOpen] = useState(
    () => new Set(things[lens].filter((each) => members(lens, each.id).length > 0).map((each) => each.id))
  )

  const rows = useMemo(() => rowsFor(lens, open, query), [lens, open, query])
  const [active, setActive] = useState<string>()
  const current = rows.find((row) => row.key === active) ?? rows.find((row) => row.own && row.select === selected)

  const toggle = (key: string, to?: boolean) =>
    setOpen((before) => {
      const next = new Set(before)

      if (to ?? !next.has(key)) {
        next.add(key)
      } else {
        next.delete(key)
      }

      return next
    })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = current ? rows.indexOf(current) : -1
    const move = (to: number) => setActive(rows[Math.min(rows.length - 1, Math.max(0, to))]?.key)

    if (event.key === "ArrowDown") {
      move(index + 1)
    } else if (event.key === "ArrowUp") {
      move(index - 1)
    } else if (event.key === "ArrowRight" && current?.opens) {
      if (current.open) {
        move(index + 1)
      } else {
        toggle(current.key, true)
      }
    } else if (event.key === "ArrowLeft" && current) {
      if (current.opens && current.open) {
        toggle(current.key, false)
      } else if (current.parent) {
        setActive(current.parent)
      }
    } else if ((event.key === "Enter" || event.key === " ") && current) {
      onSelect(current.select)
    } else if (event.key === "Home") {
      move(0)
    } else if (event.key === "End") {
      move(rows.length - 1)
    } else {
      return
    }

    event.preventDefault()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 pr-2">
        <div className="flex-1">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={info.outline.search}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation()
                setQuery("")
              }
            }}
          />
        </div>
        <IconButton label="Collapse all" onClick={() => setOpen(new Set())} className="mt-2 size-8">
          <ChevronsDownUp />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pt-2">
        <div className="relative flex h-7 items-center gap-1 pr-1.5 pl-3 text-xs text-muted-foreground">
          <GroupLabel className="flex-1">{sectionTitles[lens]}</GroupLabel>
          {lens === "screens" && (
            <IconButton
              label={keymap.newScreen.label}
              shortcut="newScreen"
              onClick={() => undefined}
              className="size-6"
            >
              <Plus />
            </IconButton>
          )}
        </div>
        <div
          className="flex flex-col pb-2 text-sm outline-none"
          role="tree"
          aria-label={info.outline.label}
          aria-activedescendant={current ? `row-${lens}-${current.key}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {rows.length === 0 && (
            <p className="px-3 py-1 text-xs text-muted-foreground">{query ? "Nothing matches." : info.outline.none}</p>
          )}
          {rows.map((row) => (
            <TreeRow
              key={row.key}
              id={`row-${lens}-${row.key}`}
              row={row}
              selected={row.own && row.select === selected}
              active={row === current}
              onSelect={() => {
                setActive(row.key)
                onSelect(row.select)
              }}
              onToggle={() => toggle(row.key)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** A row as Layers draws one: its guides, its arrow, its kind's icon in its color, its name, and a bar while selected. */
function TreeRow({
  id,
  row,
  selected,
  active,
  onSelect,
  onToggle
}: {
  id: string
  row: Row
  selected: boolean
  active: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const Icon = row.icon

  return (
    <div
      id={id}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.opens ? row.open : undefined}
      aria-level={row.depth + 1}
      tabIndex={-1}
      onClick={onSelect}
      onKeyDown={(event) => event.key === " " && onSelect()}
      className={`group relative flex h-7 cursor-default items-center gap-1.5 pr-2 ${
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
      } ${active ? "[[role=tree]:focus-visible_&]:ring-2 [[role=tree]:focus-visible_&]:ring-ring/50 [[role=tree]:focus-visible_&]:ring-inset" : ""}`}
      style={{ paddingLeft: 8 + row.depth * 14 }}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: row.color }} />}
      {Array.from({ length: row.depth }, (_, guide) => (
        <span
          key={guide}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border/70"
          style={{ left: 15 + guide * 14 }}
        />
      ))}
      <button
        type="button"
        tabIndex={-1}
        aria-label={row.open ? "Collapse" : "Expand"}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        className={`grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground hover:text-foreground ${
          row.opens ? "" : "invisible"
        }`}
      >
        <ChevronRight className={`size-3.5 transition-transform ${row.open ? "rotate-90" : ""}`} />
      </button>
      <Icon className="size-3.5 shrink-0" style={{ color: row.color }} />
      <Name className={`min-w-0 flex-1 ${row.end ? "font-mono text-[13px]" : ""}`}>{row.label}</Name>
      {row.end && <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.end}</span>}
    </div>
  )
}
