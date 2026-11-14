import { type CanvasDocument, defaultModeSettings, emptyDocument, type ModeSettings } from "@parity-app/core"
import {
  type RecoveryCopy,
  type SaveState,
  sameDocument,
  sameTokenValues,
  sameValue,
  type TokenEdit,
  type TokenEdits,
  type TokenFailure,
  type TokenWrite,
  tokenDifferences,
  tokenWrites
} from "@parity-app/editor"
import type { DocChange, ProjectDoc } from "./types.ts"

/*
 * Saving a project document (docs/proposals/multiplayer.md: ProjectSaver): it writes the files each change names a
 * moment after it, with automatic saving on, or on Save, and the token values to the stylesheet. What it last wrote or
 * read of each file is the saved content, which says what's unsaved and what a preview's reset goes back to.
 */

export interface Persistence {
  saveDocument(path: string, document: CanvasDocument): Promise<void>
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
  /** Writes what's waiting now, as Save does. */
  flush(): Promise<void>
  /** Says how token values reach the stylesheet. The latest writer is used. */
  writeTokensWith(writer: TokenWriter): void
  tokenFailure(): TokenFailure | undefined
  recoveryCopy(keptAt?: number): RecoveryCopy | undefined
  subscribe(listener: () => void): () => void
  dispose(): void
}

/** How long saving waits after a change, so a run of changes is written once. */
export const saveDelay = 300

export function createProjectSaver(
  doc: ProjectDoc,
  persistence: Persistence,
  options: { delay?: number } = {}
): ProjectSaver {
  const delay = options.delay ?? saveDelay
  const saved = new Map<string, CanvasDocument>(doc.files())
  let savedModes = doc.modes()
  let savedTokens = doc.tokens()
  let writer: TokenWriter | undefined
  let tokenFailure: TokenFailure | undefined
  const failures = new Map<string, string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const writing = new Set<Promise<unknown>>()
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

  const unsaved = (): string[] => {
    const paths = new Set([...doc.files().keys(), ...saved.keys()])
    const list = [...paths].filter(fileUnsaved)

    if (!list.includes(doc.main) && !sameValue(doc.modes(), savedModes)) {
      list.push(doc.main)
    }

    if (!sameTokenValues(doc.tokens(), savedTokens)) {
      list.push(stylesheet())
    }

    return list
  }

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
    const sending = send(path)

    if (!sending) {
      return
    }

    const done = sending.then(
      (taken) => {
        failures.delete(path)
        taken()
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : String(cause)
        console.error(`Saving ${path} failed`, cause)

        if (path === stylesheet()) {
          const changes = tokenWrites(doc.tokens(), savedTokens)
          const what = changes.length === 1 ? `--${changes[0]!.name}` : `${changes.length} token values`
          failures.set(path, `Couldn't write ${what} to ${path}: ${reason}`)
          tokenFailure = { error: reason, tokens: changes }
        } else {
          failures.set(path, reason)
        }
      }
    )

    writing.add(done)
    void done.finally(() => {
      writing.delete(done)
      notify()
    })
    notify()
  }

  /** Starts writing a file as it is now; resolves with what to take as saved once it's written. */
  const send = (path: string): Promise<() => void> | undefined => {
    if (path === stylesheet() && !doc.files().has(path)) {
      const tokens = doc.tokens()
      const changes = tokenWrites(tokens, savedTokens)

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

    const document = doc.file(path)
    const modes = doc.modes()
    const content = fileContent(doc.main, path, document, modes)

    const taken = () => {
      if (document) {
        saved.set(path, document)
      } else {
        saved.delete(path)
      }

      if (path === doc.main) {
        savedModes = modes
      }
    }

    return content ? persistence.saveDocument(path, content).then(() => taken) : Promise.resolve(taken)
  }

  const take = (change: DocChange) => {
    if (!change.persist) {
      // It came from the files, so they already hold it.
      for (const path of change.files) {
        clearTimeout(timers.get(path))
        timers.delete(path)
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

    if (persistence.autosave()) {
      for (const path of change.files) {
        schedule(path)
      }

      if (change.tokens) {
        schedule(stylesheet())
      }
    }

    if (sameTokenValues(doc.tokens(), savedTokens) && (tokenFailure || failures.has(stylesheet()))) {
      // Back at what the stylesheet holds, so nothing is left that failed to write.
      tokenFailure = undefined
      failures.delete(stylesheet())
    }

    notify()
  }

  const unsubscribe = doc.subscribe(take)

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

    flush: async () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }

      timers.clear()
      failures.clear()
      notify()

      for (const path of unsaved()) {
        write(path)
      }

      await Promise.allSettled(writing)
      const failure = failures.values().next().value

      if (failure !== undefined) {
        throw new Error(failure)
      }
    },

    writeTokensWith: (next) => {
      writer = next
    },
    tokenFailure: () => tokenFailure,

    recoveryCopy: (keptAt = Date.now()) => {
      const documents = unsaved()
        .filter((path) => path !== stylesheet() && (doc.files().has(path) || saved.has(path)))
        .filter((path) => doc.file(path) !== saved.get(path))
        .map((path) => ({ path, document: doc.file(path) ?? null }))

      const tokens = recoveredTokens(doc.tokens(), savedTokens)
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

      for (const timer of timers.values()) {
        clearTimeout(timer)
      }

      timers.clear()
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
