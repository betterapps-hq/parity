import { z } from "zod"
import type { Layout, Where } from "./layout.ts"
import { barOrder, type Lens } from "./lens.ts"

const savedGroup = z.object({
  where: z.enum(["main", "window"]),
  tabs: z.array(z.string()),
  open: z.string().optional()
})

/** What a saved layout is read with: its groups in order, with the one in focus by its place in the list. */
export const savedLayoutSchema = z.object({
  groups: z.array(savedGroup),
  focus: z.number().int().nonnegative().optional()
})

/** A layout as a project keeps it: its groups in order, with the one in focus by its place in the list. */
export interface SavedLayout<Id extends string = string> {
  groups: { where: Where; tabs: Id[]; open?: Id }[]
  focus?: number
}

const json = z.json()

/** Any JSON, as a saved layout comes from a file. */
export type JsonValue = z.infer<typeof json>

/** A layout to keep: groups with no tabs left out, and the dock's ids, which a new dock won't have, dropped. */
export function saveLayout<Id extends string>(layout: Layout<Id>): SavedLayout<Id> {
  const kept = layout.groups.filter((group) => group.tabs.length > 0)
  const focus = kept.findIndex((group) => group.id === layout.focus)
  const groups = kept.map(({ where, tabs, open }) => (open === undefined ? { where, tabs } : { where, tabs, open }))

  return focus >= 0 ? { groups, focus } : { groups }
}

/** The layout a project opens on before it has one of its own: its first lens, alone in the main window. */
export function defaultLayout<Id extends string>(lenses: readonly Lens<Id>[]): SavedLayout<Id> {
  const first = barOrder(lenses)[0]

  return first ? { groups: [{ where: "main", tabs: [first.id], open: first.id }], focus: 0 } : { groups: [] }
}

/**
 * Reads a saved layout for the lenses there are now. Lenses that are gone are dropped, with their groups once empty,
 * and a lens is kept in the first group that has it. A group's tab in front falls back to its first, and focus to the
 * first group. One that can't be read, or that had lenses and has none left, falls back to `fallback`, the project's
 * default layout. One saved with every tab closed stays that way.
 */
export function readLayout<Id extends string>(
  saved: JsonValue | undefined,
  lenses: readonly Lens<Id>[],
  fallback = defaultLayout(lenses)
): SavedLayout<Id> {
  const read = savedLayoutSchema.safeParse(saved)

  if (!read.success) {
    return fallback
  }

  const known = new Map<string, Id>(lenses.map((lens) => [lens.id, lens.id]))
  const placed = new Set<Id>()
  const kept: { group: SavedLayout<Id>["groups"][number]; from: number }[] = []

  for (const [from, group] of read.data.groups.entries()) {
    const tabs = group.tabs.flatMap((tab) => {
      const id = known.get(tab)

      return id === undefined || placed.has(id) ? [] : [id]
    })

    for (const tab of tabs) {
      placed.add(tab)
    }

    if (tabs.length > 0) {
      const open = tabs.find((tab) => tab === group.open) ?? tabs[0]!
      kept.push({ group: { where: group.where, tabs, open }, from })
    }
  }

  const hadTabs = read.data.groups.some((group) => group.tabs.length > 0)

  if (kept.length === 0) {
    return hadTabs ? fallback : { groups: [] }
  }

  const focus = kept.findIndex(({ from }) => from === read.data.focus)

  return { groups: kept.map(({ group }) => group), focus: Math.max(focus, 0) }
}
