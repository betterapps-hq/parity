import {
  type CanvasDocument,
  type ComponentLibrary,
  componentLibrary,
  type ContainerSpec,
  type ContainerViewSettings,
  defaultModeSettings,
  type ModeSettings,
  type NoteSpec,
  reachableLibrary
} from "@parity-app/core"
import { useSyncExternalStore } from "react"
import type { TokenChange } from "../shared/protocol.ts"
import { sameDocument, withTidyView } from "./document-equality.ts"
import {
  noTokenEdits,
  sameTokenValues,
  type TokenEdit,
  type TokenEdits,
  tokenWrites,
  withTokenEdits
} from "./token-edits.ts"

export interface ContainerEntry {
  /** Stable across the session: `<document path>#<container id>`. */
  key: string
  path: string
  container: ContainerSpec
}

export interface NoteEntry {
  key: string
  path: string
  note: NoteSpec
}

interface Persistence {
  saveDocument(path: string, document: CanvasDocument): Promise<unknown>
  /** Whether each change saves itself a moment later, or waits for Save. */
  autosave(): boolean
}

export interface Snapshot {
  documents: ReadonlyMap<string, CanvasDocument>
  modes: ModeSettings
  /** Token values edited on the canvas, which Save writes to the project's stylesheet. */
  tokens: TokenEdits
}

/** Writes token values into the project's stylesheet, `path`. */
export interface TokenWriter {
  path: string
  write(changes: TokenChange[]): Promise<unknown>
}

/** Why the stylesheet couldn't take the last token values Save wrote, and which tokens they were. */
export interface TokenFailure {
  error: string
  tokens: readonly TokenChange[]
}

interface HistoryEntry {
  label: string
  before: Snapshot
  /** Changes in one group within a second of each other merge into one step: a drag, a run of typing. */
  group?: string
  time: number
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoLabel?: string
  redoLabel?: string
}

/** Whether every change has reached its file: saved, waiting for Save, being written, or failed to write. */
export type SaveState =
  | { status: "saved" }
  | { status: "unsaved" }
  | { status: "saving" }
  | { status: "failed"; error: string }

export interface ChangeOptions {
  /** View changes (which state or modes show) aren't undoable. */
  history?: boolean
  group?: string
  /** Changes that came from the files themselves aren't written back to them. */
  persist?: boolean
}

const saveDelay = 300
const historyLimit = 200
/** For a key with no design, so asking for its library gives the same empty one each time. */
const noLibrary: ComponentLibrary = new Map()

/**
 * The open designs, the project's modes and the tokens edited on the canvas, with undo. Changes stay here, unsaved,
 * until Save writes them to their files (or right away, with automatic saving on); the canvas (tldraw) only projects
 * what this store holds. Undoing back to what was saved, or changing a file back to it, makes it clean again. Modes are
 * kept apart from the documents here, and written into the project's main file when they differ from the defaults.
 * Token values go into the project's stylesheet through the writer the token store gives it.
 */
export class DesignStore {
  private documents: ReadonlyMap<string, CanvasDocument>
  private modes: ModeSettings
  private tokens: TokenEdits = noTokenEdits
  private tokenWriter: TokenWriter | undefined
  private tokenFailure: TokenFailure | undefined
  private entries: readonly ContainerEntry[] = []
  private byKey: ReadonlyMap<string, ContainerEntry> = new Map()
  private libraries: ReadonlyMap<string, ComponentLibrary> = new Map()
  private library: ComponentLibrary = noLibrary
  private notes: readonly NoteEntry[] = []
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []
  private history: HistoryState = { canUndo: false, canRedo: false }
  private saveState: SaveState = { status: "saved" }
  /** What the files hold: as loaded, or as last saved. */
  private saved: Snapshot
  private readonly listeners = new Set<() => void>()
  /** Saves waiting to happen, with automatic saving on. */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly writing = new Set<Promise<unknown>>()
  /** Why each file's last save failed, until one of its saves succeeds. */
  private failures = new Map<string, string>()

  constructor(
    documents: { path: string; document: CanvasDocument }[],
    modes: ModeSettings,
    /** The project file new designs and the modes go into. */
    readonly mainPath: string,
    private readonly persistence: Persistence,
    /**
     * Component designs from the project's libraries' `.lib.par` canvases (`nova/settings-row`), which instances can
     * place but the project's files don't hold.
     */
    private readonly libraryDesigns: readonly ContainerSpec[] = []
  ) {
    this.documents = new Map(documents.map(({ path, document }) => [path, withoutModes(document)]))
    this.modes = modes
    this.saved = this.snapshot()
    this.index()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getEntries = () => this.entries
  getEntry = (key: string) => this.byKey.get(key)
  /** What a design's instances reach, for resolving it: the same library until one of those designs changes. */
  getLibrary = (key: string): ComponentLibrary => this.libraries.get(key) ?? noLibrary
  /** Every component design instances can place: the project's own, and its libraries'. */
  getComponentLibrary = (): ComponentLibrary => this.library
  getNotes = () => this.notes
  getModes = () => this.modes
  getHistory = () => this.history
  getSaveState = () => this.saveState
  getTokenEdits = () => this.tokens
  getTokenFailure = () => this.tokenFailure

  /** Says how token values reach the stylesheet. The latest writer is used, as the project's guest can be reloaded. */
  writeTokensWith(writer: TokenWriter): void {
    this.tokenWriter = writer
  }

  /** Files with changes that aren't saved yet: project files, and the stylesheet when tokens were edited. */
  unsavedPaths(): string[] {
    const paths = new Set([...this.documents.keys(), ...this.saved.documents.keys()])
    const unsaved = [...paths].filter((path) => this.documents.get(path) !== this.saved.documents.get(path))
    if (this.modes !== this.saved.modes && !unsaved.includes(this.mainPath)) unsaved.push(this.mainPath)
    if (this.tokensUnsaved()) unsaved.push(this.stylesheet())
    return unsaved
  }

  hasUnsaved(): boolean {
    return this.unsavedPaths().length > 0
  }
  getDocuments = (): { path: string; document: CanvasDocument }[] =>
    [...this.documents].map(([path, document]) => ({ path, document }))

  /** Applies one change to the documents and modes, recording it for undo unless told not to. */
  change(label: string, update: (snapshot: Snapshot) => Snapshot, options: ChangeOptions = {}): void {
    const before = this.snapshot()
    const after = update(before)
    if (after.documents === before.documents && after.modes === before.modes && after.tokens === before.tokens) return
    if (options.history !== false) {
      const last = this.past.at(-1)
      const now = Date.now()
      if (options.group && last?.group === options.group && now - last.time < 1000) last.time = now
      else {
        this.past.push({ label, before, group: options.group, time: now })
        if (this.past.length > historyLimit) this.past.shift()
      }
      this.future = []
    }
    this.restore(after, before, options.persist !== false)
  }

  /**
   * A project file changed outside the canvas (an agent, git, a text editor): its content replaces what's here as one
   * undoable step. A file with unsaved changes here is left alone unless forced, and false says so, so the person can
   * choose which to keep.
   */
  reloadDocument(path: string, document: CanvasDocument, force = false): boolean {
    if (!force && this.unsavedPaths().includes(path)) return false
    clearTimeout(this.timers.get(path))
    this.timers.delete(path)
    this.change(
      `Reload ${path}`,
      (snapshot) => ({
        ...snapshot,
        documents: new Map(snapshot.documents).set(path, withoutModes(document)),
        modes: path === this.mainPath ? (document.modes ?? defaultModeSettings) : snapshot.modes
      }),
      { persist: false }
    )
    return true
  }

  undo(): void {
    const entry = this.past.pop()
    if (!entry) return
    const current = this.snapshot()
    this.future.push({ label: entry.label, before: current, time: Date.now() })
    this.restore(keepViews(entry.before, current), current)
  }

  redo(): void {
    const entry = this.future.pop()
    if (!entry) return
    const current = this.snapshot()
    this.past.push({ label: entry.label, before: current, time: Date.now() })
    this.restore(keepViews(entry.before, current), current)
  }

  updateContainer(
    key: string,
    label: string,
    update: (container: ContainerSpec) => ContainerSpec,
    options?: ChangeOptions
  ): void {
    const entry = this.getEntry(key)
    if (!entry) return
    this.change(
      label,
      (snapshot) => {
        const document = snapshot.documents.get(entry.path)
        const current = document?.containers.find((container) => container.id === entry.container.id)
        if (!document || !current) return snapshot
        const next = update(current)
        if (next === current) return snapshot
        const containers = document.containers.map((container) => (container === current ? next : container))
        return { ...snapshot, documents: new Map(snapshot.documents).set(entry.path, { ...document, containers }) }
      },
      options
    )
  }

  /**
   * Changes several designs as one undoable step: `update` gets them in the order of `keys` and returns them changed,
   * in the same order.
   */
  updateContainers(
    keys: readonly string[],
    label: string,
    update: (containers: ContainerSpec[]) => ContainerSpec[],
    options?: ChangeOptions
  ): void {
    const entries = keys.map((key) => this.getEntry(key))
    if (entries.some((entry) => !entry)) return
    this.change(
      label,
      (snapshot) => {
        const current = entries.map((entry) =>
          snapshot.documents.get(entry!.path)?.containers.find((container) => container.id === entry!.container.id)
        )
        if (current.some((container) => !container)) return snapshot
        const next = update(current as ContainerSpec[])
        if (next.every((container, index) => container === current[index])) return snapshot
        const documents = new Map(snapshot.documents)
        for (const [index, entry] of entries.entries()) {
          if (next[index] === current[index]) continue
          const document = documents.get(entry!.path)!
          const containers = document.containers.map((container) =>
            container.id === entry!.container.id ? next[index]! : container
          )
          documents.set(entry!.path, { ...document, containers })
        }
        return { ...snapshot, documents }
      },
      options
    )
  }

  /**
   * Changes what a design shows, which isn't undoable. The view is kept tidy, so switching something on and off again
   * leaves the file as it was.
   */
  updateView(key: string, update: (view: ContainerViewSettings) => ContainerViewSettings): void {
    this.updateContainer(key, "Change view", (container) => withTidyView(container, update(container.view ?? {})), {
      history: false
    })
  }

  /** Changes token values as one undoable step. They show at once, and Save writes them to the stylesheet. */
  changeTokens(label: string, edits: readonly TokenEdit[], options?: ChangeOptions): void {
    this.change(label, (snapshot) => ({ ...snapshot, tokens: withTokenEdits(snapshot.tokens, edits) }), options)
  }

  setPosition(key: string, position: { x: number; y: number }): void {
    const rounded = { x: Math.round(position.x), y: Math.round(position.y) }
    this.updateContainer(
      key,
      "Move design",
      (container) =>
        container.position.x === rounded.x && container.position.y === rounded.y
          ? container
          : { ...container, position: rounded },
      { group: `move:${key}` }
    )
  }

  setModes(modes: ModeSettings, label = "Edit modes"): void {
    this.change(label, (snapshot) => ({ ...snapshot, modes }))
  }

  /** Adds a design to a file, creating the file when it doesn't exist yet. Returns the design's key. */
  addContainer(path: string, container: ContainerSpec, label = "Add design"): string {
    this.change(label, (snapshot) => {
      const document = snapshot.documents.get(path) ?? { version: 3, containers: [] }
      const next = { ...document, containers: [...document.containers, container] }
      return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
    })
    return containerKey(path, container.id)
  }

  removeContainer(key: string, label = "Delete design"): void {
    const entry = this.getEntry(key)
    if (!entry) return
    this.change(label, (snapshot) => {
      const document = snapshot.documents.get(entry.path)
      if (!document) return snapshot
      const containers = document.containers.filter((container) => container.id !== entry.container.id)
      return { ...snapshot, documents: new Map(snapshot.documents).set(entry.path, { ...document, containers }) }
    })
  }

  addNote(path: string, note: NoteSpec): string {
    this.change("Add text", (snapshot) => {
      const document = snapshot.documents.get(path) ?? { version: 3, containers: [] }
      const next = { ...document, notes: [...(document.notes ?? []), note] }
      return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
    })
    return containerKey(path, note.id)
  }

  updateNote(
    key: string,
    label: string,
    update: (note: NoteSpec) => NoteSpec | undefined,
    options?: ChangeOptions
  ): void {
    const entry = this.notes.find((candidate) => candidate.key === key)
    if (!entry) return
    this.change(
      label,
      (snapshot) => {
        const document = snapshot.documents.get(entry.path)
        const current = document?.notes?.find((note) => note.id === entry.note.id)
        if (!document?.notes || !current) return snapshot
        const next = update(current)
        if (next === current) return snapshot
        const notes = next
          ? document.notes.map((note) => (note === current ? next : note))
          : document.notes.filter((note) => note !== current)
        const updated: CanvasDocument = { ...document, notes }
        if (notes.length === 0) delete updated.notes
        return { ...snapshot, documents: new Map(snapshot.documents).set(entry.path, updated) }
      },
      options
    )
  }

  /** Saves: writes every file with unsaved changes, and resolves once they're all on disk. */
  async flush(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.failures.clear()
    for (const path of this.unsavedPaths()) this.write(path)
    await Promise.allSettled(this.writing)
    const failure = this.failure()
    if (failure) throw new Error(failure)
  }

  /** The documents, modes and component list corrections as one project file, as Save a copy writes it. */
  merged(): CanvasDocument {
    const all = [...this.documents.values()]
    const notes = all.flatMap((document) => document.notes ?? [])
    const custom = JSON.stringify(this.modes) !== JSON.stringify(defaultModeSettings)
    const detection = this.documents.get(this.mainPath)?.detection
    return {
      version: 3,
      containers: all.flatMap((document) => document.containers),
      ...(notes.length > 0 ? { notes } : {}),
      ...(custom ? { modes: this.modes } : {}),
      ...(detection ? { detection } : {})
    }
  }

  /** Replaces whole documents, and changes tokens, in one undoable step, as an agent's call does. */
  applyDocuments(
    label: string,
    documents: { path: string; document: CanvasDocument }[],
    modes?: ModeSettings,
    tokens: readonly TokenEdit[] = []
  ): void {
    this.change(label, (snapshot) => {
      const next = new Map(snapshot.documents)
      for (const { path, document } of documents) next.set(path, withoutModes(document))
      return {
        documents: documents.length > 0 ? next : snapshot.documents,
        modes: modes ?? snapshot.modes,
        tokens: withTokenEdits(snapshot.tokens, tokens)
      }
    })
  }

  private snapshot(): Snapshot {
    return { documents: this.documents, modes: this.modes, tokens: this.tokens }
  }

  private restore(next: Snapshot, previous: Snapshot, persist = true): void {
    const changed = [...next.documents.keys()].filter(
      (path) => previous.documents.get(path) !== next.documents.get(path)
    )
    this.documents = persist ? this.adoptSaved(next.documents, changed) : next.documents
    this.modes = next.modes
    this.tokens = next.tokens
    if (!this.tokensUnsaved()) {
      // Back at what the stylesheet holds, so nothing is left that failed to write.
      this.tokenFailure = undefined
      this.failures.delete(this.stylesheet())
    }
    this.index()
    if (next.modes !== previous.modes && !changed.includes(this.mainPath)) changed.push(this.mainPath)
    if (!persist) {
      // It came from the files, so they already hold it.
      const documents = new Map(this.saved.documents)
      for (const path of changed) documents.set(path, next.documents.get(path)!)
      this.saved = { ...this.saved, documents, modes: next.modes !== previous.modes ? next.modes : this.saved.modes }
    } else if (this.persistence.autosave()) {
      for (const path of changed) this.schedule(path)
      if (next.tokens !== previous.tokens) this.schedule(this.stylesheet())
    }
    this.refreshSaveState()
    this.history = {
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      undoLabel: this.past.at(-1)?.label,
      redoLabel: this.future.at(-1)?.label
    }
    this.notify()
  }

  /**
   * Documents changed back to what their files hold (a view switched off again, say) become the saved documents
   * themselves, so they're clean again.
   */
  private adoptSaved(
    documents: ReadonlyMap<string, CanvasDocument>,
    changed: readonly string[]
  ): ReadonlyMap<string, CanvasDocument> {
    let adopted: Map<string, CanvasDocument> | undefined
    for (const path of changed) {
      const document = documents.get(path)
      const saved = this.saved.documents.get(path)
      if (!document || !saved || document === saved || !sameDocument(document, saved)) continue
      adopted ??= new Map(documents)
      adopted.set(path, saved)
    }
    return adopted ?? documents
  }

  private tokensUnsaved(): boolean {
    return !sameTokenValues(this.tokens, this.saved.tokens)
  }

  /** Where token values are written, as unsaved paths name it. */
  private stylesheet(): string {
    return this.tokenWriter?.path ?? "the stylesheet"
  }

  /** Writes the token values that differ from what the stylesheet was last given; once written, that's what it has. */
  private writeTokens(): void {
    const tokens = this.tokens
    const changes = tokenWrites(tokens, this.saved.tokens)
    if (changes.length === 0) return
    const writer = this.tokenWriter
    const path = this.stylesheet()
    const writing = (
      writer ? writer.write(changes) : Promise.reject(new Error("Nothing here can write to the stylesheet"))
    ).then(
      () => {
        this.saved = { ...this.saved, tokens }
        this.failures.delete(path)
        this.tokenFailure = undefined
      },
      (error: unknown) => {
        console.error(`Saving tokens to ${path} failed`, error)
        const reason = error instanceof Error ? error.message : String(error)
        const what = changes.length === 1 ? `--${changes[0]!.name}` : `${changes.length} token values`
        this.failures.set(path, `Couldn't write ${what} to ${path}: ${reason}`)
        this.tokenFailure = { error: reason, tokens: changes }
      }
    )
    this.track(writing)
  }

  /** A file's content as it's written: the main file carries the modes when they aren't the defaults. */
  private payload(path: string, document: CanvasDocument | undefined, modes: ModeSettings): CanvasDocument | undefined {
    if (path !== this.mainPath) return document
    const custom = JSON.stringify(modes) !== JSON.stringify(defaultModeSettings)
    if (!document && !custom) return undefined
    const base = document ?? { version: 3, containers: [] }
    return custom ? { ...base, modes } : base
  }

  /**
   * An entry whose design didn't change stays the same object, and so does each design's library while the designs
   * its instances reach are unchanged, so each board on the canvas draws again only when something it shows changed.
   */
  private index(): void {
    const previous = this.byKey
    this.entries = [...this.documents].flatMap(([path, document]) =>
      document.containers.map((container) => {
        const key = containerKey(path, container.id)
        const kept = previous.get(key)
        return kept?.container === container && kept.path === path ? kept : { key, path, container }
      })
    )
    this.byKey = new Map(this.entries.map((entry) => [entry.key, entry]))
    // The project's own designs come last, so one with a library design's id wins.
    const library = componentLibrary([...this.libraryDesigns, ...this.entries.map((entry) => entry.container)])
    this.library = library
    this.libraries = new Map(
      this.entries.map((entry) => [
        entry.key,
        reachableLibrary(entry.container, library, this.libraries.get(entry.key))
      ])
    )
    this.notes = [...this.documents].flatMap(([path, document]) =>
      (document.notes ?? []).map((note) => ({ key: containerKey(path, note.id), path, note }))
    )
  }

  private schedule(path: string): void {
    clearTimeout(this.timers.get(path))
    this.timers.set(
      path,
      setTimeout(() => {
        this.timers.delete(path)
        this.write(path)
      }, saveDelay)
    )
  }

  /** Writes a file as it is now; once it's on disk, that's what the file is known to hold. */
  private write(path: string): void {
    if (path === this.stylesheet() && !this.documents.has(path)) {
      this.writeTokens()
      return
    }
    const document = this.documents.get(path)
    const modes = this.modes
    const payload = this.payload(path, document, modes)
    const writing = (payload ? this.persistence.saveDocument(path, payload) : Promise.resolve()).then(
      () => {
        const documents = new Map(this.saved.documents)
        if (document) documents.set(path, document)
        this.saved = { ...this.saved, documents, modes: path === this.mainPath ? modes : this.saved.modes }
        this.failures.delete(path)
      },
      (error: unknown) => {
        console.error(`Saving ${path} failed`, error)
        this.failures.set(path, error instanceof Error ? error.message : String(error))
      }
    )
    this.track(writing)
  }

  /** Follows a write until it's done, for the save state. */
  private track(writing: Promise<unknown>): void {
    this.writing.add(writing)
    this.refreshSaveState()
    this.notify()
    void writing.finally(() => {
      this.writing.delete(writing)
      this.refreshSaveState()
      this.notify()
    })
  }

  private failure(): string | undefined {
    return this.failures.values().next().value
  }

  private refreshSaveState(): void {
    const failure = this.failure()
    let next: SaveState
    if (this.writing.size > 0) next = { status: "saving" }
    else if (failure) next = { status: "failed", error: failure }
    else next = this.hasUnsaved() ? { status: "unsaved" } : { status: "saved" }
    const same =
      next.status === this.saveState.status &&
      (next.status !== "failed" || (this.saveState.status === "failed" && this.saveState.error === next.error))
    if (!same) this.saveState = next
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function withoutModes(document: CanvasDocument): CanvasDocument {
  if (!document.modes) return document
  const copy = { ...document }
  delete copy.modes
  return copy
}

/** Undo restores content, not what's being looked at: each design keeps the state and modes it shows now. */
function keepViews(restored: Snapshot, current: Snapshot): Snapshot {
  const documents = new Map(restored.documents)
  for (const [path, document] of restored.documents) {
    const now = current.documents.get(path)
    if (!now) continue
    const containers = document.containers.map((container) => {
      const shown = now.containers.find((candidate) => candidate.id === container.id)
      if (!shown || shown.view === container.view) return container
      const next = { ...container }
      if (shown.view) next.view = shown.view
      else delete next.view
      return next
    })
    if (containers.some((container, index) => container !== document.containers[index])) {
      documents.set(path, { ...document, containers })
    }
  }
  return { ...restored, documents }
}

export function containerKey(path: string, containerId: string): string {
  return `${path}#${containerId}`
}

export function useContainerEntries(store: DesignStore): readonly ContainerEntry[] {
  return useSyncExternalStore(store.subscribe, store.getEntries)
}

export function useContainerEntry(store: DesignStore, key: string | undefined): ContainerEntry | undefined {
  return useSyncExternalStore(store.subscribe, () => (key ? store.getEntry(key) : undefined))
}

/** The designs one design's instances reach, for resolving it. */
export function useLibrary(store: DesignStore, key: string): ComponentLibrary {
  return useSyncExternalStore(store.subscribe, () => store.getLibrary(key))
}

export function useNotes(store: DesignStore): readonly NoteEntry[] {
  return useSyncExternalStore(store.subscribe, store.getNotes)
}

export function useModeSettings(store: DesignStore): ModeSettings {
  return useSyncExternalStore(store.subscribe, store.getModes)
}

export function useHistory(store: DesignStore): HistoryState {
  return useSyncExternalStore(store.subscribe, store.getHistory)
}

export function useSaveState(store: DesignStore): SaveState {
  return useSyncExternalStore(store.subscribe, store.getSaveState)
}
