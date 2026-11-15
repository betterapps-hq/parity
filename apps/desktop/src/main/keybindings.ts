import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  applyReplacements,
  type KeybindingsState,
  type KeyEntry,
  type Replacement,
  readKeybindings
} from "../shared/keybindings.ts"
import type { LockOptions } from "./file-lock.ts"
import { type FileFormat, sharedFile, type SharedFileState } from "./shared-file.ts"

/**
 * Main's copy of `keybindings.json` (PAR-1085), which every copy of Parity shares (`docs/proposals/settings.md`): read
 * before the window opens, watched for changes made by hand or in another copy, and changed for the windows.
 */
export interface KeybindingsFile {
  /** What windows are shown now, from memory: the file as last read, with changes not yet saved on top. */
  state(): KeybindingsState
  /**
   * Makes the replacements in the file as it is now, under its lock. Fails, changing nothing, while the file can't be
   * read. A change that can't be written yet applies for this run and is tried again.
   */
  replace(replacements: readonly Replacement[]): Promise<KeybindingsState>
  /** Makes the file, as an empty list, when there's none, so it can be opened. Gives its path. */
  ensure(): string
  /** Reads the file again, as when a window gains focus, in case a change was missed. */
  check(): void
  /** Stops watching and trying again. */
  close(): void
}

export interface KeybindingsFileOptions {
  /** Hears each state the file moves to, to send the windows. */
  changed: (state: KeybindingsState) => void
  /** Hears each problem once, for the log. */
  problem?: (message: string) => void
  settleMs?: number
  retryMs?: number
  retryMaxMs?: number
  lock?: LockOptions
}

const keybindingsFormat: FileFormat<KeyEntry[], readonly Replacement[]> = {
  read(text) {
    const { entries, problem } = readKeybindings(text)

    return problem === undefined ? { values: entries } : { values: entries, problem }
  },
  write: applyReplacements,
  apply: (entries, replacements) => readKeybindings(applyReplacements(JSON.stringify(entries), replacements)).entries
}

/** The state windows are shown, from the shared file's. */
function keybindingsState({ values, problem, unsaved }: SharedFileState<KeyEntry[]>): KeybindingsState {
  const state: KeybindingsState = { entries: values }

  if (problem !== undefined) {
    state.problem = problem
  }

  if (unsaved) {
    state.unsaved = true
  }

  return state
}

/**
 * Reads `file` now, so the first window has the person's keys, then keeps it. A file that can't be read keeps the keys
 * it last had, the keymap's at start, and is never written over.
 */
export function keybindingsFile(file: string, options: KeybindingsFileOptions): KeybindingsFile {
  const { changed, ...rest } = options

  const shared = sharedFile(file, keybindingsFormat, {
    ...rest,
    changed: (state) => changed(keybindingsState(state))
  })

  return {
    state: () => keybindingsState(shared.state()),
    async replace(replacements) {
      // A file fixed by hand since it was last read takes the change.
      shared.check()
      const { problem } = shared.state()

      if (problem !== undefined) {
        throw new Error(`${problem} Parity didn't change it.`)
      }

      return keybindingsState(await shared.change(replacements))
    },
    ensure() {
      try {
        mkdirSync(dirname(file), { recursive: true })
        // Only if there's none, so a file another copy makes at the same moment isn't written over.
        writeFileSync(file, "[]\n", { flag: "wx" })
      } catch {
        // There's one already, or it can't be made, which opening it then says.
      }

      return file
    },
    check: () => shared.check(),
    close: () => shared.close()
  }
}
