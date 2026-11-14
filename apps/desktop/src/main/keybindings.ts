import { readFileSync } from "node:fs"
import { z } from "zod"
import { applyReplacements, type KeybindingsState, type Replacement, readKeybindings } from "../shared/keybindings.ts"
import { writeWhole } from "./json-file.ts"

/** Main's copy of `keybindings.json` (PAR-1085), which it reads at start and changes for the windows. */
export interface KeybindingsFile {
  /** What the file held when last read or written. */
  state(): KeybindingsState
  /**
   * Makes the replacements in the file as it is now, one change at a time, and tells `changed`. Fails, writing nothing,
   * when the file can't be read, or when it can't be written.
   */
  replace(replacements: readonly Replacement[]): Promise<KeybindingsState>
  /** Makes the file, as an empty list, when there's none, so it can be opened. Gives its path. */
  ensure(): Promise<string>
}

/**
 * What the file holds now, read synchronously: it's a few lines, read at start before the window opens and again for
 * each change. No file is no changes; one that can't be read, or isn't a list, has a problem.
 */
function readNow(file: string): KeybindingsState & { text?: string } {
  try {
    const text = readFileSync(file, "utf8")

    return { ...readKeybindings(text), text }
  } catch (error) {
    if (z.object({ code: z.literal("ENOENT") }).safeParse(error).success) {
      return readKeybindings(undefined)
    }

    return { entries: [], problem: `keybindings.json couldn't be read: ${String(error)}` }
  }
}

/**
 * Reads `file` now, so the first window has the person's keys, then keeps it. `changed` hears each state the file
 * moves to, to send the windows. A file that can't be read gives the keymap's keys and is never written over.
 */
export function keybindingsFile(file: string, changed: (state: KeybindingsState) => void): KeybindingsFile {
  let state: KeybindingsState = withoutText(readNow(file))
  let queue: Promise<unknown> = Promise.resolve()

  const update = (next: KeybindingsState) => {
    state = next
    changed(next)

    return next
  }

  const replace = async (replacements: readonly Replacement[]) => {
    const now = readNow(file)

    if (now.problem !== undefined) {
      update(withoutText(now))
      throw new Error(`${now.problem} Parity didn't change it.`)
    }

    const text = applyReplacements(now.text, replacements)
    await writeWhole(file, text)

    return update(readKeybindings(text))
  }

  return {
    state: () => state,
    replace(replacements) {
      const done = queue.then(() => replace(replacements))
      queue = done.catch(() => undefined)

      return done
    },
    async ensure() {
      const now = readNow(file)

      if (now.problem === undefined && now.text === undefined) {
        await writeWhole(file, "[]\n")
      }

      return file
    }
  }
}

function withoutText({ entries, problem }: KeybindingsState): KeybindingsState {
  return problem === undefined ? { entries } : { entries, problem }
}
