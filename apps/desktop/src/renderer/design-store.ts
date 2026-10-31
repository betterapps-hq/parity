import {
  type CanvasDocument,
  type ComponentLibrary,
  type ContainerSpec,
  type ContainerViewSettings,
  type ModeSettings,
  type NoteSpec,
  projectComponentLibrary,
  reachableLibrary
} from "@parity-app/core"
import {
  addDesign,
  addNote,
  type ChangeOptions,
  changeDesign,
  changeDesigns,
  changeNote,
  type Checkpoint,
  checkpoint as historyCheckpoint,
  type DesignHistory,
  type DesignRef,
  type DesignSnapshot,
  type DesignStep,
  deleteDesign,
  type FileWrite,
  fileWrite,
  type HistoryState,
  mergedDocument,
  moveDesign,
  openDesigns,
  recordChange,
  redoChange,
  reloadFile,
  replaceDocuments,
  revertTo,
  type SaveState,
  saveFailure,
  startSave,
  type TokenChange,
  type TokenEdit,
  type TokenEdits,
  type TokenFailure,
  undoChange,
  unsavedPaths,
  withStylesheet,
  withTidyView,
  withTokenEdits,
  writeFailed,
  writeStarted,
  writeSucceeded
} from "@parity-app/editor"
import { useSyncExternalStore } from "react"

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

/** Writes token values into the project's stylesheet, `path`. */
export interface TokenWriter {
  path: string
  write(changes: TokenChange[]): Promise<unknown>
}

const saveDelay = 300
/** For a key with no design, so asking for its library gives the same empty one each time. */
const noLibrary: ComponentLibrary = new Map()

/**
 * The open designs, the project's modes and the tokens edited on the canvas, with undo, for the canvas and panels to
 * subscribe to. What a change, an undo or a save does is `@parity-app/editor`'s history; this store holds it, writes
 * the files it says to through the persistence it's given (a moment after each change, with automatic saving on), and
 * indexes the designs, which the canvas (tldraw) only projects. Token values go into the project's stylesheet through
 * the writer the token store gives it.
 */
export class DesignStore {
  private state: DesignHistory
  private tokenWriter: TokenWriter | undefined
  private entries: readonly ContainerEntry[] = []
  private byKey: ReadonlyMap<string, ContainerEntry> = new Map()
  private libraries: ReadonlyMap<string, ComponentLibrary> = new Map()
  private library: ComponentLibrary = noLibrary
  private notes: readonly NoteEntry[] = []
  private readonly listeners = new Set<() => void>()
  /** Saves waiting to happen, with automatic saving on. */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly writing = new Set<Promise<unknown>>()

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
    this.state = openDesigns(documents, modes, mainPath)
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
  /** The component designs the project's libraries bring, for drawing elsewhere with the same library. */
  getLibraryDesigns = (): readonly ContainerSpec[] => this.libraryDesigns
  getNotes = () => this.notes
  getModes = (): ModeSettings => this.state.current.modes
  getHistory = (): HistoryState => this.state.historyState
  getSaveState = (): SaveState => this.state.saveState
  getTokenEdits = (): TokenEdits => this.state.current.tokens
  getTokenFailure = (): TokenFailure | undefined => this.state.tokenFailure

  /** Says how token values reach the stylesheet. The latest writer is used, as the project's guest can be reloaded. */
  writeTokensWith(writer: TokenWriter): void {
    this.tokenWriter = writer
    this.state = withStylesheet(this.state, writer.path)
  }

  /** Files with changes that aren't saved yet: project files, and the stylesheet when tokens were edited. */
  unsavedPaths(): string[] {
    return unsavedPaths(this.state)
  }

  hasUnsaved(): boolean {
    return this.unsavedPaths().length > 0
  }
  getDocuments = (): { path: string; document: CanvasDocument }[] =>
    [...this.state.current.documents].map(([path, document]) => ({ path, document }))

  /** Applies one change to the documents and modes, recording it for undo unless told not to. */
  change(label: string, update: (snapshot: DesignSnapshot) => DesignSnapshot, options: ChangeOptions = {}): void {
    this.take(recordChange(this.state, label, update(this.state.current), options))
  }

  /**
   * A project file changed outside the canvas (an agent, git, a text editor): its content replaces what's here as one
   * undoable step. A file with unsaved changes here is left alone unless forced, and false says so, so the person can
   * choose which to keep.
   */
  reloadDocument(path: string, document: CanvasDocument, force = false): boolean {
    const step = reloadFile(this.state, path, document, force)
    if (!step) return false
    clearTimeout(this.timers.get(path))
    this.timers.delete(path)
    this.take(step)
    return true
  }

  /**
   * Where a design and the history are now, for a gesture that writes to it as it goes, in one group (see `change`), and
   * can be cancelled: resizing writes each step as the pointer moves, and Escape takes it all back with `revert`.
   */
  checkpoint(key: string, group: string): Checkpoint | undefined {
    const entry = this.getEntry(key)
    return entry && historyCheckpoint(this.state, entry.path, entry.container, group)
  }

  /**
   * Takes back the gesture's changes since a checkpoint as though it never made them: its design is as it was, and its
   * steps leave undo, with Redo as it was. Anything else that changed meanwhile, such as another file an agent changed
   * or another design in the same file, stays, with its undo step, which undoes to the gesture's design as it was.
   * Views stay as they are now, as undo leaves them.
   */
  revert(checkpoint: Checkpoint): void {
    this.take(revertTo(this.state, checkpoint))
  }

  undo(): void {
    this.take(undoChange(this.state))
  }

  redo(): void {
    this.take(redoChange(this.state))
  }

  updateContainer(
    key: string,
    label: string,
    update: (container: ContainerSpec) => ContainerSpec,
    options?: ChangeOptions
  ): void {
    const design = this.designOf(key)
    if (!design) return
    this.change(label, (snapshot) => changeDesign(snapshot, design, update), options)
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
    const designs: DesignRef[] = []
    for (const key of keys) {
      const design = this.designOf(key)
      if (!design) return
      designs.push(design)
    }
    this.change(label, (snapshot) => changeDesigns(snapshot, designs, update), options)
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
    this.updateContainer(key, "Move design", (container) => moveDesign(container, position), { group: `move:${key}` })
  }

  setModes(modes: ModeSettings, label = "Edit modes"): void {
    this.change(label, (snapshot) => ({ ...snapshot, modes }))
  }

  /** Adds a design to a file, creating the file when it doesn't exist yet. Returns the design's key. */
  addContainer(path: string, container: ContainerSpec, label = "Add design"): string {
    this.change(label, (snapshot) => addDesign(snapshot, path, container))
    return containerKey(path, container.id)
  }

  removeContainer(key: string, label = "Delete design"): void {
    const design = this.designOf(key)
    if (!design) return
    this.change(label, (snapshot) => deleteDesign(snapshot, design))
  }

  addNote(path: string, note: NoteSpec): string {
    this.change("Add text", (snapshot) => addNote(snapshot, path, note))
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
    const note = { path: entry.path, id: entry.note.id }
    this.change(label, (snapshot) => changeNote(snapshot, note, update), options)
  }

  /** Saves: writes every file with unsaved changes, and resolves once they're all on disk. */
  async flush(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    const started = startSave(this.state)
    if (started !== this.state) {
      this.state = started
      this.notify()
    }
    for (const path of this.unsavedPaths()) this.write(path)
    await Promise.allSettled(this.writing)
    const failure = saveFailure(this.state)
    if (failure) throw new Error(failure)
  }

  /** The documents, modes and component list corrections as one project file, as Save a copy writes it. */
  merged(): CanvasDocument {
    return mergedDocument(this.state)
  }

  /** Replaces whole documents, and changes tokens, in one undoable step, as an agent's call does. */
  applyDocuments(
    label: string,
    documents: { path: string; document: CanvasDocument }[],
    modes?: ModeSettings,
    tokens: readonly TokenEdit[] = []
  ): void {
    this.change(label, (snapshot) => replaceDocuments(snapshot, documents, modes, tokens))
  }

  private designOf(key: string): DesignRef | undefined {
    const entry = this.getEntry(key)
    return entry && { path: entry.path, id: entry.container.id }
  }

  /** Moves to the step the history took, saving the files it changed a moment later with automatic saving on. */
  private take(step: DesignStep | undefined): void {
    if (!step) return
    this.state = step.history
    this.index()
    if (step.writes.length > 0 && this.persistence.autosave()) {
      for (const path of step.writes) this.schedule(path)
    }
    this.notify()
  }

  /**
   * An entry whose design didn't change stays the same object, and so does each design's library while the designs
   * its instances reach are unchanged, so each board on the canvas draws again only when something it shows changed.
   */
  private index(): void {
    const previous = this.byKey
    const documents = this.state.current.documents
    this.entries = [...documents].flatMap(([path, document]) =>
      document.containers.map((container) => {
        const key = containerKey(path, container.id)
        const kept = previous.get(key)
        return kept?.container === container && kept.path === path ? kept : { key, path, container }
      })
    )
    this.byKey = new Map(this.entries.map((entry) => [entry.key, entry]))
    const library = projectComponentLibrary(
      this.libraryDesigns,
      this.entries.map((entry) => entry.container)
    )
    this.library = library
    this.libraries = new Map(
      this.entries.map((entry) => [
        entry.key,
        reachableLibrary(entry.container, library, this.libraries.get(entry.key))
      ])
    )
    this.notes = [...documents].flatMap(([path, document]) =>
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
    const write = fileWrite(this.state, path)
    if (!write) return
    const writing = this.send(write).then(
      () => this.settle(writeSucceeded(this.state, write)),
      (error: unknown) => {
        console.error(write.kind === "tokens" ? `Saving tokens to ${path} failed` : `Saving ${path} failed`, error)
        this.settle(writeFailed(this.state, write, error))
      }
    )
    this.writing.add(writing)
    void writing.finally(() => this.writing.delete(writing))
    this.settle(writeStarted(this.state))
  }

  /** Sends a write to the stylesheet's writer or the project's files. */
  private send(write: FileWrite): Promise<unknown> {
    if (write.kind === "tokens") {
      const writer = this.tokenWriter
      return writer
        ? writer.write(write.changes)
        : Promise.reject(new Error("Nothing here can write to the stylesheet"))
    }
    return write.content ? this.persistence.saveDocument(write.path, write.content) : Promise.resolve()
  }

  /** Takes where a write has got to, for the save state. */
  private settle(state: DesignHistory): void {
    this.state = state
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
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
