import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn"
import {
  type ComponentRef,
  type ComponentRole,
  type ComponentSource,
  componentRole,
  describeRenderStatus,
  emptyDocument,
  groupComponents,
  type RouteFiles,
  routeFiles,
  includeComponent,
  type LeftOutExport,
  type LibraryInfo
} from "@parity-app/core"
import {
  type AssetLine,
  assetLines,
  compareRanked,
  componentLabel,
  componentUses,
  type HiddenReason,
  hiddenHeading,
  hiddenReason,
  type InsertItem,
  type InsertOption,
  type InsertOrigin,
  isLate,
  missingProps,
  previewVariants,
  searchOption
} from "@parity-app/editor"
import { applyDocuments, type ProjectDoc } from "@parity-app/multiplayer"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import {
  ChevronRight,
  CircleAlert,
  Component,
  Diamond,
  LayoutGrid,
  Library,
  List,
  LoaderCircle,
  MonitorSmartphone,
  Plus,
  Search,
  Smile,
  StretchHorizontal
} from "lucide-react"
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react"
import type { CatalogLibrary, ProjectInfo } from "../../shared/protocol.ts"
import { boardKeyOf } from "../canvas/component-boards.ts"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import { useComponentPreview, usePreviewOnScreen, useVariantPreviews } from "../component-previews.ts"
import { useExtensions } from "../extensions.ts"
import type { LoadedGuest } from "../guest.ts"
import { type ContainerEntry, useContainerEntries } from "../project-doc.ts"
import { errorCode, reportError, track } from "../report-error.ts"
import { serviceCall } from "../service-call.ts"
import { request } from "../service.ts"
import { type ProjectSession, workspace } from "../workspace.ts"
import { AdapterLogo } from "./AdapterLogo.tsx"
import { AddLibraryDialog, offeredLibraries } from "./AddLibraryDialog.tsx"
import { componentFile, viewCode } from "./code-editor.ts"
import { componentOffers, type PlacedExtensions } from "./command-offers.ts"
import { type ComponentCardProps, ComponentPopover, PreviewThumb, StatusLine } from "./ComponentCard.tsx"
import { ComponentMenu, type MenuOffer } from "./ComponentMenu.tsx"
import type { Attributes } from "./event-attributes.ts"
import { Hint } from "./Hint.tsx"
import { useHoverCard } from "./hover-card.ts"
import { GuestIcon, iconCatalog, iconLibraries, iconStyles, iconsOf } from "./icons.tsx"
import { addAtSelection, dragItem } from "./insert-from-panel.ts"
import { Name, NameInput } from "./Name.tsx"
import { GroupLabel } from "./PanelSection.tsx"
import { type Preferences, setPreferences, usePreferences } from "./preferences.ts"
import { type PreviewStatus, previewStatus } from "./preview-status.ts"
import { announceEdit } from "./project-edits.tsx"
import { revealSelection } from "./reveal.ts"

const noSubscription = () => () => undefined

/** Whether a source is the app's own components or pages, which can run to hundreds. */
function bulky(id: string): boolean {
  return id === "project" || id === "project:pages"
}

/** No source opened or closed by hand. */
const noneOpened: Readonly<Record<string, boolean>> = {}

/**
 * Puts an export on the component list, as an undoable change to the main project file, saved with it. The list follows
 * straight away.
 */
function listByHand(doc: ProjectDoc, target: ComponentRef, name: string): void {
  const ref = { path: target.path, export: target.export }

  const main = doc.file(doc.main) ?? emptyDocument()

  const { detection: _, ...rest } = main
  const detection = includeComponent(main.detection, ref)
  applyDocuments(doc, `List ${name} as a component`, [{ path: doc.main, document: { ...rest, detection } }], {
    origin: "edit"
  })
}

/** A panel's search field, with a magnifier; the Layers panel's too. It matches names, so it shows their letters. */
export function SearchField({
  value,
  onChange,
  placeholder,
  onKeyDown
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="relative px-2 pt-2">
      <Search className="pointer-events-none absolute top-1/2 left-4 mt-1 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <NameInput
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pl-7 text-xs"
      />
    </div>
  )
}

/**
 * One of a family's components. `evidence` is why it counts as a component, in words; `hidden` why the insert picker
 * leaves it out until it's searched for by name (PAR-178).
 */
export interface FamilyItem {
  key: string
  label: string
  item: InsertItem
  evidence?: string
  hidden?: HiddenReason
}

export interface Family {
  name: string
  items: FamilyItem[]
  /** Its name is a folder or a route, shown over a single component too. */
  heading?: true
}

export interface Source {
  id: string
  title: string
  icon: ReactNode
  /** Where its components come from, which ranks them in the insert picker; a library's designs are its designs. */
  origin: InsertOrigin
  families: Family[]
  library?: LibraryInfo
}

/**
 * Components under headings: by the file that defines them, as shadcn groups Card, CardHeader and CardTitle, or for the
 * rest of the app, by folder or page route. What the picker hides comes last, under a heading of its own, as a
 * library's internal parts always have.
 */
function families(
  sources: [string, ComponentSource][],
  by: "file" | "folder" | "route" = "file",
  routes?: RouteFiles
): Family[] {
  const evidence = new Map(
    // Why detection counts it says nothing a person needs, so only one they listed themselves says so.
    sources.map(([key, source]) => [key, source.included ? "listed by hand" : undefined])
  )

  const hidden = new Map(sources.map(([key, source]) => [key, hiddenReason(key, { internal: source.internal })]))

  const grouped = groupComponents(sources, by, routes).map((group) => {
    const family: Family = {
      name: group.name,
      items: group.ids.map((key) => familyItem(key, evidence.get(key), hidden.get(key)))
    }

    if (by !== "file") {
      family.heading = true
    }

    return family
  })

  const apart = grouped.flatMap((family) => family.items.filter((entry) => entry.hidden))

  if (apart.length === 0) {
    return grouped
  }

  const shown = grouped.flatMap((family) => {
    const items = family.items.filter((entry) => !entry.hidden)

    return items.length > 0 ? [{ ...family, items }] : []
  })

  return [...shown, { name: hiddenHeading(apart.flatMap((entry) => entry.hidden ?? [])), heading: true, items: apart }]
}

function familyItem(key: string, evidence: string | undefined, hidden: HiddenReason | undefined): FamilyItem {
  const entry: FamilyItem = { key, label: componentLabel(key), item: { kind: "component", component: key } }

  if (evidence) {
    entry.evidence = evidence
  }

  if (hidden) {
    entry.hidden = hidden
  }

  return entry
}

/** The project's own components by role: its UI kit, the rest of the app by folder, and its pages. */
function ownSources(info: ProjectInfo, all: [string, ComponentSource][]): Source[] {
  const icon = <Component className="size-3.5" style={{ color: kindColors.component }} />
  const routes = routeFiles(info.routes)
  const withRole = (role: ComponentRole) => all.filter(([, source]) => componentRole(source, routes) === role)
  const kit = withRole("kit")
  const pages = withRole("page")

  return [
    ...(kit.length > 0
      ? [{ id: "project:kit", title: "UI kit", icon, origin: "kit" as const, families: families(kit) }]
      : []),
    { id: "project", title: info.name, icon, origin: "app", families: families(withRole("app"), "folder") },
    {
      id: "project:pages",
      title: "Pages",
      icon: <MonitorSmartphone className="size-3.5" style={{ color: kindColors.screen }} />,
      origin: "page",
      families: families(pages, "route", routes)
    }
  ]
}

/**
 * What the Components section lists, by source: the project's component designs, its own components, then each
 * component library's. Exported for other pickers, like quick insert.
 */
export function componentSources(info: ProjectInfo, entries: readonly ContainerEntry[]): Source[] {
  // A provider or context draws nothing, so it's only ever inserted around the parts that need it.
  const all = Object.entries(info.sources).filter(([, source]) => source.visual !== false)
  const designs = entries.filter((entry) => entry.container.kind === "component")
  const list: Source[] = []

  if (designs.length > 0) {
    list.push({
      id: "designs",
      title: "Local components",
      icon: <Diamond className="size-3.5" style={{ color: kindColors.component }} />,
      origin: "design",
      families: [
        {
          name: "",
          items: designs.map((entry) => ({
            key: entry.key,
            label: entry.container.name,
            item: { kind: "instance", design: entry.container.id }
          }))
        }
      ]
    })
  }

  list.push(...ownSources(info, all))

  for (const library of info.libraries.filter((candidate) => candidate.kind !== "icons")) {
    const own = all.filter(([, source]) => source.library === library.id)
    // Its ready-made compositions come first, placed as linked instances, or as copies from their menu. One a project
    // design has the id of is left out, since placing it would place the project's.
    const ownIds = new Set(entries.map((entry) => entry.container.id))
    const offered = (library.designs ?? []).filter((design) => !ownIds.has(design.id))

    const designed: Family[] = offered.length
      ? [
          {
            name: "Ready-made components",
            heading: true,
            items: offered.map((design) => ({
              key: design.id,
              label: design.name,
              item: { kind: "instance", design: design.id }
            }))
          }
        ]
      : []

    list.push({
      id: library.id,
      title: library.name,
      icon: <Library className="size-3.5 text-muted-foreground" />,
      origin: "library",
      // Parts it renders inside its own components, its providers and portals come last, apart, so the list leads with
      // what's placed.
      families: [...designed, ...families(own)],
      library
    })
  }

  return list
}

/**
 * A source's families as a search finds them, as the insert picker matches (PAR-178): names before the file or folder
 * they're listed under, hidden components only when the search names them, the best matches first in each family and
 * the families with the best matches first.
 */
function searchFamilies(source: Source, query: string): Family[] {
  const found = source.families.flatMap((family, place) => {
    const items = family.items.flatMap((entry, index) => {
      const option: InsertOption = {
        key: entry.key,
        name: entry.label,
        origin: source.origin,
        source: source.id,
        sourceName: source.title,
        description: family.name
      }

      if (entry.hidden) {
        option.hidden = entry.hidden
      }

      const match = searchOption(option, query)

      // As in the picker, a hidden one the search only partly names comes after the rest.
      return match ? [{ entry, tier: match.tier, late: isLate(entry, match), index }] : []
    })

    if (items.length === 0) {
      return []
    }

    items.sort((a, b) => compareRanked(a, b) || a.index - b.index)
    // The family ranks as its best match, which comes first, and keeps its place among families that rank the same.
    const { tier, late } = items[0]!

    return [{ family: { ...family, items: items.map(({ entry }) => entry) }, tier, late, index: place }]
  })

  return found.sort((a, b) => compareRanked(a, b) || a.index - b.index).map(({ family }) => family)
}

type ComponentsView = Preferences["componentsView"]

/** The Components tab's views, each with its icon and name (PAR-208). */
const views: { view: ComponentsView; label: string; Icon: typeof List }[] = [
  { view: "names", label: "Names", Icon: StretchHorizontal },
  { view: "list", label: "List", Icon: List },
  { view: "grid", label: "Grid", Icon: LayoutGrid }
]

/**
 * Components to drag into designs: component designs, the project's own, then each library's. They show as names, as a
 * list with a picture on each row (the default) or as a grid of larger pictures, which the person picks and Parity
 * remembers (PAR-208). The pictures are files the offscreen renderer made, so no panel mounts a component.
 */
export function ComponentsPanel() {
  const session = useProject()
  const { info } = session
  const entries = useContainerEntries(session)
  const [query, setQuery] = useState("")
  const { componentsView: view } = usePreferences()

  const sources = useMemo(() => componentSources(info, entries), [entries, info])
  const uses = useMemo(() => componentUses(entries.map((entry) => entry.container.root)), [entries])

  const needle = query.trim().toLowerCase()

  const shown = useMemo(
    () =>
      needle
        ? sources
            .map((source) => ({ ...source, families: searchFamilies(source, needle) }))
            .filter((source) => source.families.length > 0)
        : sources.filter((source) => source.families.length > 0 || source.library),
    [sources, needle]
  )

  const leftOut = needle ? notListed(info).filter((entry) => entry.name.toLowerCase().includes(needle)) : []

  // What was opened or closed by hand. Starting or clearing a search forgets it, so matches always show.
  const [opened, setOpened] = useState<{ searching: boolean; by: Readonly<Record<string, boolean>> }>({
    searching: false,
    by: {}
  })

  const searching = !!needle

  // Entering or leaving a search drops what was toggled, so the next search doesn't bring back the last one's.
  if (opened.searching !== searching) {
    setOpened({ searching, by: noneOpened })
  }

  const openedBy = opened.searching === searching ? opened.by : noneOpened

  const toggle = (id: string, open: boolean) => setOpened({ searching, by: { ...openedBy, [id]: open } })

  const lines = useMemo(
    () =>
      assetLines(
        shown.map((source) => ({
          id: source.id,
          families: source.families,
          // Libraries start closed, and so do the app's components and pages beside other sections, since each can run
          // to hundreds. A search opens every section with a match.
          open: openedBy[source.id] ?? (!!needle || (!source.library && (!bulky(source.id) || shown.length < 3))),
          notice: !!source.library && !source.library.stylesImported
        })),
        view === "grid" ? 2 : 1
      ),
    [shown, openedBy, needle, view]
  )

  return (
    <>
      <div className="flex items-center gap-1 pr-2">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} placeholder="Search components" />
        </div>
        <AddComponentLibrary />
      </div>
      <div className="flex justify-end px-2 pt-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[view]}
          onValueChange={([value]) => {
            if (value) {
              // SAFETY: the group's items come from `views`, one for each ComponentsView.
              setPreferences({ componentsView: value as ComponentsView })
            }
          }}
          aria-label="Show components as"
        >
          {views.map(({ view: value, label, Icon }) => (
            <Hint key={value} label={label}>
              <ToggleGroupItem value={value} aria-label={label} className="h-6 w-7">
                <Icon className="size-3.5" />
              </ToggleGroupItem>
            </Hint>
          ))}
        </ToggleGroup>
      </div>
      <AssetList key={needle} sources={shown} lines={lines} view={view} uses={uses} onToggle={toggle}>
        {leftOut.length > 0 && <NotListed entries={leftOut} />}
        {shown.length === 0 && leftOut.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing matches.</p>
        )}
      </AssetList>
    </>
  )
}

/**
 * Pressing a component: one of the project's own selects its board on the canvas, which shows what it is, and any
 * other is added where the selection is.
 */
function pick(session: ProjectSession, item: InsertItem, component: string | undefined): void {
  const board = component === undefined ? undefined : boardKeyOf(session.id, component)

  if (board === undefined) {
    addAtSelection(session, item)

    return
  }

  session.selection.set({ design: board })
  revealSelection(session)
}

/** The app's exports that aren't listed as components: what the type checker left out, less what the person listed. */
function notListed(info: ProjectInfo): LeftOutExport[] {
  const key = (ref: ComponentRef) => `${ref.path}#${ref.export}`
  const listed = new Set(Object.values(info.sources).map(key))

  return (info.leftOut ?? []).filter((entry) => !listed.has(key(entry)))
}

/**
 * The app's exports a search matches that aren't listed as components, with why, so looking for one explains itself.
 * Each can be listed by hand, which the main project file keeps.
 */
function NotListed({ entries }: { entries: LeftOutExport[] }) {
  const session = useProject()

  return (
    <section className="mt-2 border-t pt-2" aria-label="Not listed as components">
      <GroupLabel as="div" className="flex h-7 items-center px-4">
        Not listed
      </GroupLabel>
      {entries.map((entry) => (
        <div
          key={`${entry.path} ${entry.export}`}
          className="flex items-start gap-2 py-1 pr-2 pl-8 text-muted-foreground"
        >
          <div className="min-w-0 flex-1">
            <Hint label={entry.path} wait>
              {/* The hint's trigger, so it's an element that takes the hint's ref. */}
              <div className="truncate">
                <Name>{entry.name}</Name>
              </div>
            </Hint>
            <div className="type-message">
              {entry.undecided
                ? `Can't tell: ${entry.reason}`
                : `${entry.reason.charAt(0).toUpperCase()}${entry.reason.slice(1)}`}
            </div>
          </div>
          <Hint label="List it as a component, in the project file" wait>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2"
              onClick={() => listByHand(session.doc, entry, entry.name)}
            >
              List it
            </Button>
          </Hint>
        </div>
      ))}
    </section>
  )
}

/** How tall each kind of line is before it's measured, in pixels. */
function lineHeight(line: AssetLine<FamilyItem>, view: ComponentsView): number {
  switch (line.type) {
    case "source":
      return 28
    case "notice":
      return 60
    case "family":
      return 20
    case "items":
      return rowHeights[view] + (line.last ? 4 : 0)
  }
}

/** How tall a row of each view is before it's measured, in pixels: a grid row is about a picture's height and its name. */
const rowHeights: Record<ComponentsView, number> = { names: 28, list: 44, grid: 112 }

/**
 * The sources' lines, drawn only while in view, ten either side besides (PAR-1202): a library of hundreds of components
 * costs the panel what a few do. The row with focus stays drawn when it's scrolled away, so the keyboard keeps its
 * place. `children` come after the lines, as the exports a search finds that aren't listed.
 */
function AssetList({
  sources,
  lines,
  view,
  uses,
  onToggle,
  children
}: {
  sources: readonly Source[]
  lines: readonly AssetLine<FamilyItem>[]
  view: ComponentsView
  uses: ReadonlyMap<string, number>
  onToggle: (source: string, open: boolean) => void
  children?: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const focused = useRef<string>(undefined)

  const indexOf = useMemo(() => new Map(lines.map((line, index) => [line.key, index])), [lines])

  // The app doesn't use the React Compiler, whose memoizing this rule guards against.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => lineHeight(lines[index]!, view),
    getItemKey: (index) => lines[index]!.key,
    paddingStart: 8,
    overscan: 10,
    // The panel's size before it's measured, so its first frame already draws the rows in view.
    initialRect: { width: 256, height: 900 },
    rangeExtractor: (range) => {
      const shown = defaultRangeExtractor(range)
      const kept = focused.current === undefined ? undefined : indexOf.get(focused.current)

      return kept === undefined || shown.includes(kept) ? shown : [...shown, kept].sort((a, b) => a - b)
    }
  })

  // Rows change height with the view, and in Grid with the panel's width; measuring again is cheap.
  useLayoutEffect(() => virtualizer.measure(), [virtualizer, view])

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto pb-2 text-sm"
      onFocus={(event) => {
        focused.current = event.target.closest<HTMLElement>("[data-line]")?.dataset.line
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focused.current = undefined
        }
      }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const line = lines[item.index]!
          const source = sources[line.source]!

          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              data-line={line.key}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {line.type === "source" && (
                <SourceHeading source={source} count={line.count} open={line.open} onToggle={onToggle} />
              )}
              {line.type === "notice" && source.library && <ImportStyles library={source.library} />}
              {line.type === "family" && (
                <div className={`${view === "names" ? "px-8" : "px-3"} pt-1 text-2xs text-muted-foreground`}>
                  <Name className="block">{line.name}</Name>
                </div>
              )}
              {line.type === "items" && (
                <div className={itemsLayout(view, line.first, line.last)}>
                  {line.items.map((entry) => (
                    <AssetEntry
                      key={entry.key}
                      entry={entry}
                      library={!!source.library}
                      view={view}
                      uses={uses.get(entry.key) ?? 0}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {children}
    </div>
  )
}

/** A row of items: in Grid, laid out across, with room above a family's first row; room under a family's last. */
function itemsLayout(view: ComponentsView, first: boolean, last: boolean): string | undefined {
  if (view === "grid") {
    return `grid grid-cols-2 gap-1 px-2 ${first ? "pt-1" : ""} ${last ? "pb-2" : "pb-1"}`
  }

  return last ? "pb-1" : undefined
}

/** A source's heading, with how many components it has; clicking it opens or closes the source. */
function SourceHeading({
  source,
  count,
  open,
  onToggle
}: {
  source: Source
  count: number
  open: boolean
  onToggle: (source: string, open: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(source.id, !open)}
      aria-expanded={open}
      className="group/source flex h-7 w-full items-center gap-1.5 px-2 text-muted-foreground hover:text-foreground"
    >
      <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      {source.icon}
      <GroupLabel className="flex min-w-0 flex-1 items-center gap-1.5 group-hover/source:text-foreground">
        <span className="min-w-0 flex-1 truncate text-left">{source.title}</span>
        <span className="tabular-nums">{count}</span>
      </GroupLabel>
    </button>
  )
}

/** The sizes of a component's picture in the List and Grid views, in CSS pixels. */
const thumbSizes = { list: { width: 52, height: 34 }, grid: { width: 104, height: 68 } }

/**
 * An item of a source: a component, whose card opens beside it when the pointer rests on it or the right arrow is
 * pressed on it (PAR-515, PAR-208), or a library's component design, with a hint. In the List and Grid views a
 * component shows its picture, or why it has none. Right-clicking a component opens its menu (PAR-527): what the
 * project's extensions offer for components, as Open in Storybook, and View code in the person's editor, each greyed with
 * why when it can't. A library's design offers its two ways to insert.
 */
const AssetEntry = memo(function AssetEntry({ entry, library, view, uses }: AssetEntryProps) {
  const session = useProject()
  const { item } = entry
  const component = item.kind === "component" ? entry.key : undefined
  const failure = useRenderFailure(session.loaded, component)
  const failing = failure !== undefined
  const card = useHoverCard()
  const { pictured, about } = useComponentCard(session, component, card.open)
  const file = about.onOpenFile !== undefined
  // Pressing it, to add or drag it, or right-clicking it puts the card away.
  const putAway = () => card.setOpen(false)

  const icon =
    item.kind === "instance" ? (
      <Diamond className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
    ) : (
      <Component className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
    )

  const failingMark = failing && (
    <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-label="Fails to draw" />
  )

  // A component design has no picture of its own yet, so its kind's icon stands in for one.
  const picture = (size: { width: number; height: number }, fill = false) =>
    component ? (
      <PreviewThumb status={pictured} {...size} fill={fill} />
    ) : (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-[5px] bg-muted"
        style={fill ? { width: "100%", aspectRatio: `${size.width} / ${size.height}` } : size}
      >
        {icon}
      </span>
    )

  let content: ReactNode
  let layout: string

  if (view === "grid") {
    layout = "flex w-full min-w-0 flex-col gap-1 rounded-md p-1"
    content = (
      <>
        {picture(thumbSizes.grid, true)}
        <span className="flex w-full min-w-0 flex-col px-0.5">
          <span className="flex min-w-0 items-center gap-1 text-xs">
            <Name>{entry.label}</Name>
            {failingMark}
          </span>
          <StatusLine status={pictured} size="text-2xs" />
        </span>
      </>
    )
  } else if (view === "list") {
    layout = "flex h-11 w-full min-w-0 items-center gap-2.5 rounded-md pr-8 pl-3"
    content = (
      <>
        {picture(thumbSizes.list)}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1">
            <Name>{entry.label}</Name>
            {failingMark}
          </span>
          <StatusLine status={pictured} />
        </span>
      </>
    )
  } else {
    layout = "flex h-7 w-full items-center gap-2 rounded-md pr-8 pl-8"
    content = (
      <>
        {icon}
        <Name>{entry.label}</Name>
        {failingMark}
      </>
    )
  }

  const button = (
    <button
      type="button"
      {...dragItem(item)}
      onClick={() => pick(session, item, component)}
      {...(component
        ? {
            onPointerEnter: card.enter,
            onPointerLeave: card.leave,
            onPointerDown: putAway,
            onContextMenu: putAway,
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key !== "ArrowRight") {
                return
              }

              event.preventDefault()
              card.openWithKeyboard()
            },
            "aria-expanded": card.open,
            "aria-controls": card.open ? card.id : undefined
          }
        : {})}
      className={`${layout} cursor-grab text-left hover:bg-accent active:cursor-grabbing aria-expanded:bg-accent`}
    >
      {content}
    </button>
  )

  const instance = library && item.kind === "instance"
  const menu = component !== undefined || instance

  const trigger = menu ? <ContextMenuTrigger render={button} /> : button

  const row = component ? (
    <ComponentPopover
      card={card}
      name={component}
      note={entry.evidence}
      status={failing ? describeRenderStatus({ error: failure }) : undefined}
      {...about}
      uses={uses}
      onInsert={() => {
        putAway()
        addAtSelection(session, item)
      }}
    >
      {trigger}
    </ComponentPopover>
  ) : (
    <Hint label={entry.key} detail={instance ? "Right-click to insert a detached copy." : undefined} wait>
      {trigger}
    </Hint>
  )

  return (
    <AssetRow
      component={component}
      offers={component && <RowOffers component={component} label={entry.label} view={view} />}
    >
      {menu ? (
        <ContextMenu>
          {row}
          <ContextMenuContent className="w-auto min-w-56 whitespace-nowrap">
            {/* Mounted only while the menu is open, so its offers are worked out then. */}
            <AssetMenu component={component} design={instance ? item : undefined} file={file} />
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        row
      )}
    </AssetRow>
  )
}, sameRow)

interface AssetEntryProps {
  entry: FamilyItem
  /** It's one of a library's, whose designs are inserted linked or as a copy. */
  library: boolean
  view: ComponentsView
  uses: number
}

/** Whether a row shows what it showed: the list makes its items afresh whenever the project's designs change. */
function sameRow(before: AssetEntryProps, after: AssetEntryProps): boolean {
  const [a, b] = [before.entry, after.entry]

  return (
    before.library === after.library &&
    before.view === after.view &&
    before.uses === after.uses &&
    a.key === b.key &&
    a.label === b.label &&
    a.evidence === b.evidence &&
    a.hidden === b.hidden &&
    a.item.kind === b.item.kind &&
    (a.item.kind !== "instance" || (b.item.kind === "instance" && a.item.design === b.item.design))
  )
}

/**
 * Why a component fails to draw on the canvas, as the guest's boundaries saw it, or nothing. A row hears only of its own
 * component, so the canvas drawing more doesn't draw every row again.
 */
function useRenderFailure(loaded: LoadedGuest, component: string | undefined): string | undefined {
  const status = loaded.guest.renderStatus

  return useSyncExternalStore(status?.subscribe ?? noSubscription, () => {
    const now = component === undefined ? undefined : status?.get()[component]

    return now && "error" in now ? now.error : undefined
  })
}

/**
 * A component's or a library design's right-click menu (PAR-527): what the project's extensions offer for components,
 * as Open in Storybook, and View code, or a library design's two ways to insert, linked or as a copy to change freely.
 * It's worked out as the menu opens.
 */
function AssetMenu({
  component,
  design,
  file
}: {
  component?: string
  design?: Extract<InsertItem, { kind: "instance" }>
  file: boolean
}) {
  const session = useProject()
  const { extensions } = useExtensions(session)

  return (
    <ComponentMenu
      offers={component ? menuOffers(component, { session, extensions, placement: "componentCard" }) : undefined}
      code={component ? { file, open: () => void viewCode(session.info, component) } : undefined}
    >
      {design && (
        <>
          <ContextMenuItem onClick={() => addAtSelection(session, design)}>Insert linked instance</ContextMenuItem>
          <ContextMenuItem onClick={() => addAtSelection(session, { ...design, detached: true })}>
            Insert detached copy
          </ContextMenuItem>
        </>
      )}
    </ComponentMenu>
  )
}

/**
 * The buttons on a component's row for what the project's extensions offer, as Open in Storybook. They show while the
 * row is pointed at or has focus, so they're worked out only then.
 */
function RowOffers({ component, label, view }: { component: string; label: string; view: ComponentsView }) {
  const session = useProject()
  const { extensions } = useExtensions(session)
  const offers = componentOffers(component, { session, extensions, placement: "componentCard" })

  if (offers.length === 0) {
    return null
  }

  return (
    <div
      className={`absolute ${view === "grid" ? "top-1.5 right-1.5" : "top-1/2 right-1.5 -translate-y-1/2"} flex gap-0.5`}
    >
      {offers.map(({ command, unavailable }) => (
        // One that can't act stays, faded and focusable, its hint saying why.
        <Hint key={`${command.extension}:${command.id}`} label={unavailable ?? command.name}>
          <button
            type="button"
            aria-label={
              unavailable === undefined
                ? `${command.name}: ${label}`
                : `${command.name}: ${label}, unavailable: ${unavailable}`
            }
            aria-disabled={unavailable !== undefined || undefined}
            onClick={unavailable === undefined ? () => void command.run() : undefined}
            className={`grid size-5 place-items-center rounded bg-background/80 text-muted-foreground opacity-0 focus-visible:opacity-100 ${unavailable === undefined ? "group-hover/asset:opacity-100 hover:bg-background hover:text-foreground" : "group-hover/asset:opacity-50"}`}
          >
            <AdapterLogo logo={command.icon} className="size-3.5" />
          </button>
        </Hint>
      ))}
    </div>
  )
}

/** What a component's menu offers from the project's extensions: each command placed for components, greyed with why on one it isn't for. */
function menuOffers(component: string, placed: PlacedExtensions): MenuOffer[] {
  return componentOffers(component, placed).map(({ command, unavailable }) => {
    const offer: MenuOffer = {
      id: `${command.extension}:${command.id}`,
      name: command.name,
      logo: command.icon,
      run: () => void command.run()
    }

    if (unavailable !== undefined) {
      offer.unavailable = unavailable
    }

    return offer
  })
}

/**
 * What a component's card shows, beyond its name (PAR-208): its file, its preview and why it has none, its variants'
 * previews, made only while `shown`, what extensions know of it, as its stories, and opening its file or its stories. `pictured` is its
 * preview's status, for its row.
 */
export function useComponentCard(
  session: ProjectSession,
  component: string | undefined,
  shown: boolean
): ComponentCard {
  const preview = useComponentPreview(session, component ?? "")
  const { extensions } = useExtensions(session)
  const info = component ? session.components.get()[component] : undefined
  // Only one that failed or drew nothing is asked which props it lacks, as that's when it says.
  const lacking = preview?.state === "failed" || preview?.state === "empty"

  const missing = useMemo(
    () => (component && lacking ? missingProps(component, info, session.info.sources) : []),
    [component, lacking, info, session.info.sources]
  )

  const variants = useMemo(() => previewVariants(info), [info])

  const options = useMemo(
    () => (component && variants ? variants.options.map((value) => ({ prop: variants.prop, value })) : []),
    [component, variants]
  )

  const variantPreviews = useVariantPreviews(session, component ?? "", options, shown)

  if (!component) {
    return { pictured: previewStatus(undefined), about: { preview: undefined } }
  }

  const facts = extensions.flatMap((extension) => extension.facts[component] ?? [])

  const about: ComponentCard["about"] = { path: session.info.sources[component]?.path, preview, missing, facts }

  if (variants) {
    about.variants = {
      prop: variants.prop,
      options: variants.options.map((value, index) => ({ value, preview: variantPreviews[index] }))
    }
  }

  if (componentFile(session.info, component) !== undefined) {
    about.onOpenFile = () => void viewCode(session.info, component)
  }

  // Its offers are worked out only while it shows; a row's closed card needs none.
  const placed: PlacedExtensions = { session, extensions, placement: "componentCard" }

  const offers = (shown ? componentOffers(component, placed) : []).map(({ command, unavailable }) => ({
    id: `${command.extension}:${command.id}`,
    name: command.name,
    logo: command.icon,
    unavailable,
    run: () => void command.run()
  }))

  if (offers.length > 0) {
    about.offers = offers
  }

  return { pictured: previewStatus(preview, missing), about }
}

/** What {@link useComponentCard} gives a component's row: its preview's status, and what its card shows about it. */
export interface ComponentCard {
  pictured: PreviewStatus
  about: Pick<ComponentCardProps, "path" | "preview" | "missing" | "variants" | "facts" | "onOpenFile" | "offers">
}

/**
 * A row of the Components panel. A component's row on screen has its preview made first (PAR-207). `offers` show while
 * the row is pointed at or has focus.
 */
function AssetRow({
  component,
  offers,
  children
}: {
  component: string | undefined
  offers: ReactNode
  children: ReactNode
}) {
  const session = useProject()
  const onScreen = usePreviewOnScreen(session, component)
  const [pointed, setPointed] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <div
      ref={onScreen}
      className="group/asset relative min-w-0"
      onPointerEnter={() => setPointed(true)}
      onPointerLeave={() => setPointed(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false)
        }
      }}
    >
      {children}
      {(pointed || focused) && offers}
    </div>
  )
}

/**
 * Installs a catalog library with the project's package manager, set up with `settings` and with the icon sets
 * `companions` names, then reopens the tab to load it.
 */
async function installLibrary(
  projectId: string,
  library: { id: string; name: string },
  settings?: Record<string, string>,
  companions?: string[]
): Promise<void> {
  await serviceCall({
    progress: `Installing ${library.name}…`,
    run: () => request("library.add", { projectId, library: library.id, settings, companions }),
    done() {
      track("library.added", { package: library.id })

      return { success: `Installed ${library.name}` }
    },
    after: () => workspace.reload(projectId, `Loading ${library.name}`),
    failed: {
      operation: "library.add",
      title: `Couldn't install ${library.name}`,
      description: () => "The package manager stopped with an error.",
      details: (error) => message(error).slice(-2000),
      track(error) {
        const failed: Attributes<"library.failed"> = { package: library.id }
        const code = errorCode(error)

        if (code) {
          failed.code = code
        }

        track("library.failed", failed)
      }
    }
  })
}

/** Takes a library out of the project with its package manager, then reopens the tab without it. */
async function removeLibrary(projectId: string, library: { id: string; name: string }): Promise<void> {
  await serviceCall({
    progress: `Removing ${library.name}…`,
    run: () => request("library.remove", { projectId, library: library.id }),
    done: () => ({ success: `Removed ${library.name}` }),
    after: () => workspace.reload(projectId, `Removing ${library.name}`),
    failed: {
      operation: "library.remove",
      title: `Couldn't remove ${library.name}`,
      description: () => "The package manager stopped with an error.",
      details: (error) => message(error).slice(-2000)
    }
  })
}

/** What a library's registry file holds, from the service, or nothing when it can't say. */
async function libraryPreview(library: string, settings?: Record<string, string>) {
  try {
    return await request("library.preview", { library, settings })
  } catch (cause) {
    reportError(cause, { operation: "library.preview", title: "Couldn't load the library's preview" })

    return undefined
  }
}

/** The plus button that opens the component libraries the project can add, change or remove. */
function AddComponentLibrary() {
  const session = useProject()
  const [catalog, setCatalog] = useState<CatalogLibrary[]>()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="mt-2"
        aria-label="Component libraries"
        onClick={() => {
          setOpen(true)
          setCatalog(undefined)
          void request("library.catalog", { projectId: session.id }).then(setCatalog, (cause: unknown) =>
            reportError(cause, { operation: "library.catalog", title: "Couldn't load libraries" })
          )
        }}
      >
        <Plus />
      </Button>
      <AddLibraryDialog
        open={open}
        onOpenChange={setOpen}
        libraries={offeredLibraries(catalog ?? [])}
        loadPreview={libraryPreview}
        onAdd={({ library, settings, companions }) => {
          setOpen(false)
          void installLibrary(
            session.id,
            catalog?.find((each) => each.id === library) ?? { id: library, name: library },
            settings,
            companions
          )
        }}
        onRemove={(library) => {
          setOpen(false)
          void removeLibrary(session.id, catalog?.find((each) => each.id === library) ?? { id: library, name: library })
        }}
      />
    </>
  )
}

/** The icon set each project's Icons tab shows, kept while the tab reopens to load a set just added. */
const shownIconSets = new Map<string, string>()

/** The icon sets the registry has files for, to add to the project; `trigger` replaces the plus button that opens it. */
function AddIconSet({ trigger }: { trigger?: ReactElement }) {
  const session = useProject()
  const [catalog, setCatalog] = useState<CatalogLibrary[]>()
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (next && !catalog) {
          void request("library.catalog", { projectId: session.id }).then(setCatalog, (cause: unknown) =>
            reportError(cause, { operation: "library.catalog", title: "Couldn't load libraries" })
          )
        }
      }}
    >
      <PopoverTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon-sm" className="mt-2" aria-label="Add an icon set">
              <Plus />
            </Button>
          )
        }
      />
      <PopoverContent align="end" className="w-80 p-2">
        <p className="type-description px-1 pb-2 text-muted-foreground">
          Libraries install into the project with its package manager. Any package with a <code>.lib.par</code> file is
          picked up on its own.
        </p>
        {!catalog && <LoaderCircle className="mx-auto my-3 size-4 animate-spin text-muted-foreground" />}
        <ul className="flex flex-col gap-1">
          {catalog
            ?.filter((library) => library.kind === "icons")
            .map((library) => (
              <li key={library.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-accent/50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{library.name}</div>
                  <div className="type-description text-muted-foreground">{library.description}</div>
                </div>
                <Button
                  size="sm"
                  variant={library.installed ? "ghost" : "outline"}
                  disabled={library.installed}
                  onClick={() => {
                    shownIconSets.set(session.id, library.id)
                    void installLibrary(session.id, library)
                  }}
                >
                  {library.installed ? "Added" : "Add"}
                </Button>
              </li>
            ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function ImportStyles({ library }: { library: LibraryInfo }) {
  const session = useProject()

  return (
    <div className="type-message mx-2 mb-1 rounded-md border border-dashed p-2 text-muted-foreground">
      Its styles aren&apos;t imported yet, so its components render unstyled.{" "}
      <button
        type="button"
        className="font-medium text-foreground underline-offset-2 hover:underline"
        onClick={() => void importStyles(session.id, library)}
      >
        Import them
      </button>
    </div>
  )
}

/**
 * Imports a library's styles into the project's stylesheet, then reopens the tab to draw with them, and says what it
 * changed, to look at or undo.
 */
export async function importStyles(projectId: string, library: LibraryInfo): Promise<void> {
  try {
    const edit = await request("library.importStyles", { projectId, library: library.id })

    const imported: Attributes<"styles.imported"> = {
      package: library.package,
      files: edit?.files.map((file) => file.path) ?? []
    }

    if (library.version) {
      imported.version = library.version
    }

    track("styles.imported", imported)
    await workspace.reload(projectId, `Loading ${library.name}'s styles`)

    if (edit) {
      announceEdit(projectId, edit, {
        afterUndo: () => workspace.reload(projectId, `Taking out ${library.name}'s styles`)
      })
    }
  } catch (error) {
    reportError(error, {
      operation: "library.importStyles",
      title: `Couldn't import ${library.name}'s styles`,
      retry: () => void importStyles(projectId, library)
    })
  }
}

/** The smallest an icon's cell gets, in pixels: room to aim at its icon. Cells grow so each row fills the panel. */
const iconCell = 52

/** How big each icon is drawn, in pixels. */
const iconSize = 20

/**
 * Every icon in the project's icon sets, searchable, drawn by the project's own copy of each set as its `.lib.par`
 * describes it. Only the rows in view are rendered, so a set of thousands scrolls smoothly.
 */
export function IconsPanel() {
  const session = useProject()
  const sets = iconLibraries(session.info.libraries)
  const [chosen, setChosen] = useState(() => shownIconSets.get(session.id))
  const library = sets.find((set) => set.id === chosen) ?? sets[0]
  const { styles, initial } = library ? iconStyles(library) : { styles: [] }
  const [pickedStyle, setStyle] = useState<string>()
  const style = pickedStyle && styles.includes(pickedStyle) ? pickedStyle : initial
  const [query, setQuery] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  // As many square cells as fit the row whole, each as wide as the row's share; rows are whole pixels tall, so icons stay
  // sharp as they scroll.
  const [grid, setGrid] = useState({ columns: 4, cell: iconCell })
  const { columns } = grid

  useLayoutEffect(() => {
    const element = scrollRef.current

    if (!element) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      const width = entry!.contentRect.width
      const fit = Math.max(1, Math.floor(width / iconCell))
      const cell = Math.max(iconCell, Math.floor(width / fit))
      setGrid((current) => (current.columns === fit && current.cell === cell ? current : { columns: fit, cell }))
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [library])

  const catalog = useMemo(
    () => (library ? iconCatalog(session.loaded, library, style) : undefined),
    [session.loaded, library, style]
  )

  const all = catalog?.entries ?? []
  const matches = useMemo(() => (catalog ? catalog.search(query) : []), [catalog, query])

  // The app doesn't use the React Compiler, whose memoizing this rule guards against; the virtualizer is used here only.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: Math.ceil(matches.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => grid.cell,
    overscan: 8
  })

  // Rows change height with the panel's width; the virtualizer keeps the heights it measured until told.
  useLayoutEffect(() => virtualizer.measure(), [virtualizer, grid.cell])

  if (!library) {
    return (
      <div className="type-empty flex flex-col items-center gap-3 px-6 py-10 text-center text-muted-foreground">
        <Smile className="size-6" />
        <p>
          Add an icon library to drop icons into screens and components. They render with the project&apos;s own copy.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void installLibrary(session.id, { id: "lucide", name: "Lucide" })}>
            <Plus /> Add Lucide
          </Button>
          <AddIconSet
            trigger={
              <Button size="sm" variant="outline">
                Choose another
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <>
      {(sets.length > 1 || styles.length > 0) && (
        <div className="flex gap-2 px-2 pt-2">
          {sets.length > 1 && (
            <select
              value={library.id}
              onChange={(event) => {
                const id = event.currentTarget.value
                shownIconSets.set(session.id, id)
                setChosen(id)
              }}
              aria-label="Icon set"
              className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs"
            >
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          )}
          {styles.length > 0 && (
            <select
              value={style}
              onChange={(event) => setStyle(event.currentTarget.value)}
              aria-label="Icon style"
              className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs capitalize"
            >
              {styles.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="flex items-center gap-1 pr-2">
        <div className="flex-1">
          <SearchField
            value={query}
            onChange={(value) => {
              setQuery(value)
              scrollRef.current?.scrollTo({ top: 0 })
            }}
            placeholder={`Search ${all.length} ${iconsOf(library)}`}
          />
        </div>
        <AddIconSet />
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
        {matches.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {all.length === 0 ? `${library.name} has no icons Parity can list yet.` : "No icon matches."}
          </p>
        )}
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              className="absolute inset-x-0 top-0 grid"
              style={{
                height: grid.cell,
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
              }}
            >
              {matches.slice(row.index * columns, (row.index + 1) * columns).map(({ label, item }) => (
                <Hint key={item.component} label={label}>
                  <button
                    type="button"
                    {...dragItem(item)}
                    onClick={() => addAtSelection(session, item)}
                    aria-label={label}
                    className="grid cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
                  >
                    <GuestIcon loaded={session.loaded} item={item} size={iconSize} />
                  </button>
                </Hint>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
