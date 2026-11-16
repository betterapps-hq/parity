import type {
  CanvasDocument,
  ComponentLibrary,
  ContainerSpec,
  ContainerViewSettings,
  ModeSettings
} from "@parity-app/core"
import {
  editStatus,
  type EditStatus,
  mergedDocument,
  savedView,
  type SaveState,
  type StatusOptions,
  withoutModes
} from "@parity-app/editor"
import {
  type ContainerEntry,
  componentLibrary,
  containerEntries,
  containerEntry,
  createProjectDoc,
  createProjectSaver,
  type DocChange,
  type DocProvider,
  type GestureEnded,
  type GestureId,
  type NoteEntry,
  noteEntries,
  type Persistence,
  type ProjectDoc,
  type ProjectSaver,
  type ReferenceEntry,
  reachableLibrary,
  referenceEntries,
  type TransactProblem,
  type TransactResult,
  type UndoState
} from "@parity-app/multiplayer"
import { localProvider } from "@parity-app/multiplayer-local"
import { useSyncExternalStore } from "react"
import type { LiveRoom } from "./live-room.ts"
import { track } from "./report-error.ts"

/*
 * The project document an open project's designs live in (docs/proposals/multiplayer.md: How the session moves onto
 * it). This is the one place that picks the provider: the window stays on the local provider, and Loro comes in only
 * for a live room: today, the one `pnpm dev` opens with `PARITY_ROOM=1` (live-room.ts). Everything else edits through `@parity-app/multiplayer`'s functions for callers with
 * `session.doc`, reads through its lookups, and saves through `session.saver`.
 */

/** The provider the window opens projects with. */
export const provider: DocProvider = localProvider

/** The most steps Undo goes back. */
export const undoLimit = 200

/** An open project's document, what saves it, and the designs its libraries bring. */
export interface DocSession {
  readonly doc: ProjectDoc
  readonly saver: ProjectSaver
  /**
   * Component designs from the project's libraries' `.lib.par` canvases (`nova/settings-row`), which instances can
   * place but the project's files don't hold.
   */
  readonly libraryDesigns: readonly ContainerSpec[]
  /** Whether each change saves itself a moment later, or waits for Save. */
  readonly autosave: () => boolean
  /** Tells this session's revisions apart from another's, such as the same project's after it's reopened. */
  readonly epoch: string
  /** The live room the project is open in, in development, or nothing. */
  readonly room?: LiveRoom | undefined
}

export interface OpenOptions {
  /** The project's own files, without their modes. */
  files: readonly { path: string; document: CanvasDocument }[]
  /** Files drawn from the project's code each time it opens: its pages, component boards and stories. */
  drawn: readonly { path: string; document: CanvasDocument }[]
  modes: ModeSettings
  /** The project file new designs and the modes go into. */
  main: string
  persistence: Persistence
  libraryDesigns?: readonly ContainerSpec[]
  /** A live room to open the project in, on its provider, saving only while this copy hosts it. */
  room?: LiveRoom | undefined
}

/** What a document has done, for `projectDoc.closed`. */
interface Tally {
  opened: number
  transactions: number
  operations: number
  undos: number
  redos: number
  refused: number
  transactMs: number
}

const tallies = new WeakMap<ProjectDoc, Tally>()

/**
 * How many times each document has changed: every transaction, undo, redo and replaced file, token edits included,
 * which never reach the provider and so leave its version as it was.
 */
const revisions = new WeakMap<ProjectDoc, { count: number }>()

/** Opens a project's files in a document, with a saver, recording how long it took (`projectDoc.opened`). */
export function openDocSession(options: OpenOptions): DocSession {
  const started = performance.now()
  const files = [...options.files, ...options.drawn].map(({ path }) => path)
  const { room } = options
  const opener = room?.provider ?? provider

  try {
    // The modes are the document's own state, so a main file that still carries them is opened without.
    const backend = opener.open({
      files: [
        ...options.files.map((file) => ({ ...file, document: withoutModes(file.document) })),
        ...options.drawn.map((file) => ({ ...file, drawn: true }))
      ],
      main: options.main,
      modes: options.modes
    })

    const doc = tallied(createProjectDoc(backend, { undoLimit, main: options.main }))
    const revision = { count: 0 }
    revisions.set(doc, revision)
    doc.subscribe(() => {
      revision.count += 1
    })
    const saver = createProjectSaver(doc, room ? roomPersistence(room, options.persistence) : options.persistence)
    const entries = containerEntries(doc)

    track("projectDoc.opened", {
      provider: opener.name,
      files,
      designs: entries.length,
      layers: entries.reduce((count, entry) => count + layerCount(entry.container.root), 0),
      durationMs: Math.round(performance.now() - started)
    })

    return {
      doc,
      saver,
      libraryDesigns: options.libraryDesigns ?? [],
      autosave: () => options.persistence.autosave(),
      epoch: Math.random().toString(36).slice(2, 10).padEnd(8, "0"),
      room
    }
  } catch (error) {
    room?.leave()
    track("projectDoc.openFailed", {
      provider: opener.name,
      files,
      message: error instanceof Error ? error.message : String(error)
    })

    throw error
  }
}

/** Lets go of a session's document and saver, recording what it did (`projectDoc.closed`). */
export function closeDocSession(session: DocSession): void {
  const { doc } = session
  const tally = tallies.get(doc)

  if (tally) {
    track("projectDoc.closed", {
      provider: doc.provider,
      durationMs: Math.round(performance.now() - tally.opened),
      transactions: tally.transactions,
      operations: tally.operations,
      undos: tally.undos,
      redos: tally.redos,
      refused: tally.refused,
      layers: containerEntries(doc).reduce((count, entry) => count + layerCount(entry.container.root), 0),
      transactMs: Math.round(tally.transactMs)
    })
  }

  session.room?.leave()
  session.saver.dispose()
  doc.dispose()
}

/** Writes only while this copy hosts the room, so copies don't write the same files over each other. */
function roomPersistence(room: LiveRoom, persistence: Persistence): Persistence {
  return {
    ...persistence,
    saveDocument: (path, document, timing) =>
      room.saves() ? persistence.saveDocument(path, document, timing) : Promise.resolve(),
    deleteDocument: (path) => (room.saves() ? persistence.deleteDocument(path) : Promise.resolve())
  }
}

/**
 * The document, counting what it does for `projectDoc.closed` and recording refused transactions
 * (`projectDoc.refused`): one event for each refused outside a gesture, and one for a gesture's at its end.
 */
function tallied(doc: ProjectDoc): ProjectDoc {
  const tally: Tally = {
    opened: performance.now(),
    transactions: 0,
    operations: 0,
    undos: 0,
    redos: 0,
    refused: 0,
    transactMs: 0
  }

  const refusedIn = new Map<GestureId, { attributes: RefusedAttributes; count: number }>()

  const counted: ProjectDoc = Object.create(doc)

  counted.transact = (label, ops, options) => {
    const started = performance.now()
    const result = doc.transact(label, ops, options)
    tally.transactMs += performance.now() - started

    if (result.ok) {
      tally.transactions += 1
      tally.operations += ops.length

      return result
    }

    tally.refused += 1
    const attributes = refusal(doc, label, options.origin, ops, result)
    const gesture = options.gesture && refusedIn.get(options.gesture)

    if (gesture) {
      gesture.count += 1
    } else if (options.gesture) {
      refusedIn.set(options.gesture, { attributes, count: 1 })
    } else {
      track("projectDoc.refused", { ...attributes, count: 1 })
    }

    return result
  }

  counted.endGesture = (gesture): GestureEnded => {
    const refused = refusedIn.get(gesture)

    if (refused) {
      refusedIn.delete(gesture)
      track("projectDoc.refused", { ...refused.attributes, count: refused.count })
    }

    return doc.endGesture(gesture)
  }

  counted.undo = () => {
    const change = doc.undo()

    if (change) {
      tally.undos += 1
    }

    return change
  }

  counted.redo = () => {
    const change = doc.redo()

    if (change) {
      tally.redos += 1
    }

    return change
  }

  tallies.set(counted, tally)

  return counted
}

type RefusedAttributes = Omit<Parameters<typeof track<"projectDoc.refused">>[1], "count">

function refusal(
  doc: ProjectDoc,
  label: string,
  origin: Parameters<ProjectDoc["transact"]>[2]["origin"],
  ops: Parameters<ProjectDoc["transact"]>[1],
  result: Extract<TransactResult, { ok: false }>
): RefusedAttributes {
  const { problem } = result
  const op = ops[problem.op ?? 0]?.op ?? "unknown"
  const recorded = origin === "code" ? "view" : origin
  const kind = problem.kind === "unknownFile" || problem.kind === "takenFile" ? "invalid" : problem.kind

  return { provider: doc.provider, label, origin: recorded, problem: kind, op }
}

function layerCount(node: ContainerSpec["root"]): number {
  let count = 1

  if ("children" in node) {
    for (const child of node.children) {
      count += layerCount(child)
    }
  }

  if ("slots" in node && node.slots) {
    for (const layers of Object.values(node.slots)) {
      for (const child of layers) {
        count += layerCount(child)
      }
    }
  }

  return count
}

/** Why a transaction was refused, as an extension or an agent is told: `Operation 2: No layer "card" in this design`. */
export function problemMessage(problem: TransactProblem): string {
  const at = problem.op === undefined ? "" : `Operation ${problem.op + 1}: `

  switch (problem.kind) {
    case "unknownDesign":
      return `${at}No design "${problem.design}"`
    case "unknownNode":
      return `${at}No layer "${problem.address.node}" in this design`
    case "takenId":
      return `${at}A layer "${problem.id}" is already in this design`
    case "intoItself":
      return `${at}"${problem.address.node}" can't go inside itself`
    case "notSibling":
      return `${at}"${problem.before}" isn't beside where "${problem.address.node}" goes`
    case "fixedField":
      return `${at}A layer's ${problem.field} can't be set`
    case "unknownFile":
      return `${at}No file "${problem.file}"`
    case "takenFile":
      return `${at}The project already has "${problem.file}"`
    case "invalid":
      return `${at}${problem.pointer ? `${problem.pointer}: ` : ""}${problem.message}`
  }
}

/** Undoes this person's last step, recorded as `edit.undone` with what it changed. */
export function undo(session: DocSession): DocChange | undefined {
  const change = session.doc.undo()
  recordStep("edit.undone", change)

  return change
}

/** Redoes the last step undone, recorded as `edit.redone`. */
export function redo(session: DocSession): DocChange | undefined {
  const change = session.doc.redo()
  recordStep("edit.redone", change)

  return change
}

function recordStep(name: "edit.undone" | "edit.redone", change: DocChange | undefined): void {
  if (!change) {
    return
  }

  const designs = new Set([
    ...change.designs.added,
    ...change.designs.removed,
    ...change.designs.renamed.map((each) => each.to),
    ...change.designs.changed.map((each) => each.design),
    ...[...change.layers.added, ...change.layers.removed, ...change.layers.moved].map((address) => address.design),
    ...change.layers.changed.map((each) => each.address.design)
  ])

  track(name, {
    step: change.label,
    designs: [...designs],
    files: [...change.files],
    modes: change.modes,
    tokens: change.tokens
  })
}

/**
 * A project file changed outside the canvas (an agent, git, a text editor): its content replaces what's here as one
 * undoable step. A file with unsaved changes here is left alone unless forced, and false says so, so the person can
 * choose which to keep.
 */
export function reloadFile(session: DocSession, path: string, document: CanvasDocument, force = false): boolean {
  // In a live room the copy that saves takes a changed file in, and the others get it from there.
  if (session.room && !session.room.saves()) {
    return true
  }

  if (!force && session.saver.unsaved().includes(path)) {
    return false
  }

  session.doc.replaceFile(path, document)

  return true
}

/**
 * How a design was shown when last saved, which a preview's reset puts back; `drawnFromCode` for a page, a component's
 * board or a story, whose views the project file keeps.
 */
export function savedViewOf(
  session: DocSession,
  key: string,
  drawnFromCode: boolean
): ContainerViewSettings | undefined {
  const entry = containerEntry(session.doc, key)

  return (
    entry &&
    savedView((path) => session.saver.saved(path), session.doc.main, entry.path, entry.container.id, drawnFromCode)
  )
}

/** The revision agents see: opaque, and the same only while nothing here has changed. */
export function revisionOf(session: DocSession): string {
  return `${session.epoch}:${revisions.get(session.doc)?.count ?? 0}`
}

/** Where the edits stand for agents: applied, undoable, saved, and whether saving is automatic. */
export function editStatusOf(
  session: DocSession,
  options: StatusOptions = {}
): EditStatus & { revision: string; autosave: boolean } {
  const { doc, saver } = session
  const files = doc.files()
  const saved = new Map<string, CanvasDocument>()

  for (const path of new Set([...files.keys(), ...saver.unsaved()])) {
    const document = saver.saved(path)

    if (document) {
      saved.set(path, document)
    }
  }

  const history = doc.history()

  const status = editStatus(
    {
      current: { documents: files, modes: doc.modes(), tokens: doc.tokens() },
      saved: { documents: saved, modes: saver.savedModes(), tokens: saver.savedTokens() },
      mainPath: doc.main,
      unsaved: saver.unsaved(),
      save: saver.state(),
      errors: saver.failures(),
      undo: history.undo,
      redo: history.redo
    },
    options
  )

  return { ...status, revision: revisionOf(session), autosave: session.autosave() }
}

/** The files, modes and component list corrections as one project file, as Save a copy writes it. */
export function mergedFile(session: DocSession): CanvasDocument {
  return mergedDocument({ documents: session.doc.files(), modes: session.doc.modes() }, session.doc.main)
}

/** Every component design instances can place: the project's own, and its libraries'. */
export function projectLibrary(session: DocSession): ComponentLibrary {
  return componentLibrary(session.doc, session.libraryDesigns)
}

/** What a design's instances reach, for resolving it: the same library until one of those designs changes. */
export function libraryOf(session: DocSession, key: string): ComponentLibrary {
  return reachableLibrary(session.doc, key, session.libraryDesigns)
}

/** The reference with this key. */
export function referenceEntry(session: DocSession, key: string): ReferenceEntry | undefined {
  return referenceEntries(session.doc).find((entry) => entry.key === key)
}

/** Listens to the document's changes, for `useSyncExternalStore`, which calls the listener with nothing. */
function subscribeDoc(session: DocSession): (listener: () => void) => () => void {
  let kept = subscribers.get(session.doc)

  if (!kept) {
    const doc = session.doc
    kept = (listener) => doc.subscribe(() => listener())
    subscribers.set(doc, kept)
  }

  return kept
}

const subscribers = new WeakMap<ProjectDoc, (listener: () => void) => () => void>()

/** Listens to the saver, for `useSyncExternalStore`, the same function each time for the same saver. */
function subscribeSaver(session: DocSession): (listener: () => void) => () => void {
  let kept = saverSubscribers.get(session.saver)

  if (!kept) {
    const saver = session.saver
    kept = (listener) => saver.subscribe(listener)
    saverSubscribers.set(saver, kept)
  }

  return kept
}

const saverSubscribers = new WeakMap<ProjectSaver, (listener: () => void) => () => void>()

export function useContainerEntries(session: DocSession): readonly ContainerEntry[] {
  return useSyncExternalStore(subscribeDoc(session), () => containerEntries(session.doc))
}

export function useContainerEntry(session: DocSession, key: string | undefined): ContainerEntry | undefined {
  return useSyncExternalStore(subscribeDoc(session), () => (key ? containerEntry(session.doc, key) : undefined))
}

/** The designs one design's instances reach, for resolving it. */
export function useLibrary(session: DocSession, key: string): ComponentLibrary {
  return useSyncExternalStore(subscribeDoc(session), () => libraryOf(session, key))
}

export function useNotes(session: DocSession): readonly NoteEntry[] {
  return useSyncExternalStore(subscribeDoc(session), () => noteEntries(session.doc))
}

export function useReference(session: DocSession, key: string | undefined): ReferenceEntry | undefined {
  return useSyncExternalStore(subscribeDoc(session), () => (key ? referenceEntry(session, key) : undefined))
}

export function useModeSettings(session: DocSession): ModeSettings {
  return useSyncExternalStore(subscribeDoc(session), () => session.doc.modes())
}

export function useHistory(session: DocSession): UndoState {
  return useSyncExternalStore(subscribeDoc(session), () => session.doc.history())
}

export function useSaveState(session: DocSession): SaveState {
  return useSyncExternalStore(subscribeSaver(session), () => session.saver.state())
}

/** Whether anything is unsaved, following edits and saves; the saver hears of every change. */
export function useUnsaved(session: DocSession | undefined): boolean {
  return useSyncExternalStore(session ? subscribeSaver(session) : ignore, () => session?.saver.hasUnsaved() ?? false)
}

/** The save state's status, or nothing for a project still opening. */
export function useSaveStatus(session: DocSession | undefined): SaveState["status"] | undefined {
  return useSyncExternalStore(session ? subscribeSaver(session) : ignore, () => session?.saver.state().status)
}

const ignore = () => () => undefined

export type { ContainerEntry, NoteEntry, ReferenceEntry } from "@parity-app/multiplayer"
