import { cn } from "@buildkitgg/shadcn-baseui-kit"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@buildkitgg/shadcn-baseui-kit"
// The list is ARIA's combobox pattern: focus stays in the search field, which takes the keys and points at the active
// option with aria-activedescendant, so the options are neither focusable nor keyed, and they're divs, which a
// virtualized list draws and a native select can't hold.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */
import type { DesignNode, LibraryInfo } from "@parity-app/core"
import {
  componentUses,
  type InsertItem,
  type InsertOption,
  type InsertOrigin,
  type InsertRow,
  insertRows
} from "@parity-app/editor"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Columns3, Component, Diamond, Rows3, SearchIcon, Shapes, Type } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react"
import { toast } from "sonner"
import { placeLayers } from "../canvas/clipboard.ts"
import { insertAtSelection } from "../canvas/insert.ts"
import { kindColors } from "../canvas/kinds.tsx"
import { usePreviewOnScreen } from "../component-previews.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { type ProjectSession, workspace } from "../workspace.ts"
import { componentSources, useComponentCard } from "./AssetsPanel.tsx"
import { activeSession } from "./commands.ts"
import { ComponentCard, PreviewThumb } from "./ComponentCard.tsx"
import {
  GuestIcon,
  type IconCatalog,
  type IconEntry,
  iconCatalog,
  iconLibraries,
  iconStyles,
  iconsOf
} from "./icons.tsx"

let open = false
const listeners = new Set<() => void>()

function setOpen(next: boolean): void {
  open = next
  for (const listener of listeners) listener()
}

/** Closes the insert picker, as when it failed and was closed (PAR-667). */
export function closeQuickInsert(): void {
  setOpen(false)
}

/** Opens the insert picker for the active tab: `/` or Shift+I on the canvas. */
export function openQuickInsert(): void {
  if (activeSession()) setOpen(true)
}

/** The most icons the picker lists for a search; the Icons panel has them all. */
const iconLimit = 48

/** Layers every design can use, whatever its components: text, and layouts in each direction. */
const basics: { id: string; label: string; icon: typeof Type; node: () => DesignNode }[] = [
  { id: "text", label: "Text", icon: Type, node: () => ({ type: "text", id: "text", text: "Text" }) },
  {
    id: "column",
    label: "Vertical layout",
    icon: Rows3,
    node: () => ({ type: "layout", id: "column", style: { gap: 2 }, children: [] })
  },
  {
    id: "row",
    label: "Horizontal layout",
    icon: Columns3,
    node: () => ({ type: "layout", id: "row", style: { direction: "row", gap: 2, align: "center" }, children: [] })
  }
]

/** What picking an option does: place a basic layer, or insert a component or design. */
type Action = { kind: "basic"; basic: (typeof basics)[number] } | { kind: "item"; item: InsertItem }

/** Everything the picker offers a project, built once for what the project lists now. */
interface Offer {
  options: InsertOption[]
  actions: Map<string, Action>
}

/**
 * Each session's offer, kept while its project info and its component designs stay the same, so opening the picker
 * builds nothing (PAR-178). Edits to designs change every entry but none of this, so the designs are compared by their
 * keys and names. It's kept by the project's info, which is replaced when its components or libraries change (the
 * session itself is replaced whenever any part of it does), and goes with it.
 */
const offers = new WeakMap<ProjectSession["info"], { designs: string; offer: Offer }>()

function offerOf(session: ProjectSession, entries: readonly ContainerEntry[]): Offer {
  const designs = entries
    .map(({ key, container }) => `${key} ${container.id} ${container.kind ?? ""} ${container.name}`)
    .join("\n")
  const kept = offers.get(session.info)
  if (kept?.designs === designs) return kept.offer
  const options: InsertOption[] = []
  const actions = new Map<string, Action>()
  for (const basic of basics) {
    const key = `basic:${basic.id}`
    options.push({ key, name: basic.label, origin: "basic", source: "basics", sourceName: "Basics" })
    actions.set(key, { kind: "basic", basic })
  }
  for (const source of componentSources(session.info, entries)) {
    for (const family of source.families) {
      for (const entry of family.items) {
        // A design and a component can share a name, never a key.
        const key = entry.item.kind === "instance" ? `design:${source.id}/${entry.key}` : entry.key
        const origin: InsertOrigin = source.library && entry.item.kind === "instance" ? "library-design" : source.origin
        options.push({
          key,
          name: entry.label,
          origin,
          source: source.id,
          sourceName: source.title,
          ...(family.name ? { description: family.name } : {}),
          ...(entry.hidden ? { hidden: entry.hidden } : {})
        })
        actions.set(key, { kind: "item", item: entry.item })
      }
    }
  }
  const offer = { options, actions }
  offers.set(session.info, { designs, offer })
  return offer
}

/** Each session's icon sets in the style each shows first, kept while its libraries stay the same. */
const iconSetCache = new WeakMap<
  ProjectSession["loaded"],
  { libraries: unknown; sets: { library: LibraryInfo; catalog: IconCatalog }[] }
>()

function iconSetsOf(session: ProjectSession): { library: LibraryInfo; catalog: IconCatalog }[] {
  const kept = iconSetCache.get(session.loaded)
  if (kept?.libraries === session.info.libraries) return kept.sets
  const sets = iconLibraries(session.info.libraries).map((library) => ({
    library,
    catalog: iconCatalog(session.loaded, library, iconStyles(library).initial)
  }))
  iconSetCache.set(session.loaded, { libraries: session.info.libraries, sets })
  return sets
}

/**
 * Inserts anything without leaving the keyboard: basic layers, component designs, the project's and its libraries'
 * components, and icons. It goes where a paste would: into the selected layout, after the selected layers, or into
 * the selected design.
 */
export function QuickInsert() {
  const isOpen = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open
  )
  const session = isOpen ? activeSession() : undefined
  const info = useSyncExternalStore(workspace.subscribe, () => activeSession()?.info)
  // The list is built while the window is idle after a project opens or its components change, so even the first `/`
  // finds it ready.
  useEffect(() => {
    if (!info) return undefined
    const ready = requestIdleCallback(() => {
      const idle = activeSession()
      if (!idle) return
      offerOf(idle, idle.store.getEntries())
      // Listing a set's icons asks the project's own copy of it, 40 to 50ms for Lucide's 1,900.
      iconSetsOf(idle)
    })
    return () => cancelIdleCallback(ready)
  }, [info])
  // The picker is in the page only while it's open. Base UI keeps a closed dialog and its backdrop until it has seen
  // the closing animation end, a frame or two after its 100ms, and the backdrop took the clicks meant for the canvas
  // until then: in a window in the background, where frames come about once a second, for over a second (PAR-554).
  // The list left the moment the picker closed, so the animation only faded out the backdrop and an empty box.
  if (!session) return null
  return (
    // Not modal: a modal dialog locks the page's scrolling, hides everything else from screen readers and stops the
    // pointer on the body, which restyled all of the window's 6,000 elements to open it, 100 to 150ms of the 400ms the
    // picker took (PAR-178). The kit's backdrop, which Base UI draws for a dialog that isn't modal too, takes the clicks
    // outside instead, and the search field keeps Tab.
    <Dialog open onOpenChange={setOpen} modal={false}>
      <DialogContent
        // Room for the list and, beside it, the highlighted component's card (PAR-208).
        className="top-1/4 max-w-xl translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 md:max-w-[56rem]"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Insert</DialogTitle>
          <DialogDescription>Search for a layer, component or icon to insert</DialogDescription>
        </DialogHeader>
        <InsertList session={session} />
      </DialogContent>
    </Dialog>
  )
}

/** A line of the list: a heading, a row to insert, an icon to insert, or a hint. */
type Line =
  | { type: "heading"; key: string; label: string }
  | { type: "row"; key: string; row: InsertRow }
  | { type: "icon"; key: string; library: LibraryInfo; entry: IconEntry }
  | { type: "hint"; key: string; text: string; count: number }

/** How tall each kind of line is drawn, so only the lines in view are. */
const lineHeights: Record<Line["type"], number> = { heading: 28, row: 36, icon: 32, hint: 32 }
/** The list's height: 24rem, as before. */
const listHeight = 384

/**
 * The list draws only the lines in view, so it opens as quickly with 600 components as with ten. Its rows come from
 * `insertRows` (`@parity-app/editor`), which ranks, hides and merges them.
 */
function InsertList({ session }: { session: ProjectSession }) {
  const entries = useContainerEntries(session.store)
  const offer = offerOf(session, entries)
  const iconSets = iconSetsOf(session)
  const iconCount = iconSets.reduce((sum, set) => sum + set.catalog.entries.length, 0)
  const [query, setQuery] = useState("")
  const search = query.trim()
  const rows = useMemo(() => insertRows(offer.options, search), [offer, search])
  const icons = useMemo(
    () =>
      search.length >= 2
        ? iconSets
            .map(({ library, catalog }) => ({ library, entries: catalog.search(search).slice(0, iconLimit) }))
            .filter((set) => set.entries.length > 0)
        : [],
    [iconSets, search]
  )
  const lines = useMemo(() => {
    const list: Line[] = []
    let heading = ""
    for (const row of rows) {
      // Browsing, rows sit under their source; a search ranks them across sources, each row naming its own.
      const source = row.options[0]!.sourceName
      // A source can come round again, as a library's designs and its components, so its key has its place too.
      if (!search && source !== heading) {
        list.push({ type: "heading", key: `heading:${list.length}:${source}`, label: source })
      }
      heading = source
      list.push({ type: "row", key: row.key, row })
    }
    for (const { library, entries: found } of icons) {
      list.push({ type: "heading", key: `heading:icons:${library.id}`, label: iconsOf(library) })
      for (const entry of found) list.push({ type: "icon", key: `icon:${entry.item.component}`, library, entry })
    }
    if (iconCount > 0 && search.length < 2) {
      list.push({ type: "hint", key: "hint", text: `Type to search ${iconCount} icons too`, count: iconCount })
    }
    return list
  }, [rows, icons, iconCount, search])
  const choices = useMemo(
    () => lines.flatMap((line, index) => (line.type === "row" || line.type === "icon" ? [index] : [])),
    [lines]
  )
  const [active, setActive] = useState(0)
  // A new search starts at its best match.
  const [searched, setSearched] = useState(search)
  if (searched !== search) {
    setSearched(search)
    setActive(0)
  }
  const current = choices.length > 0 ? choices[Math.min(active, choices.length - 1)] : undefined

  const scroller = useRef<HTMLDivElement>(null)
  // The app doesn't use the React Compiler, whose memoizing this rule guards against.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => lineHeights[lines[index]!.type],
    getItemKey: (index) => lines[index]!.key,
    // The list's size before it's measured, so its first frame already draws the rows in view.
    initialRect: { width: 560, height: listHeight },
    overscan: 6
  })
  useLayoutEffect(() => {
    if (current !== undefined) virtualizer.scrollToIndex(current, { align: "auto" })
  }, [current, virtualizer])

  // The highlighted row's component, whose card shows beside the list.
  const highlighted = current === undefined ? undefined : lines[current]
  const action = highlighted?.type === "row" ? offer.actions.get(highlighted.row.options[0]!.key) : undefined
  const component = action?.kind === "item" && action.item.kind === "component" ? action.item.component : undefined
  const uses = useMemo(() => componentUses(entries.map((entry) => entry.container.root)), [entries])

  const run = (key: string) => {
    const action = offer.actions.get(key)
    if (action?.kind === "basic") insertBasic(session, action.basic)
    else if (action) insert(session, action.item)
  }
  const pick = (line: Line | undefined) => {
    if (line?.type === "row") run(line.row.key)
    else if (line?.type === "icon") insert(session, line.entry.item)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[event.key]
    if (move !== undefined && choices.length > 0) {
      event.preventDefault()
      const at = Math.min(active, choices.length - 1)
      // The arrows go round from one end to the other; a page stops at the ends.
      const next = Math.abs(move) === 1 ? (at + move + choices.length) % choices.length : at + move
      setActive(Math.max(0, Math.min(choices.length - 1, next)))
    } else if (event.key === "Tab") {
      // Nothing else in the picker takes focus, and the window behind it shouldn't while it's open.
      event.preventDefault()
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault()
      pick(current === undefined ? undefined : lines[current])
    }
  }

  const listId = useId()
  const optionId = (index: number) => `${listId}-${index}`
  return (
    <div className="flex text-popover-foreground">
      <div className="flex min-w-0 flex-1 flex-col p-1">
        <div className="p-1 pb-0">
          <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
            <InputGroupInput
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={current === undefined ? undefined : optionId(current)}
              aria-label="Insert a layer, component or icon"
              // The field takes the keys as it opens. Base UI moves focus into a dialog a frame later, and until then the
              // canvas had the keys: Escape selected the parent and left the picker open, in a window in the background
              // for up to a second (PAR-554).
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={onKeyDown}
              placeholder="Insert a layer, component or icon"
              className="h-auto text-sm"
              spellCheck={false}
              autoComplete="off"
            />
            <InputGroupAddon>
              <SearchIcon className="size-4 shrink-0 opacity-50" />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div
          ref={scroller}
          id={listId}
          role="listbox"
          aria-label="Layers, components and icons"
          className="no-scrollbar mt-1 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-1 outline-none"
          style={{ maxHeight: listHeight }}
        >
          {choices.length === 0 ? (
            <p className="py-6 text-center text-sm">Nothing matches.</p>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtual) => {
                const line = lines[virtual.index]!
                const style = { transform: `translateY(${virtual.start}px)`, height: virtual.size }
                const place = "absolute top-0 left-0 w-full"
                if (line.type === "heading") {
                  return (
                    <div
                      key={line.key}
                      role="presentation"
                      className={cn(place, "flex items-end px-2 pb-1.5 text-xs font-medium text-muted-foreground")}
                      style={style}
                    >
                      {line.label}
                    </div>
                  )
                }
                if (line.type === "hint") {
                  return (
                    <p
                      key={line.key}
                      role="presentation"
                      className={cn(place, "flex items-center gap-1.5 px-2 text-xs text-muted-foreground")}
                      style={style}
                    >
                      <Shapes className="size-3.5" /> {line.text}
                    </p>
                  )
                }
                const selected = virtual.index === current
                const choose = () => setActive(choices.indexOf(virtual.index))
                return (
                  <div
                    key={line.key}
                    id={optionId(virtual.index)}
                    role="option"
                    aria-selected={selected}
                    // Only the lines in view are drawn, so each says where it is in the whole list.
                    aria-setsize={choices.length}
                    aria-posinset={choices.indexOf(virtual.index) + 1}
                    data-selected={selected || undefined}
                    // The pointer picks what it's over, as the arrows do; the input keeps the keys.
                    onMouseMove={selected ? undefined : choose}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(line)}
                    className={cn(
                      place,
                      "flex cursor-default items-center gap-2 rounded-lg px-2 text-sm select-none data-selected:bg-muted data-selected:text-foreground"
                    )}
                    style={style}
                  >
                    {line.type === "icon" ? (
                      <>
                        <GuestIcon loaded={session.loaded} item={line.entry.item} />
                        <span className="truncate">{line.entry.label}</span>
                      </>
                    ) : (
                      <RowContent
                        session={session}
                        row={line.row}
                        component={componentOf(offer, line.row)}
                        searching={!!search}
                        onPick={(key) => run(key)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {component && <PickerCard session={session} component={component} uses={uses.get(component) ?? 0} />}
    </div>
  )
}

/** The component a row inserts first, when it's one of the project's or a library's components. */
function componentOf(offer: Offer, row: InsertRow): string | undefined {
  const action = offer.actions.get(row.options[0]!.key)
  return action?.kind === "item" && action.item.kind === "component" ? action.item.component : undefined
}

/**
 * The highlighted component's card, beside the list, following the keyboard (PAR-208): its picture, its variants and
 * where it's from. Enter inserts it, so the card has no Insert of its own. It's left out of a narrow window.
 */
function PickerCard({ session, component, uses }: { session: ProjectSession; component: string; uses: number }) {
  const { about } = useComponentCard(session, component, true)
  const close = (open: (() => void) | undefined) =>
    open &&
    (() => {
      setOpen(false)
      open()
    })
  return (
    <aside
      aria-label="Highlighted component"
      className="hidden w-80 shrink-0 overflow-y-auto border-l bg-popover text-sm md:block"
      style={{ maxHeight: listHeight + 44 }}
    >
      <ComponentCard
        // A new component's card starts afresh, without the last one's variant pointed at.
        key={component}
        name={component}
        {...about}
        uses={uses}
        onOpenFile={close(about.onOpenFile)}
        onOpenStorybook={close(about.onOpenStorybook)}
      />
    </aside>
  )
}

/** A component row's picture, made before the rest while the row is in view (PAR-207). */
function RowPicture({ session, component }: { session: ProjectSession; component: string }) {
  const { pictured } = useComponentCard(session, component, false)
  const onScreen = usePreviewOnScreen(session.id, component)
  return (
    // A picture rather than text, so it's a box beside the row's words, not one of them.
    <div ref={onScreen} className="flex shrink-0">
      <PreviewThumb status={pictured} width={44} height={28} />
    </div>
  )
}

function originIcon(origin: InsertOrigin, key: string): ReactNode {
  if (origin === "basic") {
    const Icon = basics.find((basic) => `basic:${basic.id}` === key)?.icon ?? Type
    return <Icon className="size-4 shrink-0" />
  }
  if (origin === "design" || origin === "library-design") {
    return <Diamond className="size-4 shrink-0" style={{ color: kindColors.component }} />
  }
  return <Component className="size-4 shrink-0" style={{ color: kindColors.component }} />
}

/**
 * A row's icon and name, and on the right where it's from. Browsing, that's the file it's in, and any other source
 * that has one of its name; searching, it's each source, the first being what Enter inserts, and a click on another
 * inserts that one.
 */
function RowContent({
  session,
  row,
  component,
  searching,
  onPick
}: {
  session: ProjectSession
  row: InsertRow
  component: string | undefined
  searching: boolean
  onPick: (key: string) => void
}) {
  const [first, ...others] = row.options
  const described = first!.description && first!.description.toLowerCase() !== row.name.toLowerCase()
  let detail: ReactNode = null
  if (searching && first!.origin !== "basic") {
    detail = (
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {row.options.map((option, index) => (
          <button
            key={option.key}
            type="button"
            tabIndex={-1}
            aria-label={`Insert ${row.name} from ${option.sourceName}`}
            onClick={(event) => {
              event.stopPropagation()
              onPick(option.key)
            }}
            className={cn(
              "rounded px-1.5 py-0.5 text-xs",
              index === 0 ? "bg-background/60 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.sourceName}
          </button>
        ))}
      </span>
    )
  } else if (others.length > 0) {
    detail = (
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        Also in {others.map((option) => option.sourceName).join(" and ")}
      </span>
    )
  } else if (described) {
    detail = <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">{first!.description}</span>
  }
  return (
    <>
      {component ? (
        <RowPicture session={session} component={component} />
      ) : (
        // As wide as a picture, so every row's name starts in one place.
        <div className="grid w-11 shrink-0 place-items-center">{originIcon(first!.origin, first!.key)}</div>
      )}
      <span className="truncate">{row.name}</span>
      {detail}
    </>
  )
}

function insert(session: ProjectSession, item: InsertItem): void {
  setOpen(false)
  if (!insertAtSelection(session, item, "quickInsert")) toast.info("Select a layout, or a layer to add it after")
}

function insertBasic(session: ProjectSession, { node: make, label }: (typeof basics)[number]): void {
  setOpen(false)
  const node = make()
  const placed = placeLayers(session, [node], `Add ${label.toLowerCase()}`)
  // A new text layer is ready to type into, as with the text tool.
  if (placed && node.type === "text") {
    const editing = { design: placed.design, node: placed.ids[0]!, ...placed.frame }
    requestAnimationFrame(() => requestAnimationFrame(() => session.selection.setEditing(editing)))
  }
}
