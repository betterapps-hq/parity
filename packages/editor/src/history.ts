import { type CanvasDocument, type ContainerSpec, defaultModeSettings, type ModeSettings } from "@parity-app/core"
import { sameDocument, sameValue } from "./document-equality.ts"
import { noTokenEdits, sameTokenValues, type TokenEdits, type TokenWrite, tokenWrites } from "./token-edits.ts"

/** What the editor holds of a project: its open documents, its modes, and the token values edited on the canvas. */
export interface DesignSnapshot {
  documents: ReadonlyMap<string, CanvasDocument>
  modes: ModeSettings
  /** Token values edited on the canvas, which Save writes to the project's stylesheet. */
  tokens: TokenEdits
}

/** One undoable step: what it's called, and what things were before it. */
export interface HistoryEntry {
  label: string
  before: DesignSnapshot
  /** The gesture whose changes this step holds, until the gesture ends (see `ChangeOptions.gesture`). */
  gesture?: string
  /** What Redo had when the gesture's step began, back again if the gesture ends up changing nothing. */
  redo?: readonly HistoryEntry[]
}

/** A design and the history at one moment, to go back to (see `checkpoint`). */
export interface Checkpoint {
  readonly path: string
  /** The design as it was. */
  readonly container: ContainerSpec
  /** The gesture whose changes are taken back. */
  readonly gesture: string
  readonly past: readonly HistoryEntry[]
  readonly future: readonly HistoryEntry[]
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

/** Why the stylesheet couldn't take the last token values Save wrote, and which tokens they were. */
export interface TokenFailure {
  error: string
  tokens: readonly TokenWrite[]
}

/**
 * A project's designs with their undo history and what their files hold. Changes stay here, unsaved, until they're
 * written; undoing back to what was saved, or changing a file back to it, makes it clean again. Modes are kept apart
 * from the documents, and written into the main file when they differ from the defaults. Each function takes one and
 * returns the next, leaving the one it was given as it was.
 */
export interface DesignHistory {
  readonly current: DesignSnapshot
  /** What the files hold: as loaded, or as last saved. */
  readonly saved: DesignSnapshot
  readonly past: readonly HistoryEntry[]
  readonly future: readonly HistoryEntry[]
  /** The same object until a change, an undo or a redo. */
  readonly historyState: HistoryState
  /**
   * Counts what's here changing: each change, undo, redo, revert or reload that changes the documents, the modes or
   * the token edits. Saving, and what the canvas draws or where it looks, leave it as it is.
   */
  readonly revision: number
  /** The same object while the state it describes stays the same. */
  readonly saveState: SaveState
  /** The project file new designs and the modes go into. */
  readonly mainPath: string
  /** Where token values are written, as unsaved paths name it. */
  readonly stylesheet: string
  /** Why each file's last save failed, until one of its saves succeeds. */
  readonly failures: ReadonlyMap<string, string>
  readonly tokenFailure: TokenFailure | undefined
  /** How many writes have started and not finished. */
  readonly writing: number
}

export interface ChangeOptions {
  /** View changes (which state or modes show) aren't undoable. */
  history?: boolean
  /**
   * The gesture the change is part of: a drag, a resize, a scrub or a run of arrow presses. Its changes are one undo
   * step however long it takes and however many it makes, from its first change until it ends (`endGesture`). Each
   * gesture has an id of its own, which its source makes when the gesture begins.
   */
  gesture?: string
  /** Changes that came from the files themselves aren't written back to them. */
  persist?: boolean
}

/** A step taken: the history after it, and the files it changed that are to be written, for saving automatically. */
export interface DesignStep {
  history: DesignHistory
  writes: readonly string[]
}

/** A file to write as it is now: a project file with its content, or the token values the stylesheet doesn't have. */
export type FileWrite =
  | {
      kind: "document"
      path: string
      document: CanvasDocument | undefined
      modes: ModeSettings
      /** What goes into the file: the main file carries the modes. Undefined when there's nothing to write. */
      content: CanvasDocument | undefined
    }
  | { kind: "tokens"; path: string; tokens: TokenEdits; changes: TokenWrite[] }

/** The most steps Undo goes back. */
export const historyLimit = 200

/** The history of designs just opened: nothing to undo, and what's here is what the files hold. */
export function openDesigns(
  documents: readonly { path: string; document: CanvasDocument }[],
  modes: ModeSettings,
  mainPath: string,
  stylesheet = "the stylesheet"
): DesignHistory {
  const current: DesignSnapshot = {
    documents: new Map(documents.map(({ path, document }) => [path, withoutModes(document)])),
    modes,
    tokens: noTokenEdits
  }

  return {
    current,
    saved: current,
    past: [],
    future: [],
    historyState: { canUndo: false, canRedo: false },
    revision: 0,
    saveState: { status: "saved" },
    mainPath,
    stylesheet,
    failures: new Map(),
    tokenFailure: undefined,
    writing: 0
  }
}

/** Names the stylesheet token values are written to. */
export function withStylesheet(history: DesignHistory, stylesheet: string): DesignHistory {
  return history.stylesheet === stylesheet ? history : { ...history, stylesheet }
}

/**
 * Applies one change, `next`, recording it for undo unless told not to. Undefined when it changes nothing, so nothing
 * is recorded.
 *
 * A gesture's changes (see `ChangeOptions.gesture`) go into one step: its first change makes the step, labelled by
 * that change, and the rest join it while it's the latest step, whatever time passes between them. A change made
 * since by something else, or an undo, ends the step, and the gesture's next change starts another. A gesture that
 * comes back to where its step began leaves no step, and Redo as it was before the gesture; one that changes nothing
 * makes none.
 */
export function recordChange(
  history: DesignHistory,
  label: string,
  next: DesignSnapshot,
  options: ChangeOptions = {}
): DesignStep | undefined {
  const before = history.current

  if (next.documents === before.documents && next.modes === before.modes && next.tokens === before.tokens) {
    return undefined
  }

  const { gesture } = options
  let { past, future } = history

  if (options.history !== false) {
    const last = past.at(-1)

    if (gesture && last?.gesture === gesture) {
      if (sameSnapshot(last.before, next)) {
        // Back where the gesture's step began: the step goes, and so does the difference, and Redo is as it was.
        return restore({ ...history, past: past.slice(0, -1), future: last.redo ?? [] }, keepViews(last.before, next))
      }
    } else {
      if (gesture && sameSnapshot(before, next)) {
        return undefined
      }

      past = [...past, gesture ? { label, before, gesture, redo: future } : { label, before }]

      if (past.length > historyLimit) {
        past = past.slice(1)
      }
    }

    future = []
  }

  return restore({ ...history, past, future }, next, options.persist !== false)
}

/**
 * A gesture has ended: its step takes no more changes, so a change made with it later starts a step of its own, and
 * what Redo had before it is gone for good. The same history when it has no step.
 */
export function endGesture(history: DesignHistory, gesture: string): DesignHistory {
  if (!history.past.some((step) => step.gesture === gesture)) {
    return history
  }

  const past = history.past.map((step) =>
    step.gesture === gesture ? { label: step.label, before: step.before } : step
  )

  return { ...history, past }
}

/**
 * A project file changed outside the canvas (an agent, git, a text editor): its content replaces what's here as one
 * undoable step. A file with unsaved changes here is left alone unless forced, and undefined says so, so the person can
 * choose which to keep.
 */
export function reloadFile(
  history: DesignHistory,
  path: string,
  document: CanvasDocument,
  force = false
): DesignStep | undefined {
  if (!force && unsavedPaths(history).includes(path)) {
    return undefined
  }

  const { current } = history

  const next: DesignSnapshot = {
    ...current,
    documents: new Map(current.documents).set(path, withoutModes(document)),
    modes: path === history.mainPath ? (document.modes ?? defaultModeSettings) : current.modes
  }

  return recordChange(history, `Reload ${path}`, next, { persist: false })
}

/**
 * Where a design (`container`, in the file at `path`) and the history are now, for a gesture that writes to it as it
 * goes and can be cancelled: resizing writes each step as the pointer moves, and Escape takes it all back with
 * `revertTo`.
 */
export function checkpoint(
  history: DesignHistory,
  path: string,
  container: ContainerSpec,
  gesture: string
): Checkpoint {
  return { path, container, gesture, past: history.past, future: history.future }
}

/**
 * Takes back the gesture's changes since a checkpoint as though it never made them: its design is as it was, and its
 * steps leave undo, with Redo as it was. Anything else that changed meanwhile, such as another file an agent changed
 * or another design in the same file, stays, with its undo step, which undoes to the gesture's design as it was.
 * Views stay as they are now, as undo leaves them.
 */
export function revertTo(history: DesignHistory, checkpoint: Checkpoint): DesignStep {
  const { path, container, gesture } = checkpoint
  // Steps from before the checkpoint, known by what they undo to, since a gesture ending since makes its step anew.
  const earlier = new Set(checkpoint.past.map((step) => step.before))

  // Only the gesture's design goes back, in its file as the file is now, so other designs' changes there stay.
  const withDesign = (snapshot: DesignSnapshot): DesignSnapshot => {
    const document = snapshot.documents.get(path)

    if (!document) {
      return snapshot
    }

    const containers = document.containers.map((each) => (each.id === container.id ? container : each))

    return { ...snapshot, documents: new Map(snapshot.documents).set(path, { ...document, containers }) }
  }

  // Undo as the checkpoint saw it, whole, since a gesture's own steps can push its oldest out at the limit, then what
  // else changed since, which keeps the limit.
  const others = history.past
    .filter((step) => !earlier.has(step.before) && step.gesture !== gesture)
    .map((step) => ({ ...step, before: withDesign(step.before) }))

  const past = [...checkpoint.past, ...others].slice(-historyLimit)
  const future = others.length === 0 ? checkpoint.future : history.future
  const current = history.current

  return restore({ ...history, past, future }, keepViews(withDesign(current), current))
}

/** Goes back a step, keeping what each design shows. Undefined when there's nothing to undo. */
export function undoChange(history: DesignHistory): DesignStep | undefined {
  const entry = history.past.at(-1)

  if (!entry) {
    return undefined
  }

  const current = history.current

  return restore(
    {
      ...history,
      past: history.past.slice(0, -1),
      future: [...history.future, { label: entry.label, before: current }]
    },
    keepViews(entry.before, current)
  )
}

/** Goes forward a step undone, keeping what each design shows. Undefined when there's nothing to redo. */
export function redoChange(history: DesignHistory): DesignStep | undefined {
  const entry = history.future.at(-1)

  if (!entry) {
    return undefined
  }

  const current = history.current

  return restore(
    {
      ...history,
      past: [...history.past, { label: entry.label, before: current }],
      future: history.future.slice(0, -1)
    },
    keepViews(entry.before, current)
  )
}

/** Files with changes that aren't saved yet: project files, and the stylesheet when tokens were edited. */
export function unsavedPaths(history: DesignHistory): string[] {
  const { current, saved } = history
  const paths = new Set([...current.documents.keys(), ...saved.documents.keys()])
  const unsaved = [...paths].filter((path) => current.documents.get(path) !== saved.documents.get(path))

  if (current.modes !== saved.modes && !unsaved.includes(history.mainPath)) {
    unsaved.push(history.mainPath)
  }

  if (tokensUnsaved(history)) {
    unsaved.push(history.stylesheet)
  }

  return unsaved
}

/**
 * Save is starting again, so the failures of earlier saves are forgotten until its writes say otherwise, and the save
 * state says so: saved when nothing is left to write, such as after undoing a failed write back to what the file holds.
 */
export function startSave(history: DesignHistory): DesignHistory {
  return history.failures.size === 0 ? history : withSaveState({ ...history, failures: new Map() })
}

/**
 * What writing a file as it is now takes: its content, or, for the stylesheet, the token values that differ from what
 * it was last given. Undefined when the stylesheet already has them all.
 */
export function fileWrite(history: DesignHistory, path: string): FileWrite | undefined {
  const { current, saved } = history

  if (path === history.stylesheet && !current.documents.has(path)) {
    const changes = tokenWrites(current.tokens, saved.tokens)

    return changes.length === 0 ? undefined : { kind: "tokens", path, tokens: current.tokens, changes }
  }

  const document = current.documents.get(path)
  const modes = current.modes

  return { kind: "document", path, document, modes, content: fileContent(history.mainPath, path, document, modes) }
}

/** A write has started: the save state says so until it finishes. */
export function writeStarted(history: DesignHistory): DesignHistory {
  return withSaveState({ ...history, writing: history.writing + 1 })
}

/** A write finished: what it wrote is what the file holds now, and an earlier failure to write it is over. */
export function writeSucceeded(history: DesignHistory, write: FileWrite): DesignHistory {
  const failures = new Map(history.failures)
  failures.delete(write.path)
  let { saved, tokenFailure } = history

  if (write.kind === "tokens") {
    saved = { ...saved, tokens: write.tokens }
    tokenFailure = undefined
  } else {
    const documents = new Map(saved.documents)

    if (write.document) {
      documents.set(write.path, write.document)
    }

    saved = { ...saved, documents, modes: write.path === history.mainPath ? write.modes : saved.modes }
  }

  return withSaveState({ ...history, saved, failures, tokenFailure, writing: history.writing - 1 })
}

/**
 * A write failed: the file keeps its changes, unsaved, and the save state says why. A failed write to the stylesheet
 * names the tokens and the file.
 */
export function writeFailed(history: DesignHistory, write: FileWrite, cause: unknown): DesignHistory {
  const reason = cause instanceof Error ? cause.message : String(cause)
  const failures = new Map(history.failures)
  let { tokenFailure } = history

  if (write.kind === "tokens") {
    const { changes, path } = write
    const what = changes.length === 1 ? `--${changes[0]!.name}` : `${changes.length} token values`
    failures.set(path, `Couldn't write ${what} to ${path}: ${reason}`)
    tokenFailure = { error: reason, tokens: changes }
  } else {
    failures.set(write.path, reason)
  }

  return withSaveState({ ...history, failures, tokenFailure, writing: history.writing - 1 })
}

/** Why the first file that failed to save didn't, until one of its saves succeeds. */
export function saveFailure(history: DesignHistory): string | undefined {
  return history.failures.values().next().value
}

/**
 * The documents and modes as one project file, as Save a copy writes it: every file's designs, notes, canvas objects and
 * links, with the main file's component corrections and lens sources.
 */
export function mergedDocument(history: DesignHistory): CanvasDocument {
  const { documents, modes } = history.current
  const all = [...documents.values()]
  const notes = all.flatMap((document) => document.notes ?? [])

  // Two files may place the same table or reuse a link id; the first keeps it, so the copy still opens.
  const objects = firstOfEach(
    all.flatMap((document) => document.objects ?? []),
    (object) => JSON.stringify([object.kind, object.ref])
  )

  const links = firstOfEach(
    all.flatMap((document) => document.links ?? []),
    (link) => link.id
  )

  const custom = JSON.stringify(modes) !== JSON.stringify(defaultModeSettings)
  const main = documents.get(history.mainPath)
  const detection = main?.detection
  const sources = main?.sources

  const merged: CanvasDocument = { version: 3, containers: all.flatMap((document) => document.containers) }

  if (notes.length > 0) {
    merged.notes = notes
  }

  if (custom) {
    merged.modes = modes
  }

  if (detection) {
    merged.detection = detection
  }

  if (objects.length > 0) {
    merged.objects = objects
  }

  if (links.length > 0) {
    merged.links = links
  }

  if (sources) {
    merged.sources = sources
  }

  return merged
}

function firstOfEach<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()

  return items.filter((item) => !seen.has(key(item)) && seen.add(key(item)))
}

/** A document without the modes, which the history keeps apart. */
export function withoutModes(document: CanvasDocument): CanvasDocument {
  if (!document.modes) {
    return document
  }

  const copy = { ...document }
  delete copy.modes

  return copy
}

/**
 * Moves to `next` from what's here now. Files that came from the files themselves (`persist` false) are taken as saved;
 * otherwise the files they change are to be written.
 */
function restore(history: DesignHistory, next: DesignSnapshot, persist = true): DesignStep {
  const previous = history.current
  const changed = [...next.documents.keys()].filter((path) => previous.documents.get(path) !== next.documents.get(path))
  const documents = persist ? adoptSaved(history.saved, next.documents, changed) : next.documents
  let { saved, failures, tokenFailure } = history
  const current: DesignSnapshot = { documents, modes: next.modes, tokens: next.tokens }

  if (sameTokenValues(current.tokens, saved.tokens) && (tokenFailure || failures.has(history.stylesheet))) {
    // Back at what the stylesheet holds, so nothing is left that failed to write.
    tokenFailure = undefined
    const remaining = new Map(failures)
    remaining.delete(history.stylesheet)
    failures = remaining
  }

  if (next.modes !== previous.modes && !changed.includes(history.mainPath)) {
    changed.push(history.mainPath)
  }

  const writes: string[] = []

  if (!persist) {
    // It came from the files, so they already hold it.
    const savedDocuments = new Map(saved.documents)

    for (const path of changed) {
      savedDocuments.set(path, next.documents.get(path)!)
    }

    saved = { ...saved, documents: savedDocuments, modes: next.modes !== previous.modes ? next.modes : saved.modes }
  } else {
    writes.push(...changed)

    if (next.tokens !== previous.tokens) {
      writes.push(history.stylesheet)
    }
  }

  const { past, future } = history

  const moved =
    next.documents !== previous.documents || next.modes !== previous.modes || next.tokens !== previous.tokens

  const state = withSaveState({
    ...history,
    revision: moved ? history.revision + 1 : history.revision,
    current,
    saved,
    failures,
    tokenFailure,
    historyState: {
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoLabel: past.at(-1)?.label,
      redoLabel: future.at(-1)?.label
    }
  })

  return { history: state, writes }
}

/**
 * Documents changed back to what their files hold (a view switched off again, say) become the saved documents
 * themselves, so they're clean again.
 */
function adoptSaved(
  saved: DesignSnapshot,
  documents: ReadonlyMap<string, CanvasDocument>,
  changed: readonly string[]
): ReadonlyMap<string, CanvasDocument> {
  let adopted: Map<string, CanvasDocument> | undefined

  for (const path of changed) {
    const document = documents.get(path)
    const file = saved.documents.get(path)

    if (!document || !file || document === file || !sameDocument(document, file)) {
      continue
    }

    adopted ??= new Map(documents)
    adopted.set(path, file)
  }

  return adopted ?? documents
}

/** Whether two snapshots say the same: the same files, each the same with views compared tidied, modes and tokens. */
function sameSnapshot(a: DesignSnapshot, b: DesignSnapshot): boolean {
  if (a.documents.size !== b.documents.size) {
    return false
  }

  for (const [path, document] of a.documents) {
    const other = b.documents.get(path)

    if (!other || !sameDocument(document, other)) {
      return false
    }
  }

  return sameValue(a.modes, b.modes) && sameTokenValues(a.tokens, b.tokens)
}

function tokensUnsaved(history: DesignHistory): boolean {
  return !sameTokenValues(history.current.tokens, history.saved.tokens)
}

/** A file's content as it's written: the main file carries the modes when they aren't the defaults. */
function fileContent(
  mainPath: string,
  path: string,
  document: CanvasDocument | undefined,
  modes: ModeSettings
): CanvasDocument | undefined {
  if (path !== mainPath) {
    return document
  }

  const custom = JSON.stringify(modes) !== JSON.stringify(defaultModeSettings)

  if (!document && !custom) {
    return undefined
  }

  const base = document ?? { version: 3, containers: [] }

  return custom ? { ...base, modes } : base
}

function withSaveState(history: DesignHistory): DesignHistory {
  const failure = saveFailure(history)
  let next: SaveState

  if (history.writing > 0) {
    next = { status: "saving" }
  } else if (failure) {
    next = { status: "failed", error: failure }
  } else {
    next = unsavedPaths(history).length > 0 ? { status: "unsaved" } : { status: "saved" }
  }

  const previous = history.saveState

  const same =
    next.status === previous.status &&
    (next.status !== "failed" || (previous.status === "failed" && previous.error === next.error))

  return same ? history : { ...history, saveState: next }
}

/** Undo restores content, not what's being looked at: each design keeps the state and modes it shows now. */
function keepViews(restored: DesignSnapshot, current: DesignSnapshot): DesignSnapshot {
  const documents = new Map(restored.documents)

  for (const [path, document] of restored.documents) {
    const now = current.documents.get(path)

    if (!now) {
      continue
    }

    const containers = document.containers.map((container) => {
      const shown = now.containers.find((candidate) => candidate.id === container.id)

      if (!shown || shown.view === container.view) {
        return container
      }

      const next = { ...container }

      if (shown.view) {
        next.view = shown.view
      } else {
        delete next.view
      }

      return next
    })

    if (containers.some((container, index) => container !== document.containers[index])) {
      documents.set(path, { ...document, containers })
    }
  }

  return { ...restored, documents }
}
