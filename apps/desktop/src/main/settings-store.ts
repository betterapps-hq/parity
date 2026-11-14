import { readFileSync, realpathSync, watch } from "node:fs"
import { basename, dirname } from "node:path"
import {
  type AppSettings,
  changedSettings,
  defaultSettings,
  changeSettings,
  type ExtensionSettings,
  type FileChange,
  readSettings,
  settingKeys,
  withExtensionChange
} from "@parity-app/settings"
import { z } from "zod"
import type { SettingsState } from "../shared/settings.ts"
import { type LockOptions, withFileLock } from "./file-lock.ts"
import { writeWhole } from "./json-file.ts"

export interface SettingsStore {
  /** What every window is shown now, from memory: the file as last read, with changes not yet saved on top. */
  state(): SettingsState
  /**
   * Makes one change, in the file as it is now: to Parity's own settings, or to extensions' under `extensions`. Never
   * fails: a change that can't be saved yet waits and is tried again.
   */
  change(change: FileChange): Promise<SettingsState>
  /** Reads the file again, as when a window gains focus, in case a change from another copy was missed. */
  check(): void
  /** Stops watching and trying again. */
  close(): void
}

export interface SettingsStoreOptions {
  /** Hears each state the settings move to, to send the windows. */
  changed: (state: SettingsState, keys: Partial<AppSettings>) => void
  /** Hears each problem once, for the log. */
  problem?: (message: string) => void
  /** How long to wait after the folder's last change before reading, in milliseconds. */
  settleMs?: number
  /** The gap before the first try to save a change again, doubling up to `retryMaxMs`. */
  retryMs?: number
  retryMaxMs?: number
  lock?: LockOptions
}

const heldCodes = new Set(["EBUSY", "EPERM", "EACCES"])
const errorCode = z.object({ code: z.string() })

type FileRead = { text: string | undefined } | { held: string }

/** The file's text, none for no file, or why another process holds it. Tried a few times while it's held. */
function readText(file: string): FileRead {
  for (let tried = 1; ; tried++) {
    try {
      return { text: readFileSync(file, "utf8") }
    } catch (error) {
      const code = errorCode.safeParse(error).data?.code

      if (code === "ENOENT") {
        return { text: undefined }
      }

      if (!code || !heldCodes.has(code) || tried >= 3) {
        return { held: `settings.json couldn't be read: ${String(error)}` }
      }
    }
  }
}

/**
 * `settings.json` in the data folder, which every copy of Parity shares (`docs/proposals/settings.md`). Main reads it
 * before the window opens and answers windows from memory. Each change is made under the file's lock on the file as it
 * is then, so copies changing settings at once both keep their change. A file whose text doesn't parse is never written
 * over. A change that can't be saved holds for this run and is tried again. Main watches the folder for other copies'
 * changes, since a rename over a file ends a watch on the file itself.
 */
export function settingsStore(file: string, options: SettingsStoreOptions): SettingsStore {
  const { changed, problem = () => undefined, settleMs = 150, retryMs = 1000, retryMaxMs = 30_000 } = options
  let fileValues: AppSettings = { ...defaultSettings }
  let fileExtensions: ExtensionSettings = {}
  let fileProblem: string | undefined
  let badValues: SettingsState["badValues"] = []
  /** Changes made in this copy that aren't in the file yet, in order. */
  let unsaved: FileChange[] = []
  let shown: SettingsState
  let queue: Promise<unknown> = Promise.resolve()
  let retry: ReturnType<typeof setTimeout> | undefined
  let retryGap = retryMs
  let settle: ReturnType<typeof setTimeout> | undefined
  let lastProblem: string | undefined
  let closed = false

  const report = (message: string | undefined) => {
    if (message !== undefined && message !== lastProblem) {
      problem(message)
    }

    lastProblem = message
  }

  /** The file's values with this copy's unsaved changes on top. */
  const withUnsaved = (): AppSettings => {
    const entries = settingKeys.map((key) => {
      const last = unsaved.findLast((change) => change[key] !== undefined)?.[key]

      // A change's `null` puts the setting back to its default.
      return [key, last === undefined ? fileValues[key] : (last ?? defaultSettings[key])]
    })

    // SAFETY: each value is a default, one the file's schema read, or one a change's schema read, for its own key.
    return Object.fromEntries(entries) as AppSettings
  }

  /** Extensions' settings in the file, with this copy's unsaved changes to them on top, in order. */
  const extensionsWithUnsaved = (): ExtensionSettings =>
    unsaved.reduce((settings, change) => withExtensionChange(settings, change.extensions), fileExtensions)

  const stateNow = (): SettingsState => {
    const state: SettingsState = { values: withUnsaved(), extensions: extensionsWithUnsaved(), badValues }

    if (fileProblem !== undefined) {
      state.problem = fileProblem
    }

    if (unsaved.length > 0) {
      state.unsaved = true
    }

    return state
  }

  const show = () => {
    const before = shown
    shown = stateNow()
    const keys = changedSettings(before.values, shown.values)

    if (
      Object.keys(keys).length > 0 ||
      JSON.stringify(before.extensions) !== JSON.stringify(shown.extensions) ||
      before.problem !== shown.problem ||
      before.unsaved !== shown.unsaved ||
      before.badValues.join() !== shown.badValues.join()
    ) {
      changed(shown, keys)
    }
  }

  /** Reads the file into memory. A held file keeps what was there; text that doesn't parse marks it unreadable. */
  const load = () => {
    const read = readText(file)

    if ("held" in read) {
      report(read.held)

      return
    }

    const settings = readSettings(read.text)

    if (settings.problem === undefined) {
      fileValues = settings.values
      fileExtensions = settings.extensions
      badValues = settings.badValues
    }

    fileProblem = settings.problem
    report(settings.problem)
  }

  const writeUnsaved = async () => {
    await withFileLock(
      file,
      async () => {
        const read = readText(file)

        if ("held" in read) {
          throw new Error(read.held)
        }

        const writing = unsaved
        let text = read.text

        for (const change of writing) {
          text = changeSettings(text, change)
        }

        await writeWhole(file, text ?? "{}\n")
        unsaved = unsaved.slice(writing.length)
        const settings = readSettings(text)
        fileValues = settings.values
        fileExtensions = settings.extensions
        badValues = settings.badValues
        fileProblem = undefined
      },
      options.lock
    )
  }

  const save = async () => {
    if (unsaved.length === 0) {
      return
    }

    try {
      await writeUnsaved()
      retryGap = retryMs
      report(undefined)
    } catch (error) {
      report(error instanceof Error ? error.message : String(error))

      if (!closed && retry === undefined) {
        retry = setTimeout(() => {
          retry = undefined
          queue = queue.then(save)
        }, retryGap)
        retryGap = Math.min(retryGap * 2, retryMaxMs)
      }
    }

    show()
  }

  load()
  shown = stateNow()

  const name = basename(file)
  let watcher: ReturnType<typeof watch> | undefined

  const startWatching = () => {
    try {
      // The folder by its real, long path: on Windows, libuv stops the process on a short (8.3) one, as a temp folder
      // under C:\Users\RUNNER~1 has.
      watcher = watch(realpathSync.native(dirname(file)), (_event, changedName) => {
        if (changedName !== name) {
          return
        }

        clearTimeout(settle)
        settle = setTimeout(() => {
          load()
          show()
        }, settleMs)
      })
      watcher.on("error", () => {
        watcher?.close()

        if (!closed) {
          startWatching()
        }
      })
    } catch {
      // A folder that can't be watched is still read again when a window gains focus.
    }
  }

  startWatching()

  return {
    state: () => shown,
    change(change) {
      unsaved = [...unsaved, change]
      show()
      const done = queue.then(save)
      queue = done.catch(() => undefined)

      return done.then(() => shown)
    },
    check() {
      load()
      show()
    },
    close() {
      closed = true
      watcher?.close()
      clearTimeout(settle)
      clearTimeout(retry)
    }
  }
}
