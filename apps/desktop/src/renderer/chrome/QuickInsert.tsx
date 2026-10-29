import type { DesignNode, LibraryInfo } from "@parity/core"
import { defaultFilter } from "cmdk"
import { Columns3, Rows3, Shapes, Type } from "lucide-react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import { placeLayers } from "../canvas/clipboard.ts"
import { type InsertItem, insertAtSelection } from "../canvas/insert.ts"
import { useContainerEntries } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { componentSources } from "./AssetsPanel.tsx"
import { activeSession } from "./commands.ts"
import { GuestIcon, type IconCatalog, iconCatalog, iconLibraries, iconStyles, iconsOf } from "./icons.tsx"

let open = false
const listeners = new Set<() => void>()

function setOpen(next: boolean): void {
  open = next
  for (const listener of listeners) listener()
}

/** Opens the insert picker for the active tab: `/` or Shift+I on the canvas. */
export function openQuickInsert(): void {
  if (activeSession()) setOpen(true)
}

/** The most icons the picker lists for a search; the Icons panel has them all. */
const iconLimit = 48

/** What starts an icon's value in the list, so its filter can tell icons from the rest. */
const iconPrefix = "icon:"

function iconValue(library: LibraryInfo, entry: { label: string }): string {
  return `${iconPrefix}${library.id}/${entry.label}`
}

/**
 * Each listed icon's place in the icon search's results, by its value in the list. The list scores items as soon as
 * the search changes, before the picker renders again, so ranks come from the search the list gives, kept for the
 * last one asked.
 */
function iconRanker(sets: { library: LibraryInfo; catalog: IconCatalog }[]): (typed: string) => Map<string, number> {
  let last: { typed: string; ranks: Map<string, number> } | undefined
  return (typed) => {
    if (last?.typed !== typed) {
      const ranks = new Map<string, number>()
      for (const { library, catalog } of sets) {
        catalog
          .search(typed)
          .slice(0, iconLimit)
          .forEach((entry, rank) => ranks.set(iconValue(library, entry), rank))
      }
      last = { typed, ranks }
    }
    return last.ranks
  }
}

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
  return (
    <CommandDialog
      open={isOpen && !!session}
      onOpenChange={setOpen}
      title="Insert"
      description="Search for a layer, component or icon to insert"
      className="max-w-xl"
    >
      {session && <InsertList session={session} />}
    </CommandDialog>
  )
}

function InsertList({ session }: { session: ProjectSession }) {
  const entries = useContainerEntries(session.store)
  const sources = useMemo(() => componentSources(session.info, entries), [session.info, entries])
  // Each icon set in the style it shows first, as the Icons panel opens on it.
  const iconSets = useMemo(
    () =>
      iconLibraries(session.info.libraries).map((library) => ({
        library,
        catalog: iconCatalog(session.loaded, library, iconStyles(library).initial)
      })),
    [session.info.libraries, session.loaded]
  )
  const iconCount = iconSets.reduce((sum, set) => sum + set.catalog.entries.length, 0)
  const [query, setQuery] = useState("")
  const search = query.trim().toLowerCase()
  const matchingIcons = useMemo(
    () =>
      search.length >= 2
        ? iconSets
            .map(({ library, catalog }) => ({ library, entries: catalog.search(search).slice(0, iconLimit) }))
            .filter((set) => set.entries.length > 0)
        : [],
    [iconSets, search]
  )
  // Icons are found by their tags and aliases too, which the list's own matching can't see, so they keep the order
  // the icon search gives them, below close matches among the components.
  const iconRanks = useMemo(() => iconRanker(iconSets), [iconSets])
  const filter = (value: string, typed: string, keywords?: string[]) => {
    if (!value.startsWith(iconPrefix)) return defaultFilter(value, typed, keywords)
    const rank = iconRanks(typed).get(value)
    return rank === undefined ? 0 : 0.6 - rank * 0.001
  }

  const insert = (item: InsertItem) => {
    setOpen(false)
    if (!insertAtSelection(session, item)) toast.info("Select a design or a layout to insert into")
  }
  const insertBasic = (make: () => DesignNode, label: string) => {
    setOpen(false)
    const node = make()
    const placed = placeLayers(session, [node], `Add ${label.toLowerCase()}`)
    // A new text layer is ready to type into, as with the text tool.
    if (placed && node.type === "text") {
      const editing = { design: placed.design, node: placed.ids[0]!, ...placed.frame }
      requestAnimationFrame(() => requestAnimationFrame(() => session.selection.setEditing(editing)))
    }
  }

  return (
    <Command loop filter={filter}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Insert a layer, component or icon" />
      <CommandList className="max-h-96">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Basics">
          {basics.map(({ id, label, icon: Icon, node }) => (
            <CommandItem key={id} value={`basic ${label}`} onSelect={() => insertBasic(node, label)}>
              <Icon /> {label}
            </CommandItem>
          ))}
        </CommandGroup>
        {sources.map((source) =>
          source.families.length === 0 ? null : (
            <CommandGroup key={source.id} heading={source.title}>
              {source.families.flatMap((family) =>
                family.items.map(({ key, label, item }) => (
                  <CommandItem
                    key={key}
                    value={`${source.title} ${family.name} ${label} ${key}`}
                    onSelect={() => insert(item)}
                  >
                    {source.icon}
                    <span>{label}</span>
                    {family.name && family.name.toLowerCase() !== label.toLowerCase() && (
                      <span className="ml-auto text-xs text-muted-foreground">{family.name}</span>
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          )
        )}
        {matchingIcons.map(({ library, entries }) => (
          <CommandGroup key={library.id} heading={iconsOf(library)}>
            {entries.map(({ label, item }) => (
              <CommandItem key={item.component} value={iconValue(library, { label })} onSelect={() => insert(item)}>
                <GuestIcon loaded={session.loaded} item={item} />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {iconCount > 0 && search.length < 2 && (
          <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
            <Shapes className="size-3.5" /> Type to search {iconCount} icons too
          </p>
        )}
      </CommandList>
    </Command>
  )
}
