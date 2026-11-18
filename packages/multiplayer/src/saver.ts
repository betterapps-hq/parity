import { type CanvasDocument, defaultModeSettings, emptyDocument, type ModeSettings } from "@parity-app/core"
import {
  type RecoveryCopy,
  type SaveState,
  sameDocument,
  sameValue,
  type TokenEdit,
  type TokenEdits,
  type TokenFailure,
  type TokenWrite,
  noTokenEdits,
  tokenDifferences,
  tokenWrites,
  withoutModes
} from "@parity-app/editor"
import type { DocChange, ProjectDoc } from "./types.ts"

/*
 * Saving a project document (docs/proposals/multiplayer.md: ProjectSaver): it writes the files each change names a
 * moment after it, with automatic saving on, or on Save, and the token values to the stylesheet. What it last wrote or
 * read of each file is the saved content, which says what's unsaved and what a preview's reset goes back to.
 *
 * In a live room only one copy writes files (docs/proposals/extensions-in-the-window.md: Saving in a room). That copy
 * writes others' changes like its own. A copy that doesn't write files has nothing of its own to save and records
 * nothing as saved, so when it takes over writing it writes every file that differs from what it last knew was written:
 * what it read when it opened, or since, as the files changed on disk (`read`). It can't tell what the stylesheet holds
 * once another copy may have saved token values to it, so taking over writes every token value edited (PAR-1254).
 */

export interface Persistence {
  /**
   * Writes a file; `exportMs` is how long producing its content from the document took, and `fromOthers` how many of
   * other copies' changes to it the write includes.
   */
  saveDocument(path: string, document: CanvasDocument, timing: { exportMs: number; fromOthers: number }): Promise<void>
  /** Removes a file the project no longer has. */
  deleteDocument(path: string): Promise<void>
  /** Whether each change saves itself a moment later, or waits for Save. */
  autosave(): boolean
  /** Keeps a write in the trace of the change that asked for it (PAR-629): runs it, later, inside that trace. */
  keepTrace?(): (write: () => void) => void
}

/** Writes token values into the project's stylesheet, `path`. */
export interface TokenWriter {
  path: string
  write(changes: TokenWrite[]): Promise<void>
}

export interface ProjectSaver {
  state(): SaveState
  unsaved(): string[]
  hasUnsaved(): boolean
  /** A file's content as last written or read, which the saved view and the status's unsaved designs compare with. */
  saved(path: string): CanvasDocument | undefined
  /** The modes as last written or read. */
  savedModes(): ModeSettings
  /** The token values the stylesheet was last given: none known in a copy that joined a room and hasn't written it. */
  savedTokens(): TokenEdits
  /** Writes that failed and haven't succeeded since, with why. */
  failures(): { path: string; error: string }[]
  /** Writes what's waiting now, as Save does. Does nothing in a copy that doesn't write files. */
  flush(): Promise<void>
  /** Whether this copy writes the project's files: true unless another copy in a live room does. */
  writesFiles(): boolean
  /**
   * Makes this copy write files, or stop. Taking over writes every file that differs from what this copy last knows
   * was written, and the stylesheet when token values differ, then resolves with what it wrote. Letting go waits for
   * writes in flight to finish.
   */
  setWritesFiles(writes: boolean): Promise<{ filesWritten: number; stylesheetWritten: boolean }>
  /**
   * A file as it is on disk now, as another copy in a live room wrote it, or something outside Parity: what this copy
   * takes as saved, so taking over writes it only if it differs. The main file's modes come with it.
   */
  read(path: string, document: CanvasDocument): void
  /** Says how token values reach the stylesheet. The latest writer is used. */
  writeTokensWith(writer: TokenWriter): void
  tokenFailure(): TokenFailure | undefined
  recoveryCopy(keptAt?: number): RecoveryCopy | undefined
  subscribe(listener: () => void): () => void
  dispose(): void
}

/** How long saving waits after a change, so a run of changes is written once. */
export const saveDelay = 300

/** What the files held when the project opened, when that isn't what the document opened with. */
export interface SavedBaseline {
  files: ReadonlyMap<string, CanvasDocument>
  modes: ModeSettings
  /**
   * The token values the stylesheet holds. None for a copy that joined a room, which can't tell what the copy that saves
   * has written to it since: taking over then writes every token value edited.
   */
  tokens?: TokenEdits
}

export function createProjectSaver(
  doc: ProjectDoc,
  persistence: Persistence,
  options: {
    delay?: number
    /** Whether this copy writes files. True by default; false for a copy that joins another's live room. */
    writesFiles?: boolean
    /** What the files hold, for a copy that opened on another copy's document. The document's own content by default. */
    saved?: SavedBaseline
  } = {}
): ProjectSaver {
  const delay = options.delay ?? saveDelay
  const saved = new Map<string, CanvasDocument>(options.saved?.files ?? doc.files())
  let savedModes = options.saved?.modes ?? doc.modes()
  /** Undefined while this copy can't tell what the stylesheet holds. */
  let savedTokens: TokenEdits | undefined = options.saved ? options.saved.tokens : doc.tokens()
  let writesFiles = options.writesFiles ?? true
  /** Other copies' changes to each file since it was last written, for `document.saved`. */
  const fromOthers = new Map<string, number>()
  let writer: TokenWriter | undefined
  let tokenFailure: TokenFailure | undefined
  const failures = new Map<string, string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const writing = new Set<Promise<unknown>>()
  /** The paths being written now, and those to write again once that's done. */
  const inFlight = new Set<string>()
  const again = new Set<string>()
  const listeners = new Set<() => void>()
  let current: SaveState = { status: "saved" }

  const stylesheet = () => writer?.path ?? "(stylesheet)"

  const notify = () => {
    const next = computeState()

    if (next.status !== current.status || ("error" in next && "error" in current && next.error !== current.error)) {
      current = next
    }

    for (const listener of listeners) {
      listener()
    }
  }

  const fileUnsaved = (path: string): boolean => {
    const document = doc.file(path)
    const file = saved.get(path)

    if (document === file) {
      return false
    }

    if (document && file && sameDocument(document, file)) {
      // Changed back to what the file holds, so it's clean again.
      saved.set(path, document)

      return false
    }

    return true
  }

  /** Every file that differs from what was last written or read, whether or not this copy writes files. */
  const differing = (): string[] => {
    const paths = new Set([...doc.files().keys(), ...saved.keys()])
    const list = [...paths].filter(fileUnsaved)

    if (!list.includes(doc.main) && !sameValue(doc.modes(), savedModes)) {
      list.push(doc.main)
    }

    if (tokensToWrite(doc.tokens()).length > 0) {
      list.push(stylesheet())
    }

    return list
  }

  /** The token values to write to go from what the stylesheet holds to these: all of them when that isn't known. */
  const tokensToWrite = (tokens: TokenEdits): TokenWrite[] =>
    savedTokens
      ? tokenWrites(tokens, savedTokens)
      : [...tokens.values()].map(({ name, theme, value }) => ({ name, theme, value }))

  // A copy that doesn't write files has nothing of its own to save: the room's writing copy saves it.
  const unsaved = (): string[] => (writesFiles ? differing() : [])

  const computeState = (): SaveState => {
    const failure = failures.values().next().value

    if (failure !== undefined) {
      return { status: "failed", error: failure }
    }

    if (writing.size > 0) {
      return { status: "saving" }
    }

    return unsaved().length > 0 ? { status: "unsaved" } : { status: "saved" }
  }

  const schedule = (path: string) => {
    clearTimeout(timers.get(path))
    const inTrace = persistence.keepTrace?.() ?? ((write: () => void) => write())
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path)
        inTrace(() => write(path))
      }, delay)
    )
  }

  const write = (path: string) => {
    if (inFlight.has(path)) {
      // One write to a path at a time, so an older one can't land after a newer one.
      again.add(path)

      return
    }

    const sending = send(path)

    if (!sending) {
      return
    }

    const done: Promise<void> = sending
      .then(
        (taken) => {
          failures.delete(path)
          taken()
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : String(cause)
          console.error(`Saving ${path} failed`, cause)

          if (path === stylesheet()) {
            const changes = tokensToWrite(doc.tokens())
            const what = changes.length === 1 ? `--${changes[0]!.name}` : `${changes.length} token values`
            failures.set(path, `Couldn't write ${what} to ${path}: ${reason}`)
            tokenFailure = { error: reason, tokens: changes }
          } else {
            failures.set(path, reason)
          }
        }
      )
      .finally(() => {
        writing.delete(done)
        inFlight.delete(path)

        if (again.delete(path) && unsaved().includes(path)) {
          write(path)
        }

        notify()
      })

    writing.add(done)
    inFlight.add(path)
    notify()
  }

  /** Starts writing a file as it is now; resolves with what to take as saved once it's written. */
  const send = (path: string): Promise<() => void> | undefined => {
    if (path === stylesheet() && !doc.files().has(path)) {
      const tokens = doc.tokens()
      const changes = tokensToWrite(tokens)

      if (changes.length === 0) {
        return undefined
      }

      if (!writer) {
        return Promise.reject(new Error("Nothing here can write to the stylesheet"))
      }

      return writer.write(changes).then(() => () => {
        savedTokens = tokens
        tokenFailure = undefined
      })
    }

    const exporting = performance.now()
    const document = doc.file(path)
    const modes = doc.modes()
    const content = fileContent(doc.main, path, document, modes)
    const exportMs = performance.now() - exporting
    const others = fromOthers.get(path) ?? 0

    const taken = () => {
      if (document) {
        saved.set(path, document)
      } else {
        saved.delete(path)
      }

      if (path === doc.main) {
        savedModes = modes
      }

      const left = (fromOthers.get(path) ?? 0) - others

      if (left > 0) {
        fromOthers.set(path, left)
      } else {
        fromOthers.delete(path)
      }
    }

    if (content) {
      return persistence.saveDocument(path, content, { exportMs, fromOthers: others }).then(() => taken)
    }

    // Taken out of the project: it's saved once the file is gone too.
    return saved.has(path) ? persistence.deleteDocument(path).then(() => taken) : Promise.resolve(taken)
  }

  const take = (change: DocChange) => {
    if (change.written === "files") {
      // It came from the files, so they already hold it.
      for (const path of change.files) {
        clearTimeout(timers.get(path))
        timers.delete(path)
        fromOthers.delete(path)
        const document = doc.file(path)

        if (document) {
          saved.set(path, document)
        } else {
          saved.delete(path)
        }
      }

      if (change.modes) {
        savedModes = doc.modes()
      }

      notify()

      return
    }

    if (change.origin === "remote") {
      for (const path of change.files) {
        fromOthers.set(path, (fromOthers.get(path) ?? 0) + 1)
      }
    }

    if (writesFiles && persistence.autosave()) {
      for (const path of change.files) {
        schedule(path)
      }

      if (change.tokens) {
        schedule(stylesheet())
      }
    }

    if (tokensToWrite(doc.tokens()).length === 0 && (tokenFailure || failures.has(stylesheet()))) {
      // Back at what the stylesheet holds, so nothing is left that failed to write.
      tokenFailure = undefined
      failures.delete(stylesheet())
    }

    notify()
  }

  const unsubscribe = doc.subscribe(take)

  /** Waits until no write is in flight, as a write can queue another to the same path as it finishes. */
  const settle = async () => {
    while (writing.size > 0) {
      await Promise.allSettled(writing)
    }
  }

  const stopTimers = () => {
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }

    timers.clear()
  }

  return {
    state: () => {
      const next = computeState()

      if (next.status !== current.status || ("error" in next && "error" in current && next.error !== current.error)) {
        current = next
      }

      return current
    },
    unsaved,
    hasUnsaved: () => unsaved().length > 0,
    saved: (path) => saved.get(path),
    savedModes: () => savedModes,
    savedTokens: () => savedTokens ?? noTokenEdits,
    failures: () => [...failures].map(([path, error]) => ({ path, error })),

    flush: async () => {
      if (!writesFiles) {
        return
      }

      stopTimers()
      failures.clear()
      notify()

      for (const path of unsaved()) {
        write(path)
      }

      await settle()

      const failure = failures.values().next().value

      if (failure !== undefined) {
        throw new Error(failure)
      }
    },

    writesFiles: () => writesFiles,

    setWritesFiles: async (writes) => {
      if (!writes) {
        writesFiles = false
        stopTimers()
        await settle()
        notify()

        return { filesWritten: 0, stylesheetWritten: false }
      }

      if (writesFiles) {
        return { filesWritten: 0, stylesheetWritten: false }
      }

      writesFiles = true
      const differ = differing()

      for (const path of differ) {
        write(path)
      }

      await settle()
      notify()

      const written = differ.filter((path) => !failures.has(path))

      return {
        filesWritten: written.filter((path) => path !== stylesheet()).length,
        stylesheetWritten: written.includes(stylesheet())
      }
    },

    read: (path, document) => {
      saved.set(path, withoutModes(document))

      if (path === doc.main) {
        savedModes = document.modes ?? defaultModeSettings
      }

      notify()
    },

    writeTokensWith: (next) => {
      writer = next
    },
    tokenFailure: () => tokenFailure,

    recoveryCopy: (keptAt = Date.now()) => {
      // A copy in another's room keeps no copy of the room's edits: the writing copy has them (PAR-1289).
      if (!writesFiles) {
        return undefined
      }

      const documents = unsaved()
        .filter((path) => path !== stylesheet() && (doc.files().has(path) || saved.has(path)))
        .filter((path) => doc.file(path) !== saved.get(path))
        .map((path) => ({ path, document: doc.file(path) ?? null }))

      const tokens = recoveredTokens(doc.tokens(), savedTokens ?? noTokenEdits)
      const copy: RecoveryCopy = { version: 1, keptAt, documents, tokens }

      if (!sameValue(doc.modes(), savedModes)) {
        copy.modes = doc.modes()
      }

      return documents.length > 0 || tokens.length > 0 || copy.modes ? copy : undefined
    },

    subscribe: (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },

    dispose: () => {
      unsubscribe()
      stopTimers()
      listeners.clear()
    }
  }
}

/** A file's content as it's written: the main file carries the modes when they aren't the defaults. */
function fileContent(
  main: string,
  path: string,
  document: CanvasDocument | undefined,
  modes: ModeSettings
): CanvasDocument | undefined {
  if (path !== main) {
    return document
  }

  const custom = !sameValue(modes, defaultModeSettings)

  if (!document && !custom) {
    return undefined
  }

  const base = document ?? emptyDocument()

  return custom ? { ...base, modes } : base
}

/** Token values edited and not yet written, each with what the stylesheet holds, for a recovery copy. */
function recoveredTokens(current: TokenEdits, saved: TokenEdits): TokenEdit[] {
  return tokenDifferences(saved, current).flatMap((difference): TokenEdit[] => {
    const edit = [...current.values()].find((each) => each.name === difference.name && each.theme === difference.theme)

    if (!edit) {
      return []
    }

    const before = [...saved.values()].find((each) => each.name === edit.name && each.theme === edit.theme)
    const original = before?.value ?? edit.original
    const kept: TokenEdit = { name: edit.name, theme: edit.theme, value: edit.value }

    if (original !== undefined) {
      kept.original = original
    }

    return [kept]
  })
}
