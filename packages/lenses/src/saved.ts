import { z } from "zod"
import type { Layout, Where } from "./layout.ts"
import { barOrder, type Lens } from "./lens.ts"

/** A rectangle on the screen: where a lens's own window was. */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Which way a split lays its parts: side by side, or one above another. */
export type Across = "row" | "column"

/**
 * How the main window's groups are split: a group, named by `G`, or parts laid across a row or down a column. A part's
 * size is along its split, and only its share of the split's whole counts.
 */
export type Split<G = number> = { group: G; size?: number } | Parted<G>

/** A split of parts laid across a row or down a column. */
export interface Parted<G = number> {
  across: Across
  size?: number
  parts: Split<G>[]
}

/** Where a layout's groups are, by the dock's ids: how the main window's are split, and where each window is. */
export interface Arrangement {
  splits?: Split<string>
  windows?: Record<string, Bounds>
}

const size = z.number().positive().optional()

const bounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
})

const split: z.ZodType<Split> = z.lazy(() =>
  z.union([
    z.object({ group: z.number().int().nonnegative(), size }),
    z.object({ across: z.enum(["row", "column"]), size, parts: z.array(split) })
  ])
)

const savedGroup = z.object({
  where: z.enum(["main", "window"]),
  tabs: z.array(z.string()),
  open: z.string().optional(),
  // A window's place that can't be read is left out, rather than losing the layout over it.
  bounds: bounds.optional().catch(undefined)
})

/** What a saved layout is read with: its groups in order, with the one in focus by its place in the list. */
export const savedLayoutSchema = z.object({
  groups: z.array(savedGroup),
  focus: z.number().int().nonnegative().optional(),
  // Splits that can't be read lay the main window's groups out in a row instead.
  splits: split.optional().catch(undefined)
})

/** A group of tabs as a project keeps it, with where its window was when it has one of its own. */
export interface SavedGroup<Id extends string = string> {
  where: Where
  tabs: Id[]
  open?: Id
  bounds?: Bounds
}

/**
 * A layout as a project keeps it: its groups in order, with the one in focus by its place in the list, and how the main
 * window's are split, each named by its place in the list. Without splits, they're side by side.
 */
export interface SavedLayout<Id extends string = string> {
  groups: SavedGroup<Id>[]
  focus?: number
  splits?: Split
}

const json = z.json()

/** Any JSON, as a saved layout comes from a file. */
export type JsonValue = z.infer<typeof json>

/**
 * A layout to keep: groups with no tabs left out, and the dock's ids, which a new dock won't have, swapped for each
 * group's place in the list. `arranged` adds how the main window's groups are split and where each window is.
 */
export function saveLayout<Id extends string>(layout: Layout<Id>, arranged: Arrangement = {}): SavedLayout<Id> {
  const kept = layout.groups.filter((group) => group.tabs.length > 0)
  const focus = kept.findIndex((group) => group.id === layout.focus)

  const groups = kept.map(({ id, where, tabs, open }): SavedGroup<Id> => {
    const group: SavedGroup<Id> = open === undefined ? { where, tabs } : { where, tabs, open }
    const place = where === "window" ? arranged.windows?.[id] : undefined

    return place ? { ...group, bounds: place } : group
  })

  const saved: SavedLayout<Id> = focus >= 0 ? { groups, focus } : { groups }
  const index = new Map(kept.map((group, place) => [group.id, place]))
  const splits = arranged.splits && rename(arranged.splits, (id) => index.get(id))

  return splits && splitsFit(splits, groups) ? { ...saved, splits } : saved
}

/** The layout a project opens on before it has one of its own: its first lens, alone in the main window. */
export function defaultLayout<Id extends string>(lenses: readonly Lens<Id>[]): SavedLayout<Id> {
  const first = barOrder(lenses)[0]

  return first ? { groups: [{ where: "main", tabs: [first.id], open: first.id }], focus: 0 } : { groups: [] }
}

/**
 * Reads a saved layout for the lenses there are now. Lenses that are gone are dropped, with their groups once empty,
 * and a lens is kept in the first group that has it. A group's tab in front falls back to its first, and focus to the
 * first group. The splits close over a group that's gone, as Dockview's do when one closes, and ones that don't fit
 * the groups left are dropped, which lays them out side by side. One that can't be read, or that had lenses and has
 * none left, falls back to `fallback`, the project's default layout. One saved with every tab closed stays that way.
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
  const kept: { group: SavedGroup<Id>; from: number }[] = []

  for (const [from, group] of read.data.groups.entries()) {
    const tabs: Id[] = []

    // Each lens is placed as it's read, so one listed twice, in this group or an earlier one, stays where it was first.
    for (const tab of group.tabs) {
      const id = known.get(tab)

      if (id !== undefined && !placed.has(id)) {
        placed.add(id)
        tabs.push(id)
      }
    }

    if (tabs.length > 0) {
      const open = tabs.find((tab) => tab === group.open) ?? tabs[0]!
      // Only a lens's own window has a place on the screen.
      const place = group.where === "window" ? group.bounds : undefined
      kept.push({
        group: place ? { where: group.where, tabs, open, bounds: place } : { where: group.where, tabs, open },
        from
      })
    }
  }

  const hadTabs = read.data.groups.some((group) => group.tabs.length > 0)

  if (kept.length === 0) {
    return hadTabs ? fallback : { groups: [] }
  }

  const focus = kept.findIndex(({ from }) => from === read.data.focus)
  const groups = kept.map(({ group }) => group)
  const layout: SavedLayout<Id> = { groups, focus: Math.max(focus, 0) }
  const moved = new Map(kept.map(({ from }, place) => [from, place]))
  const splits = read.data.splits && rename(read.data.splits, (from) => moved.get(from))

  return splits && splitsFit(splits, groups) ? { ...layout, splits } : layout
}

/**
 * The splits with each group renamed, those `name` has no name for closed over: a split left with one part becomes
 * that part, in its place and at its size, and one inside a split the same way joins its parts to it, keeping their
 * shares of the room.
 */
function rename<From, To>(splits: Split<From>, name: (group: From) => To | undefined): Split<To> | undefined {
  if ("group" in splits) {
    const group = name(splits.group)

    return group === undefined ? undefined : sized({ group }, splits.size)
  }

  const parts = splits.parts.flatMap((part): Split<To>[] => {
    const renamed = rename(part, name)

    if (renamed === undefined) {
      return []
    }

    if ("across" in renamed && renamed.across === splits.across) {
      return within(renamed)
    }

    return [renamed]
  })

  if (parts.length === 0) {
    return undefined
  }

  if (parts.length === 1) {
    return sized(withoutSize(parts[0]!), splits.size)
  }

  return sized({ across: splits.across, parts }, splits.size)
}

/** A split's parts, sized to share its own size between them as they shared the split, to join a split like it. */
function within<G>(split: Parted<G>): Split<G>[] {
  const whole = split.size

  if (whole === undefined || split.parts.some((part) => part.size === undefined)) {
    return split.parts.map(withoutSize)
  }

  const total = split.parts.reduce((sum, part) => sum + part.size!, 0)

  return split.parts.map((part) => ({ ...part, size: (part.size! / total) * whole }))
}

function sized<S extends Split<unknown>>(split: S, size: number | undefined): S {
  return size === undefined ? split : { ...split, size }
}

function withoutSize<S extends Split<unknown>>(split: S): S {
  const rest = { ...split }
  delete rest.size

  return rest
}

/** Whether the splits hold every group in the main window once, and no other. */
function splitsFit(splits: Split, groups: readonly SavedGroup[]): boolean {
  const named: number[] = []
  const collect = (split: Split) => ("group" in split ? named.push(split.group) : split.parts.forEach(collect))
  collect(splits)

  const main = groups.flatMap((group, place) => (group.where === "main" ? [place] : []))

  return named.length === main.length && new Set(named).size === named.length && main.every((n) => named.includes(n))
}
