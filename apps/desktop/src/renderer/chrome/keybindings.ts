import {
  changeKeys,
  type KeybindingsState,
  readKeys,
  type Resolved,
  resolveBindings,
  type Skipped
} from "../../shared/keybindings.ts"
import { useStore, windowStore } from "../store.ts"
import { type Command, commandKeys, keymap } from "./keymap.ts"

/**
 * The shortcuts the person changed, from `keybindings.json` (PAR-1085). Main keeps the file and sends what it holds to
 * every window; this applies it to the keymap, through `commandKeys`, so `keysOf`, `shortcutOf`, the key handlers, the
 * menus, tooltips and the Keyboard shortcuts dialog all have the person's keys. Settings reads and changes them here.
 */

/** What Settings shows of the file. */
export interface Keybindings {
  /** Each command whose keys differ from the keymap's: the keys it shows, as the keymap writes them, or `""` for none. */
  changed: Partial<Record<Command, string>>
  /** Each command whose keys another command took, by that command. */
  lost: Partial<Record<Command, Command>>
  /** Entries Parity didn't apply: for a command that doesn't exist, or with keys that don't read. They stay in the file. */
  skipped: Skipped[]
  /** Why the file couldn't be read, when it couldn't. The keymap's keys apply until it can, and it isn't written over. */
  problem?: string
}

/** What changing a command's keys did. */
export interface KeysChanged {
  /** The command that had the keys and gave them up, if one did. */
  lost?: Command
}

const nothingChanged: KeybindingsState = { entries: [] }

/** What main last sent. */
const file = windowStore<KeybindingsState>(() => nothingChanged)

const shown = windowStore<Keybindings>(() => ({ changed: {}, lost: {}, skipped: [] }))

function receive(state: KeybindingsState): void {
  const resolved: Resolved<Command> = resolveBindings(keymap, state.entries)
  file.set(state)
  commandKeys.set(resolved.keys)
  const next: Keybindings = { changed: resolved.changed, lost: resolved.lost, skipped: resolved.skipped }

  if (state.problem !== undefined) {
    next.problem = state.problem
  }

  shown.set(next)
}

/** Called once by the window, before its first frame. It subscribes before asking, so a change while it asks isn't lost. */
export function startKeybindings(host = window.canvasHost.keybindings): void {
  let received = false
  host.subscribe((state) => {
    received = true
    receive(state)
  })
  void host
    .get()
    .then((state) => {
      if (!received) {
        receive(state)
      }
    })
    .catch((cause: unknown) => console.error("Parity couldn't read your shortcuts", cause))
}

/** The person's changes to the keymap, for Settings. */
export function useKeybindings(): Keybindings {
  return useStore(shown)
}

async function change(command: Command, keys: readonly string[] | undefined): Promise<KeysChanged> {
  const { replacements, lost } = changeKeys(keymap, file.get().entries, command, keys)
  receive(await window.canvasHost.keybindings.replace(replacements))

  return lost ? { lost } : {}
}

/**
 * Gives a command these keys, written as the keymap writes them (`Ctrl Shift K`), in place of all it has; `""` removes
 * them. Another command that had them gives them up, keeping its other keys. Fails, changing nothing, for keys that don't
 * read or a file main can't read or write.
 */
export function setKeys(command: Command, keys: string): Promise<KeysChanged> {
  if (keys.trim() === "") {
    return change(command, [])
  }

  const read = readKeys(keys)

  if (read === undefined) {
    return Promise.reject(new TypeError(`Parity can't read the keys "${keys}"`))
  }

  return change(command, [read])
}

/** Gives a command the keymap's keys again, taking them from any command that has them now. */
export function resetKeys(command: Command): Promise<KeysChanged> {
  return change(command, undefined)
}

/** Opens `keybindings.json` in the system's app for it, making it first when there's none. */
export function openKeybindings(): Promise<void> {
  return window.canvasHost.keybindings.open()
}
