import { z } from "zod"
import { type FileObject, fileText, type JsonValue, objectToChange, parseObject } from "./json-object.ts"

/** A window's entry has no update for this long when the copy that kept it is gone, in milliseconds. */
export const goneAfterMs = 30_000

/** Entries not updated for this long are removed, in milliseconds. */
export const keepEntriesMs = 7 * 24 * 60 * 60 * 1000

/** What `state.json` keeps for the window itself, read and checked by the part of the window that owns it. */
export const stateKeys = ["layout", "recentSearches"] as const

export type StateKey = (typeof stateKeys)[number]

/** The tabs a window has open, to reopen next time. */
export interface SavedTabs {
  /** The projects open in tabs, in the strip's order. */
  roots: string[]
  /** The root of the tab that was showing, or Home. */
  active?: string
}

/** A window's tabs, and when the copy that has them last said so. */
export interface WindowEntry extends SavedTabs {
  at: number
}

/** `state.json`: what the app remembers for itself, with no setting behind it. */
export interface AppState {
  /** Each key's value as saved, for the part of the window that owns it to read. */
  values: Partial<Record<StateKey, JsonValue>>
  /** Each window's tabs, by an ID of its own (`docs/proposals/settings.md`, Open tabs across copies). */
  windows: Record<string, WindowEntry>
}

/** One change to the state. `at` is when it's made. */
export type StateChange =
  | { kind: "set"; key: StateKey; value: JsonValue }
  /** A window's tabs now; also said every few seconds while the copy runs, so a copy that's gone is known. */
  | { kind: "tabs"; id: string; tabs: SavedTabs; at: number }
  /** A window starting takes the tabs of the newest copy that's gone, or an empty entry when there's none. */
  | { kind: "claim"; id: string; at: number }

const entry = z
  .object({
    roots: z
      .array(z.string().catch(""))
      .catch([])
      .transform((roots) => roots.filter(Boolean)),
    active: z.string().optional().catch(undefined),
    at: z.number().finite()
  })
  .transform(({ roots, active, at }): WindowEntry => (active === undefined ? { roots, at } : { roots, active, at }))

function stateOf(object: FileObject): AppState {
  const values: AppState["values"] = {}

  for (const key of stateKeys) {
    const value = object[key]

    if (value !== undefined) {
      values[key] = value
    }
  }

  const windows: AppState["windows"] = {}
  const saved = z.record(z.string(), z.unknown()).catch({}).parse(object["windows"])

  for (const [id, value] of Object.entries(saved)) {
    const read = entry.safeParse(value)

    if (read.success) {
      windows[id] = read.data
    }
  }

  return { values, windows }
}

/** What `state.json` gives, or why it couldn't be read. */
export interface ReadState {
  values: AppState
  problem?: string
}

/** The state `text` holds, from `state.json`, or none when there's no file. A window entry that doesn't read is dropped. */
export function readState(text: string | undefined): ReadState {
  const parsed = parseObject("state.json", text)

  if ("problem" in parsed) {
    return { values: { values: {}, windows: {} }, problem: parsed.problem }
  }

  return { values: stateOf(parsed.object) }
}

/** The window entries without those not updated for a week, as of `now`. */
function fresh(windows: AppState["windows"], now: number): AppState["windows"] {
  return Object.fromEntries(Object.entries(windows).filter(([, { at }]) => now - at < keepEntriesMs))
}

/** The state after one change. */
export function changeStateData(before: AppState, change: StateChange): AppState {
  if (change.kind === "set") {
    return { ...before, values: { ...before.values, [change.key]: change.value } }
  }

  const windows = fresh(before.windows, change.at)

  if (change.kind === "tabs") {
    return { ...before, windows: { ...windows, [change.id]: { ...change.tabs, at: change.at } } }
  }

  const own = windows[change.id]

  if (own) {
    return { ...before, windows: { ...windows, [change.id]: { ...own, at: change.at } } }
  }

  const gone = Object.entries(windows)
    .filter(([, { at }]) => change.at - at >= goneAfterMs)
    .sort(([, a], [, b]) => b.at - a.at)[0]

  if (!gone) {
    return { ...before, windows: { ...windows, [change.id]: { roots: [], at: change.at } } }
  }

  const [goneId, tabs] = gone
  const rest = Object.fromEntries(Object.entries(windows).filter(([id]) => id !== goneId))

  return { ...before, windows: { ...rest, [change.id]: { ...tabs, at: change.at } } }
}

/**
 * `state.json`'s text after one change, with every key it doesn't know as it was. Throws for text that doesn't parse,
 * which must never be written over.
 */
export function changeState(text: string | undefined, change: StateChange): string {
  const object = objectToChange("state.json", text)
  const after = changeStateData(stateOf(object), change)
  const windows = Object.fromEntries(Object.entries(after.windows).map(([id, tabs]) => [id, { ...tabs }]))

  return fileText({ ...object, ...after.values, windows })
}
