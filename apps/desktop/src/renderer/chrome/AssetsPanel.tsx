import {
  type CanvasDocument,
  type ComponentRef,
  type ComponentRenderStatus,
  type ComponentRole,
  type ComponentSource,
  componentRole,
  correctDetection,
  describeEvidence,
  describeRenderStatus,
  type DetectionCorrections,
  groupComponents,
  type LeftOutExport,
  type LibraryInfo
} from "@parity-app/core"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  BookOpen,
  ChevronRight,
  CircleAlert,
  Component,
  Diamond,
  ImageIcon,
  Library,
  LoaderCircle,
  MonitorSmartphone,
  Plus,
  Search,
  Smile
} from "lucide-react"
import { type DragEvent, type ReactNode, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { useProject } from "../canvas/context.ts"
import { componentLabel, type InsertItem, insertAtSelection, insertMime } from "../canvas/insert.ts"
import { kindColors } from "../canvas/kinds.tsx"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { type ProjectSession, workspace } from "../workspace.ts"
import { Hint } from "./Hint.tsx"
import { GuestIcon, iconCatalog, iconLibraries, iconStyles, iconsOf } from "./icons.tsx"
import { announceEdit } from "./project-edits.tsx"
import { hasStories, openInStorybook } from "./storybook.ts"

/** Adds an item where the selection is, or says what to select first. */
function addAtSelection(session: ProjectSession, item: InsertItem): void {
  if (!session.selection.get().design) {
    toast.info("Select a design or layer first, or drag it onto a design")
    return
  }
  if (!insertAtSelection(session, item)) toast.info("Select a layout, or a layer to add it after")
}

/** The main project file's corrections to the component list, as the canvas has it now. */
function useCorrections(session: ProjectSession): DetectionCorrections | undefined {
  const { store } = session
  return useSyncExternalStore(
    store.subscribe,
    () => store.getDocuments().find((entry) => entry.path === store.mainPath)?.document.detection
  )
}

const noStatus: Record<string, ComponentRenderStatus> = {}
const noSubscription = () => () => undefined

/** How each component drawn so far fares on the canvas, as the guest's boundaries saw it. */
function useRenderStatus(session: ProjectSession): Record<string, ComponentRenderStatus> {
  const status = session.loaded.guest.renderStatus
  return useSyncExternalStore(status?.subscribe ?? noSubscription, status?.get ?? (() => noStatus))
}

/**
 * Puts an export on the component list, or takes a component off it, as an undoable change to the main project file,
 * saved with it. The list follows straight away.
 */
function correct(session: ProjectSession, change: "include" | "exclude", target: ComponentRef, name: string): void {
  const { store } = session
  const ref = { path: target.path, export: target.export }
  const main: CanvasDocument = store.getDocuments().find((entry) => entry.path === store.mainPath)?.document ?? {
    version: 3,
    containers: []
  }
  const { detection: _, ...rest } = main
  const detection = correctDetection(main.detection, change, ref)
  const label = change === "include" ? `List ${name} as a component` : `Take ${name} off the component list`
  store.applyDocuments(label, [{ path: store.mainPath, document: detection ? { ...rest, detection } : rest }])
}

function dragItem(item: InsertItem) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(insertMime, JSON.stringify(item))
      event.dataTransfer.effectAllowed = "copy"
    }
  }
}

function SearchField({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative px-2 pt-2">
      <Search className="pointer-events-none absolute top-1/2 left-4 mt-1 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pl-7 text-xs"
      />
    </div>
  )
}

export interface Family {
  name: string
  /** `evidence` is why it counts as a component, in words. */
  items: { key: string; label: string; item: InsertItem; evidence?: string }[]
  /** Its name is a folder or a route, shown over a single component too. */
  heading?: true
}

export interface Source {
  id: string
  title: string
  icon: ReactNode
  families: Family[]
  library?: LibraryInfo
}

/**
 * Components under headings: by the file that defines them, as shadcn groups Card, CardHeader and CardTitle, or for the
 * rest of the app, by folder or page route.
 */
function families(sources: [string, ComponentSource][], by: "file" | "folder" | "route" = "file"): Family[] {
  const evidence = new Map(
    sources.map(([key, source]) => [key, source.included ? "listed by hand" : source.as && describeEvidence(source.as)])
  )
  return groupComponents(sources, by).map((group) => ({
    name: group.name,
    items: group.ids.map((key) => ({
      key,
      label: componentLabel(key),
      item: { kind: "component", component: key },
      ...(evidence.get(key) ? { evidence: evidence.get(key) } : {})
    })),
    ...(by === "file" ? {} : { heading: true as const })
  }))
}

/** The project's own components by role: its UI kit, the rest of the app by folder, and its pages. */
function ownSources(info: ProjectInfo, all: [string, ComponentSource][]): Source[] {
  const icon = <Component className="size-3.5" style={{ color: kindColors.component }} />
  const withRole = (role: ComponentRole) => all.filter(([, source]) => componentRole(source) === role)
  const kit = withRole("kit")
  const pages = withRole("page")
  return [
    ...(kit.length > 0 ? [{ id: "project:kit", title: "UI kit", icon, families: families(kit) }] : []),
    { id: "project", title: info.name, icon, families: families(withRole("app"), "folder") },
    {
      id: "project:pages",
      title: "Pages",
      icon: <MonitorSmartphone className="size-3.5" style={{ color: kindColors.screen }} />,
      families: families(pages, "route")
    }
  ]
}

/**
 * What the Components section lists, by source: the project's component designs, its own components, then each
 * component library's. Exported for other pickers, like quick insert.
 */
export function componentSources(info: ProjectInfo, entries: readonly ContainerEntry[]): Source[] {
  const all = Object.entries(info.sources)
  const designs = entries.filter((entry) => entry.container.kind === "component")
  const list: Source[] = []
  if (designs.length > 0) {
    list.push({
      id: "designs",
      title: "Component designs",
      icon: <Diamond className="size-3.5" style={{ color: kindColors.component }} />,
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
    // Parts the library renders inside its own components come last, apart, so the list leads with what's placed.
    const internal = own.filter(([, source]) => source.internal)
    // Its ready-made compositions come first, placed as linked instances, or as copies from their menu. One a project
    // design has the id of is left out, since placing it would place the project's.
    const ownIds = new Set(entries.map((entry) => entry.container.id))
    const offered = (library.designs ?? []).filter((design) => !ownIds.has(design.id))
    const designed: Family[] = offered.length
      ? [
          {
            name: "Component designs",
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
      families: [
        ...designed,
        ...families(own.filter(([, source]) => !source.internal)),
        ...(internal.length > 0
          ? [{ name: "Internal parts", items: families(internal).flatMap((family) => family.items) }]
          : [])
      ],
      library
    })
  }
  return list
}

/** Components to drag into designs: component designs, the project's own, then each library's. */
export function ComponentsPanel() {
  const session = useProject()
  const { info, store } = session
  const entries = useContainerEntries(store)
  const [query, setQuery] = useState("")

  const sources = useMemo(() => componentSources(info, entries), [entries, info])

  const needle = query.trim().toLowerCase()
  const shown = sources
    .map((source) => ({
      ...source,
      families: source.families
        .map((family) => ({
          ...family,
          items: needle
            ? family.items.filter((entry) => entry.label.toLowerCase().includes(needle) || family.name.includes(needle))
            : family.items
        }))
        .filter((family) => family.items.length > 0)
    }))
    .filter((source) => source.families.length > 0 || (!needle && source.library))
  const corrections = useCorrections(session)
  const leftOut = needle
    ? notListed(info, corrections).filter((entry) => entry.name.toLowerCase().includes(needle))
    : []

  return (
    <>
      <div className="flex items-center gap-1 pr-2">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} placeholder="Search components" />
        </div>
        <AddLibrary kind="components" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2 text-[13px]">
        {shown.map((source) => (
          <SourceSection
            // Starting or clearing a search resets what was collapsed by hand, so matches always show.
            key={`${source.id}${needle ? " search" : ""}`}
            source={source}
            // The app's components and pages can run to hundreds, so they start closed beside other sections.
            open={!!needle || (source.id !== "project" && source.id !== "project:pages") || shown.length < 3}
          />
        ))}
        {leftOut.length > 0 && <NotListed entries={leftOut} />}
        {shown.length === 0 && leftOut.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing matches.</p>
        )}
      </div>
    </>
  )
}

/** An export that isn't listed as a component, with why; `excluded` when the person took it off the list. */
type NotListedEntry = LeftOutExport & { excluded?: true }

/**
 * The app's exports that aren't listed as components: what the type checker left out, less what the person listed,
 * and what the person took off the list.
 */
function notListed(info: ProjectInfo, corrections: DetectionCorrections | undefined): NotListedEntry[] {
  const key = (ref: ComponentRef) => `${ref.path}#${ref.export}`
  const listed = new Set(Object.values(info.sources).map(key))
  const excluded = (corrections?.exclude ?? [])
    .filter((ref) => !listed.has(key(ref)))
    .map((ref) => ({
      name: ref.export === "default" ? (ref.path.split("/").at(-1) ?? ref.path) : ref.export,
      ...ref,
      reason: "taken off the list by hand",
      excluded: true as const
    }))
  const taken = new Set(excluded.map(key))
  return [...(info.leftOut ?? []).filter((entry) => !listed.has(key(entry)) && !taken.has(key(entry))), ...excluded]
}

/**
 * The app's exports a search matches that aren't listed as components, with why, so looking for one explains itself.
 * Each can be listed by hand, which the main project file keeps.
 */
function NotListed({ entries }: { entries: NotListedEntry[] }) {
  const session = useProject()
  return (
    <section className="mt-2 border-t pt-2" aria-label="Not listed as components">
      <div className="flex h-7 items-center px-4 text-xs font-medium text-muted-foreground">Not listed</div>
      {entries.map((entry) => (
        <div
          key={`${entry.path} ${entry.export}`}
          className="flex items-start gap-2 py-1 pr-2 pl-8 text-muted-foreground"
        >
          <div className="min-w-0 flex-1">
            <Hint label={entry.path} wait>
              <div className="truncate">{entry.name}</div>
            </Hint>
            <div className="text-[11px] leading-snug">
              {entry.undecided
                ? `Can't tell: ${entry.reason}`
                : `${entry.reason.charAt(0).toUpperCase()}${entry.reason.slice(1)}`}
            </div>
          </div>
          <Hint label="List it as a component, in the project file" wait>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2 text-[11px]"
              onClick={() => correct(session, "include", entry, entry.name)}
            >
              {entry.excluded ? "List it again" : "List it"}
            </Button>
          </Hint>
        </div>
      ))}
    </section>
  )
}

/** A source's components, open to begin with when `open` says so; after that the person decides. */
function SourceSection({ source, open }: { source: Source; open: boolean }) {
  const session = useProject()
  const statuses = useRenderStatus(session)
  const [expanded, setExpanded] = useState<boolean>()
  const count = source.families.reduce((total, family) => total + family.items.length, 0)
  const isOpen = expanded ?? open
  return (
    <section className="mb-1">
      <button
        type="button"
        onClick={() => setExpanded(!isOpen)}
        aria-expanded={isOpen}
        className="flex h-7 w-full items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        {source.icon}
        <span className="min-w-0 flex-1 truncate text-left">{source.title}</span>
        <span className="tabular-nums">{count}</span>
      </button>
      {source.library && !source.library.stylesImported && <ImportStyles library={source.library} />}
      {isOpen &&
        source.families.map((family) => (
          <div key={family.name} className="mb-1">
            {family.name && (family.items.length > 1 || family.heading) && (
              <div className="px-8 pt-1 text-[11px] text-muted-foreground">{family.name}</div>
            )}
            {family.items.map((entry) => {
              const stories = entry.item.kind === "component" && hasStories(session, entry.key)
              // The project's own components can be taken off the list, which the main project file keeps.
              const own = entry.item.kind === "component" ? session.info.sources[entry.key] : undefined
              // Known once it's drawn somewhere on the canvas.
              const status = entry.item.kind === "component" ? statuses[entry.key] : undefined
              const failing = status && "error" in status
              const row = (
                <Hint
                  label={entry.evidence ? `${entry.key}, ${entry.evidence}` : entry.key}
                  detail={[
                    status && describeRenderStatus(status),
                    "Drag onto a design, or click to add it to the selection.",
                    source.library && entry.item.kind === "instance" && "Right-click to insert a detached copy."
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  wait
                >
                  <button
                    type="button"
                    {...dragItem(entry.item)}
                    onClick={() => addAtSelection(session, entry.item)}
                    className="flex h-7 w-full cursor-grab items-center gap-2 rounded-md pr-8 pl-8 text-left hover:bg-accent active:cursor-grabbing"
                  >
                    {entry.item.kind === "instance" ? (
                      <Diamond className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
                    ) : (
                      <Component className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
                    )}
                    <span className="truncate">{entry.label}</span>
                    {failing && (
                      <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-label="Fails to draw" />
                    )}
                  </button>
                </Hint>
              )
              const { item } = entry
              let menu: ReactNode
              if (own && !own.library) {
                menu = (
                  <ContextMenuItem onSelect={() => correct(session, "exclude", own, entry.key)}>
                    Not a component
                  </ContextMenuItem>
                )
              } else if (source.library && item.kind === "instance") {
                // A library's design is placed linked, following the library, or as a copy to change freely.
                menu = (
                  <>
                    <ContextMenuItem onSelect={() => addAtSelection(session, item)}>
                      Insert linked instance
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => addAtSelection(session, { ...item, detached: true })}>
                      Insert detached copy
                    </ContextMenuItem>
                  </>
                )
              }
              return (
                <div key={entry.key} className="group/asset relative">
                  {menu ? (
                    <ContextMenu>
                      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                      <ContextMenuContent className="w-52">{menu}</ContextMenuContent>
                    </ContextMenu>
                  ) : (
                    row
                  )}
                  {stories && (
                    <Hint label="Open in Storybook">
                      <button
                        type="button"
                        aria-label={`Open ${entry.label} in Storybook`}
                        onClick={() => void openInStorybook(session, entry.key)}
                        className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 group-hover/asset:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100"
                      >
                        <BookOpen className="size-3.5" />
                      </button>
                    </Hint>
                  )}
                </div>
              )
            })}
          </div>
        ))}
    </section>
  )
}

/** Installs a catalog library with the project's package manager, then reopens the tab to load it. */
async function installLibrary(session: ProjectSession, library: { id: string; name: string }): Promise<void> {
  const progress = toast.loading(`Installing ${library.name}…`, { description: "With the project's package manager" })
  try {
    await window.canvasHost.request("library.add", { projectId: session.id, library: library.id })
    toast.success(`${library.name} is ready`, { id: progress, description: undefined })
    await workspace.reload(session.id, `Loading ${library.name}`)
  } catch (error) {
    toast.error(`Couldn't install ${library.name}`, { id: progress, description: message(error).slice(-400) })
  }
}

/** The icon set each project's Icons tab shows, kept while the tab reopens to load a set just added. */
const shownIconSets = new Map<string, string>()

/** The catalog's libraries of one kind, to add to the project; `trigger` replaces the plus button that opens it. */
function AddLibrary({ kind, trigger }: { kind: "components" | "icons"; trigger?: ReactNode }) {
  const session = useProject()
  const [catalog, setCatalog] =
    useState<{ id: string; name: string; description: string; kind: "components" | "icons"; installed: boolean }[]>()
  return (
    <Popover
      onOpenChange={(open) => {
        if (open && !catalog) {
          void window.canvasHost
            .request("library.catalog", { projectId: session.id })
            .then(setCatalog, (error: unknown) =>
              toast.error("Couldn't list libraries", { description: message(error) })
            )
        }
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="mt-2"
            aria-label={kind === "icons" ? "Add an icon set" : "Add a library"}
          >
            <Plus />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          Libraries install into the project with its package manager. Any package with a <code>.lib.par</code> file is
          picked up on its own.
        </p>
        {!catalog && <LoaderCircle className="mx-auto my-3 size-4 animate-spin text-muted-foreground" />}
        <ul className="flex flex-col gap-1">
          {catalog
            ?.filter((library) => library.kind === kind)
            .map((library) => (
              <li key={library.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-accent/50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{library.name}</div>
                  <div className="text-xs text-muted-foreground">{library.description}</div>
                </div>
                <Button
                  size="sm"
                  variant={library.installed ? "ghost" : "outline"}
                  disabled={library.installed}
                  onClick={() => {
                    if (kind === "icons") shownIconSets.set(session.id, library.id)
                    void installLibrary(session, library)
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
    <div className="mx-2 mb-1 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
      Its styles aren&apos;t imported yet, so its components render unstyled.{" "}
      <button
        type="button"
        className="font-medium text-foreground underline-offset-2 hover:underline"
        onClick={() => void importStyles(session, library)}
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
export async function importStyles(session: ProjectSession, library: LibraryInfo): Promise<void> {
  try {
    const edit = await window.canvasHost.request("library.importStyles", { projectId: session.id, library: library.id })
    await workspace.reload(session.id, `Loading ${library.name}'s styles`)
    if (edit) {
      announceEdit(session.id, edit, {
        afterUndo: () => workspace.reload(session.id, `Taking out ${library.name}'s styles`)
      })
    }
  } catch (error) {
    toast.error("Couldn't import its styles", { description: message(error) })
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
    if (!element) return undefined
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
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
        <Smile className="size-6" />
        <p>Add an icon library to drop icons into designs. They render with the project&apos;s own copy.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void installLibrary(session, { id: "lucide", name: "Lucide" })}>
            <Plus /> Add Lucide
          </Button>
          <AddLibrary
            kind="icons"
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
        <AddLibrary kind="icons" />
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

/** Stock photos aren't offered yet; images come in by pasting them onto the canvas. */
export function ImagesPanel() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
      <ImageIcon className="size-6" />
      <p className="font-medium text-foreground">Stock photos are coming soon</p>
      <p>Until then, paste an image onto the canvas to add it. It&apos;s saved into the project.</p>
    </div>
  )
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
