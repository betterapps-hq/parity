import { z } from "zod"

/**
 * `keybindings.json`, the shortcuts the person changed (PAR-1085), as data in and data out: main reads and writes the
 * file with these, and the window applies what it holds to the keymap. The file is a list of `{ command, keys }`. An
 * entry's `keys` replace all of that command's keys, and `keys: []` removes them; the keymap in code stays the
 * defaults. Keys are written as the keymap writes them, as on Windows: `Ctrl Shift K`, where Ctrl is Cmd on a Mac.
 */

/** An entry as the file has it. One that isn't `{ command, keys }` is written out as text, to be skipped and listed. */
export interface KeyEntry {
  command: string
  keys: string[]
}

/** What main holds of the file and sends every window. */
export interface KeybindingsState {
  entries: KeyEntry[]
  /** Why the file couldn't be read, when it couldn't. Its entries are then none, and main won't write over it. */
  problem?: string
}

/** An entry that wasn't applied, for Settings to list: the command and keys as the file writes them. */
export interface Skipped {
  command: string
  keys: string
}

/** A command's entry to write in place of the ones it has, or `null` to remove them so it has the keymap's keys. */
export interface Replacement {
  command: string
  keys: string[] | null
}

/** The keymap, or as much of it as these need: each command's keys, which the file changes. */
export type Defaults<C extends string> = Readonly<Record<C, { readonly keys: readonly string[] }>>

/** The keys each command has with the file's changes, and what Settings shows of them. */
export interface Resolved<C extends string> {
  keys: Record<C, readonly string[]>
  /** Each command whose keys differ from the keymap's: the keys it shows, or `""` for none. */
  changed: Partial<Record<C, string>>
  /** Each command whose keys another command took, by that command. */
  lost: Partial<Record<C, C>>
  skipped: Skipped[]
}

const modifiers = ["Ctrl", "Alt", "Shift"] as const

/** Keys `matches` in `renderer/chrome/keys.ts` reads by name. */
const namedKeys = [
  "Del",
  "Backspace",
  "Esc",
  "Enter",
  "Tab",
  "Space",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "←",
  "→",
  "↑",
  "↓"
]

const punctuation = ["+", "-", "/", "?", "\\", ",", ".", "[", "]", "'", "`", ";", "="]

function keyName(key: string): string | undefined {
  if (/^[a-z0-9]$/i.test(key) || /^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) {
    return key.toUpperCase()
  }

  if (punctuation.includes(key)) {
    return key
  }

  return namedKeys.find((name) => name.toLowerCase() === key.toLowerCase())
}

/**
 * Keys as the keymap writes them, from keys as a person may: modifiers in any order and any case, each once, then one
 * key, so `shift ctrl k` reads as `Ctrl Shift K`. Nothing for keys that don't read, such as `Hyper K` or `Ctrl`.
 */
export function readKeys(written: string): string | undefined {
  const parts = written.trim().split(/\s+/)
  const key = parts.pop()
  const held = new Set<string>()

  for (const part of parts) {
    const modifier = modifiers.find((name) => name.toLowerCase() === part.toLowerCase())

    if (!modifier || held.has(modifier)) {
      return undefined
    }

    held.add(modifier)
  }

  const name = key === undefined ? undefined : keyName(key)

  return name && [...modifiers.filter((modifier) => held.has(modifier)), name].join(" ")
}

const jsonValue = z.json()

type JsonValue = z.infer<typeof jsonValue>

const fileText = z.array(jsonValue)
const wellFormed = z.object({ command: z.string(), keys: z.array(z.string()) })
const someFields = z.object({ command: jsonValue.optional(), keys: jsonValue.optional() })

/** A value as the file writes it: text as it is, anything else as JSON. */
function written(value: JsonValue | undefined): string {
  return z.string().safeParse(value).data ?? JSON.stringify(value ?? null)
}

/** An entry as Parity reads it, however it's written; one that isn't `{ command, keys }` won't apply. */
function entryOf(value: JsonValue): KeyEntry {
  const read = wellFormed.safeParse(value)

  if (read.success) {
    return read.data
  }

  const fields = someFields.safeParse(value).data

  if (!fields || fields.command === undefined) {
    return { command: written(value), keys: [] }
  }

  const keys = z.array(jsonValue).safeParse(fields.keys).data

  return { command: written(fields.command), keys: keys ? keys.map(written) : [written(fields.keys)] }
}

/** The file's list as JSON, or why it isn't one. No file, or an empty one, is an empty list. */
function listIn(text: string | undefined): { values: JsonValue[] } | { problem: string } {
  if (text === undefined || text.trim() === "") {
    return { values: [] }
  }

  let parsed: JsonValue

  try {
    parsed = jsonValue.parse(JSON.parse(text))
  } catch (error) {
    return { problem: `keybindings.json isn't JSON: ${error instanceof Error ? error.message : String(error)}` }
  }

  const list = fileText.safeParse(parsed)

  return list.success ? { values: list.data } : { problem: "keybindings.json isn't a list of { command, keys }." }
}

/** What the file holds: its entries, or why it couldn't be read. `undefined` is no file. */
export function readKeybindings(text: string | undefined): KeybindingsState {
  const list = listIn(text)

  return "problem" in list ? { entries: [], problem: list.problem } : { entries: list.values.map(entryOf) }
}

function isCommand<C extends string>(defaults: Defaults<C>, command: string): command is C {
  return Object.hasOwn(defaults, command)
}

function sameKeys(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((keys, index) => keys === other[index])
}

/**
 * The keys each command has: the keymap's, with the file's entries in place of a command's. An entry for a command
 * that doesn't exist, or with keys that don't read, is skipped and listed. Keys two commands have go to the one an
 * entry gives them, the later entry when two do, and the other command loses them.
 */
export function resolveBindings<C extends string>(defaults: Defaults<C>, entries: readonly KeyEntry[]): Resolved<C> {
  const commands = Object.keys(defaults).filter((command) => isCommand(defaults, command))
  const claims = new Map<C, string[]>()
  const skipped: Skipped[] = []

  for (const entry of entries) {
    const keys = entry.keys.map(readKeys)
    const read = keys.filter((each) => each !== undefined)

    if (!isCommand(defaults, entry.command) || read.length < keys.length) {
      skipped.push({ command: entry.command, keys: entry.keys.join(", ") })
      continue
    }

    // A later entry for the same command replaces an earlier one, and wins its keys from others as if it were alone.
    claims.delete(entry.command)
    claims.set(entry.command, [...new Set(read)])
  }

  const claimed = (command: C) => claims.get(command) ?? defaults[command].keys
  const owners = new Map<string, C>()

  for (const command of commands.filter((each) => !claims.has(each))) {
    for (const keys of defaults[command].keys) {
      if (!owners.has(keys)) {
        owners.set(keys, command)
      }
    }
  }

  for (const [command, keys] of claims) {
    for (const each of keys) {
      owners.set(each, command)
    }
  }

  const resolved: Resolved<C> = {
    // SAFETY: filled for every command just below, before anything reads it.
    keys: {} as Record<C, readonly string[]>,
    changed: {},
    lost: {},
    skipped
  }

  for (const command of commands) {
    const keys = claimed(command).filter((each) => owners.get(each) === command)
    resolved.keys[command] = keys

    if (!sameKeys(keys, defaults[command].keys)) {
      resolved.changed[command] = keys[0] ?? ""
    }

    const taker = lostTo(command, claims.get(command), defaults[command].keys, owners)

    if (taker) {
      resolved.lost[command] = taker
    }
  }

  return resolved
}

/**
 * The command that took keys from `command`: keys it claims that another has, or, when its entry only keeps some of
 * its own keys (as one written after a clash does), its own keys another has now.
 */
function lostTo<C extends string>(
  command: C,
  entry: readonly string[] | undefined,
  defaults: readonly string[],
  owners: ReadonlyMap<string, C>
): C | undefined {
  const takenFrom = (keys: readonly string[]) =>
    keys.map((each) => owners.get(each)).find((owner) => owner !== undefined && owner !== command)

  const taken = takenFrom(entry ?? defaults)

  if (taken || !entry?.every((keys) => defaults.includes(keys))) {
    return taken
  }

  return takenFrom(defaults.filter((keys) => !entry.includes(keys)))
}

/** What to write for a change of keys, and the command that gave its keys up for it, if one did. */
export interface KeysChange<C extends string> {
  replacements: Replacement[]
  lost: C | undefined
}

/**
 * What to write to give `command` these keys, or its keymap's keys when `keys` is `undefined`. Keys another command
 * has go to `command`, and that command keeps the rest of its own: `keys: []` when it had no others. `lost` is the
 * command that gave them up. Keys equal to the keymap's remove the command's entry, so the file keeps only changes.
 */
export function changeKeys<C extends string>(
  defaults: Defaults<C>,
  entries: readonly KeyEntry[],
  command: C,
  keys: readonly string[] | undefined
): KeysChange<C> {
  const next = keys ? [...new Set(keys)] : [...defaults[command].keys]
  const now = resolveBindings(defaults, entries).keys
  const replacements: Replacement[] = []
  let lost: C | undefined

  for (const other of Object.keys(now).filter((each) => isCommand(defaults, each))) {
    const kept = now[other].filter((each) => !next.includes(each))

    if (other === command || kept.length === now[other].length) {
      continue
    }

    replacements.push({ command: other, keys: sameKeys(kept, defaults[other].keys) ? null : kept })
    lost ??= other
  }

  replacements.push({ command, keys: sameKeys(next, defaults[command].keys) ? null : next })

  return { replacements, lost }
}

/** Whether a value in the file is an entry for `command`. */
function isEntryFor(value: JsonValue, command: string): boolean {
  return someFields.safeParse(value).data?.command === command
}

/**
 * The file's new text with each replacement made: a command's entries give way to one in the first one's place, or at
 * the end, or are removed. Every other entry stays as it's written, skipped ones too. Throws for text that isn't a
 * list, which is never written over.
 */
export function applyReplacements(text: string | undefined, replacements: readonly Replacement[]): string {
  const list = listIn(text)

  if ("problem" in list) {
    throw new Error(list.problem)
  }

  let values = list.values

  for (const { command, keys } of replacements) {
    const at = values.findIndex((value) => isEntryFor(value, command))
    const rest = values.filter((value) => !isEntryFor(value, command))

    // Nothing before the first entry for the command is removed, so it goes back at the same place.
    if (keys) {
      rest.splice(at === -1 ? rest.length : at, 0, { command, keys })
    }

    values = rest
  }

  return `${JSON.stringify(values, null, 2)}\n`
}
