import type { CanvasDocument } from "@parity-app/core"
import { sameDesign, sameValue } from "./document-equality.ts"
import type { DesignSnapshot, SaveState } from "./snapshot.ts"
import { tokenWrites } from "./token-edits.ts"

/** Designs a file's changes add, change and remove, by id. */
export interface DesignIds {
  added: string[]
  changed: string[]
  removed: string[]
}

/** A file whose changes are applied here but not on disk yet. */
export interface UnsavedFile {
  path: string
  /** A project file, or the stylesheet that takes token values. */
  kind: "document" | "stylesheet"
  /** With a summary: the designs added, changed and removed since the file was loaded or saved, by id. */
  designs?: DesignIds
  /** With a summary: whether the modes it carries changed. */
  modes?: boolean
  /** With a summary: the token values waiting for the stylesheet, as `name theme`. */
  tokens?: string[]
  /** With a summary: how many ids the limit left out of the lists above. */
  more?: number
}

/** Steps in one direction of undo: how many, and with a summary their labels, newest first. */
export interface HistorySide {
  count: number
  labels?: string[]
}

/**
 * Where a project's edits stand: what's applied (and undoable) here, what of it is on disk, how the last save went and
 * what failed to write. Reading it changes nothing.
 */
export interface EditStatus {
  /** Whether anything applied here isn't on disk yet. */
  dirty: boolean
  unsaved: UnsavedFile[]
  /** How many token values wait for Save to write them to the stylesheet. */
  tokenEdits: number
  save: SaveState
  /** Writes that failed and haven't succeeded since, with why. */
  errors: { path: string; error: string }[]
  undo: HistorySide
  redo: HistorySide
}

export interface StatusOptions {
  /** Add each unsaved file's designs and token values, and undo's labels. */
  summary?: boolean
  /** The most ids or labels each list gives. */
  limit?: number
}

/** What a project's edits are worked out from: what's here, what its files hold, and where saving and undo stand. */
export interface StatusInput {
  current: DesignSnapshot
  /** What the files hold: as loaded, or as last saved. */
  saved: DesignSnapshot
  mainPath: string
  /** The files with changes not yet on disk, and the stylesheet when token values are waiting for it. */
  unsaved: readonly string[]
  save: SaveState
  /** Writes that failed and haven't succeeded since, with why. */
  errors: readonly { path: string; error: string }[]
  /** Undo's and Redo's step labels, newest first. */
  undo: readonly string[]
  redo: readonly string[]
}

/** Where a project's edits stand, with a bounded summary of what's unsaved when asked for. */
export function editStatus(input: StatusInput, options: StatusOptions = {}): EditStatus {
  const { summary = false, limit = 10 } = options
  const { current, saved } = input
  const tokens = tokenWrites(current.tokens, saved.tokens)

  const unsaved = input.unsaved.map((path): UnsavedFile => {
    const kind = current.documents.has(path) || saved.documents.has(path) ? "document" : "stylesheet"

    if (!summary) {
      return { path, kind }
    }

    if (kind === "stylesheet") {
      const names = tokens.map((change) => `${change.name} ${change.theme}`)

      return withMore({ path, kind, tokens: names.slice(0, limit) }, names.length - limit)
    }

    const designs = designChanges(current.documents.get(path), saved.documents.get(path))
    const modes = path === input.mainPath && !sameValue(current.modes, saved.modes)
    const all = designs.added.length + designs.changed.length + designs.removed.length

    const kept: DesignIds = {
      added: designs.added.slice(0, limit),
      changed: designs.changed.slice(0, limit),
      removed: designs.removed.slice(0, limit)
    }

    const shown = kept.added.length + kept.changed.length + kept.removed.length

    const file: UnsavedFile = { path, kind, designs: kept }

    if (modes) {
      file.modes = modes
    }

    return withMore(file, all - shown)
  })

  const side = (labels: readonly string[]): HistorySide => {
    const listed: HistorySide = { count: labels.length }

    if (summary) {
      listed.labels = labels.slice(0, limit)
    }

    return listed
  }

  return {
    dirty: unsaved.length > 0,
    unsaved,
    tokenEdits: tokens.length,
    save: input.save,
    errors: [...input.errors],
    undo: side(input.undo),
    redo: side(input.redo)
  }
}

/** The file, with how many ids the limit left out when it left any out. */
function withMore(file: UnsavedFile, count: number): UnsavedFile {
  return count > 0 ? { ...file, more: count } : file
}

/** The designs a file's current content adds, changes and removes against what the file holds, by id. */
function designChanges(current: CanvasDocument | undefined, saved: CanvasDocument | undefined): DesignIds {
  const before = new Map((saved?.containers ?? []).map((container) => [container.id, container]))
  const after = new Map((current?.containers ?? []).map((container) => [container.id, container]))
  const added = [...after.keys()].filter((id) => !before.has(id))
  const removed = [...before.keys()].filter((id) => !after.has(id))

  const changed = [...after].flatMap(([id, container]) => {
    const was = before.get(id)

    return was && !sameDesign(was, container) ? [id] : []
  })

  return { added, changed, removed }
}
