import { readFileSync, realpathSync, watch } from "node:fs"
import { basename, dirname } from "node:path"
import { z } from "zod"
import { type LockOptions, withFileLock } from "./file-lock.ts"
import { writeWhole } from "./json-file.ts"

/** How a shared file reads and changes, as data in and data out. */
export interface FileFormat<Values, Change> {
  /** The values `text` holds, none for no file, or why the text couldn't be read at all. */
  read(text: string | undefined): { values: Values; problem?: string }
  /** The file's text after one change. Throws for text that doesn't parse. */
  write(text: string | undefined, change: Change): string
  /** The values after one change, for a change that isn't in the file yet. */
  apply(values: Values, change: Change): Values
}

/** What a shared file holds now, as this copy shows it. */
export interface SharedFileState<Values> {
  values: Values
  /** Why the file couldn't be read. Its values are then the last ones that read, or the defaults. */
  problem?: string
  /** This copy has changes it couldn't save yet, which it keeps trying. */
  unsaved?: true
}

export interface SharedFile<Values, Change> {
  /** What windows are shown now, from memory: the file as last read, with changes not yet saved on top. */
  state(): SharedFileState<Values>
  /** Makes one change, in the file as it is now. Never fails: a change that can't be saved yet waits and is tried again. */
  change(change: Change): Promise<SharedFileState<Values>>
  /** Reads the file again, as when a window gains focus, in case a change from another copy was missed. */
  check(): void
  /** Stops watching and trying again. */
  close(): void
}

export interface SharedFileOptions<Values> {
  /** Hears each state the file moves to, with the one before, to send the windows. */
  changed?: (state: SharedFileState<Values>, before: SharedFileState<Values>) => void
  /** Hears each problem once, for the log. */
  problem?: (message: string) => void
  /** Whether to watch the folder for other copies' changes. */
  watch?: boolean
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
        return { held: `${basename(file)} couldn't be read: ${String(error)}` }
      }
    }
  }
}

/**
 * A file in the data folder that every copy of Parity shares (`docs/proposals/settings.md`). Main reads it before the
 * window opens and answers windows from memory. Each change is made under the file's lock on the file as it is then, so
 * copies changing it at once both keep their change. A file whose text doesn't parse is never written over. A change
 * that can't be saved holds for this run and is tried again. Main watches the folder for other copies' changes, since a
 * rename over a file ends a watch on the file itself.
 */
export function sharedFile<Values, Change>(
  file: string,
  format: FileFormat<Values, Change>,
  options: SharedFileOptions<Values> = {}
): SharedFile<Values, Change> {
  const { changed = () => undefined, problem = () => undefined, settleMs = 150, retryMs = 1000 } = options
  const { retryMaxMs = 30_000 } = options
  let fileValues = format.read(undefined).values
  let fileProblem: string | undefined
  /** Changes made in this copy that aren't in the file yet, in order. */
  let unsaved: Change[] = []
  let shown: SharedFileState<Values>
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

  const stateNow = (): SharedFileState<Values> => {
    const state: SharedFileState<Values> = {
      values: unsaved.reduce((values, change) => format.apply(values, change), fileValues)
    }

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

    if (JSON.stringify(before) !== JSON.stringify(shown)) {
      changed(shown, before)
    }
  }

  /** Reads the file into memory. A held file keeps what was there; text that doesn't parse marks it unreadable. */
  const load = () => {
    const read = readText(file)

    if ("held" in read) {
      report(read.held)

      return
    }

    const values = format.read(read.text)

    if (values.problem === undefined) {
      fileValues = values.values
    }

    fileProblem = values.problem
    report(values.problem)
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
          text = format.write(text, change)
        }

        await writeWhole(file, text ?? "{}\n")
        unsaved = unsaved.slice(writing.length)
        fileValues = format.read(text).values
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

  if (options.watch !== false) {
    startWatching()
  }

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
