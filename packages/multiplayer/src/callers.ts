import {
  type CanvasDocument,
  type ChangeConflict,
  type ContainerSpec,
  type ContainerViewSettings,
  type DesignChange,
  findNode,
  type ModeSettings,
  type ModesChange,
  type NoteSpec,
  type ReferenceSpec
} from "@parity-app/core"
import {
  addDesign,
  addNote as addNoteTo,
  changeNote,
  type DesignOperation,
  type DesignSnapshot,
  deleteDesign,
  kindName,
  kindsName,
  mergeAgentChanges,
  moveDesign,
  type RecoveryCopy,
  type ReferenceAdded,
  reorderDesign,
  restoreLabel,
  type TextSplice,
  type TokenEdit,
  withTidyView,
  withTokenEdits
} from "@parity-app/editor"
import { containerOps, fileOps } from "./diff-ops.ts"
import { designKey, splitKey } from "./keys.ts"
import type { DesignKey, DocOp, ProjectDoc, TransactOptions, TransactResult } from "./types.ts"

/*
 * What callers change designs with (docs/proposals/multiplayer.md: Functions for callers): each takes the document and
 * whole values, as `DesignStore`'s methods did, works out the operations, and makes one transaction. Most build on the
 * editor's functions over a snapshot of the files, so what they change stays as it was.
 */

type Options = Partial<TransactOptions>

/** What `applyAgentChanges` did: the conflicts that kept it from applying, or the designs it changed. */
export interface AgentApplied {
  conflicts: ChangeConflict[]
  result: TransactResult | undefined
}

export function updateContainer(
  doc: ProjectDoc,
  key: DesignKey,
  label: string,
  update: (container: ContainerSpec) => ContainerSpec,
  options?: Options
): TransactResult {
  const container = doc.design(key)

  if (!container) {
    return { ok: false, problem: { kind: "unknownDesign", op: 0, design: key } }
  }

  return transact(doc, label, containerOps(key, container, update(container)), options)
}

/**
 * Typing in a text layer (docs/editor.md, Typing written as it's typed): `update` sets the text to what's typed, as
 * `updateContainer` does, and where that writes the layer's own text, it's written as `splice`, the change typed, rather
 * than as the whole text, so it merges with others typing in the same text at once (PAR-1238). Text written elsewhere,
 * as a state's or an instance's, is written whole.
 */
export function typeInContainer(
  doc: ProjectDoc,
  key: DesignKey,
  label: string,
  update: (container: ContainerSpec) => ContainerSpec,
  typed: { node: string; splice: TextSplice },
  options?: Options
): TransactResult {
  const container = doc.design(key)

  if (!container) {
    return { ok: false, problem: { kind: "unknownDesign", op: 0, design: key } }
  }

  const before = findNode(container.root, typed.node)
  const { start, end, insert } = typed.splice

  const ops = containerOps(key, container, update(container)).map((op): DocOp => {
    const spliced =
      op.op === "editText" &&
      op.node === typed.node &&
      op.edit.kind === "replace" &&
      before?.type === "text" &&
      end <= before.text.length &&
      before.text.slice(0, start) + insert + before.text.slice(end) === op.edit.text

    return spliced ? { ...op, edit: { kind: "splice", at: start, remove: end - start, insert } } : op
  })

  return transact(doc, label, ops, options)
}

/** Several designs as one step: `update` gets them in the order of `keys` and returns them changed, in that order. */
export function updateContainers(
  doc: ProjectDoc,
  keys: readonly DesignKey[],
  label: string,
  update: (containers: ContainerSpec[]) => ContainerSpec[],
  options?: Options
): TransactResult {
  const containers: ContainerSpec[] = []

  for (const key of keys) {
    const container = doc.design(key)

    if (!container) {
      return { ok: false, problem: { kind: "unknownDesign", op: 0, design: key } }
    }

    containers.push(container)
  }

  const updated = update(containers)
  const ops = keys.flatMap((key, index) => containerOps(key, containers[index]!, updated[index] ?? containers[index]!))

  return transact(doc, label, ops, options)
}

/** What a design shows, which isn't undoable, kept tidy so switching something on and off leaves the file as it was. */
export function updateView(
  doc: ProjectDoc,
  key: DesignKey,
  label: string,
  update: (view: ContainerViewSettings) => ContainerViewSettings
): TransactResult {
  return updateContainer(doc, key, label, (container) => withTidyView(container, update(container.view ?? {})), {
    origin: "view"
  })
}

export function setPosition(
  doc: ProjectDoc,
  key: DesignKey,
  position: { x: number; y: number },
  options?: Options
): TransactResult {
  const label = `Move ${kindName(doc.design(key)?.kind)}`

  return updateContainer(doc, key, label, (container) => moveDesign(container, position), options)
}

/** Adds a design to a file, making the file when it doesn't exist yet. Returns the design's key. */
export function addContainer(
  doc: ProjectDoc,
  path: string,
  container: ContainerSpec,
  label = `Add ${kindName(container.kind)}`
): DesignKey {
  changeSnapshot(doc, label, (snapshot) => addDesign(snapshot, path, container))

  return designKey(path, container.id)
}

export function removeContainer(doc: ProjectDoc, key: DesignKey, label?: string): TransactResult | undefined {
  const split = splitKey(key)

  if (!split || !doc.design(key)) {
    return undefined
  }

  const named = label ?? `Delete ${kindName(doc.design(key)?.kind)}`

  return changeSnapshot(doc, named, (snapshot) => deleteDesign(snapshot, split))
}

/** Moves a design just before or after another in their file, which is the Layers panel's order. */
export function reorderContainer(
  doc: ProjectDoc,
  key: DesignKey,
  target: DesignKey,
  place: "before" | "after"
): TransactResult | undefined {
  const design = splitKey(key)
  const beside = splitKey(target)

  if (!design || !beside) {
    return undefined
  }

  return changeSnapshot(doc, `Reorder ${kindsName([doc.design(key)?.kind])}`, (snapshot) =>
    reorderDesign(snapshot, design, beside, place)
  )
}

export function setModes(doc: ProjectDoc, modes: ModeSettings, label = "Edit modes"): TransactResult {
  return transact(doc, label, [{ op: "setModes", modes }])
}

/** Changes token values as one step. They show at once, and the saver writes them to the stylesheet. */
export function changeTokens(
  doc: ProjectDoc,
  label: string,
  edits: readonly TokenEdit[],
  options?: Options
): TransactResult {
  return transact(doc, label, [{ op: "setTokens", tokens: withTokenEdits(doc.tokens(), edits) }], options)
}

/** The designs with these keys as a label names them, by kind: "screen", "2 components". */
export function designsLabel(doc: ProjectDoc, keys: Iterable<DesignKey>): string {
  return kindsName([...keys].map((key) => doc.design(key)?.kind))
}

/** Adds a note to a file, making the file when it doesn't exist yet. Returns its key. */
export function addNote(doc: ProjectDoc, path: string, note: NoteSpec): string {
  changeSnapshot(doc, "Add text", (snapshot) => addNoteTo(snapshot, path, note))

  return designKey(path, note.id)
}

/** Leaving the note out of `update`'s result removes it. */
export function updateNote(
  doc: ProjectDoc,
  key: string,
  label: string,
  update: (note: NoteSpec) => NoteSpec | undefined,
  options?: Options
): TransactResult | undefined {
  const split = splitKey(key)

  if (!split || !doc.file(split.path)?.notes?.some((note) => note.id === split.id)) {
    return undefined
  }

  return changeSnapshot(doc, label, (snapshot) => changeNote(snapshot, split, update), options)
}

/** References placed in a file together, as one step. Gives back their keys, in order. */
export function addReferences(
  doc: ProjectDoc,
  path: string,
  references: readonly ReferenceSpec[],
  label: string
): string[] {
  const ops: DocOp[] = doc.file(path) ? [] : [{ op: "addFile", file: path }]
  ops.push(...references.map((reference): DocOp => ({ op: "setReference", file: path, reference })))
  transact(doc, label, ops)

  return references.map((reference) => designKey(path, reference.id))
}

/** Leaving the reference out of `update`'s result removes it. */
export function updateReference(
  doc: ProjectDoc,
  key: string,
  label: string,
  update: (reference: ReferenceSpec) => ReferenceSpec | undefined,
  options?: Options
): TransactResult | undefined {
  const split = splitKey(key)
  const reference = split && doc.file(split.path)?.references?.find((each) => each.id === split.id)

  if (!split || !reference) {
    return undefined
  }

  const next = update(reference)

  const op: DocOp = next
    ? { op: "setReference", file: split.path, reference: next }
    : { op: "removeReference", file: split.path, id: split.id }

  return transact(doc, label, [op], options)
}

/** For the callers that change several files at once, with a function of the files and the modes. */
export function changeFiles(
  doc: ProjectDoc,
  label: string,
  update: (state: { files: ReadonlyMap<string, CanvasDocument>; modes: ModeSettings }) => {
    files: ReadonlyMap<string, CanvasDocument>
    modes: ModeSettings
  },
  options?: Options
): TransactResult {
  const next = update({ files: doc.files(), modes: doc.modes() })

  return changeSnapshot(doc, label, (snapshot) => ({ ...snapshot, documents: next.files, modes: next.modes }), options)
}

/**
 * Agents' changes, merged three ways against what the agent read, as `mergeAgentChanges` does: designs, modes, token
 * values and references, as one transaction. When any conflicts, nothing changes and the conflicts say why.
 */
export function applyAgentChanges(
  doc: ProjectDoc,
  label: string,
  designs: readonly DesignChange[],
  modes?: ModesChange,
  tokens?: readonly TokenEdit[],
  references?: readonly ReferenceAdded[]
): AgentApplied {
  const merged = mergeAgentChanges(snapshotOf(doc), designs, modes, tokens, references)

  if (merged.conflicts.length > 0) {
    return { conflicts: merged.conflicts, result: undefined }
  }

  return { conflicts: [], result: changeSnapshot(doc, label, () => merged.snapshot, { origin: "agent" }) }
}

/** An extension's operations, which are already the document's, checked and applied as one step. */
export function applyOperations(
  doc: ProjectDoc,
  label: string,
  operations: readonly DesignOperation[]
): TransactResult {
  // SAFETY: an extension's inserted nodes are checked against core's schemas with the rest of the transaction.
  return transact(doc, label, operations as readonly DocOp[], { origin: "extension" })
}

/** Whole files replacing what's there, as one step: an agent writing files. `null` removes a file; a new path adds one. */
export function applyDocuments(
  doc: ProjectDoc,
  label: string,
  documents: readonly { path: string; document: CanvasDocument | null }[],
  options?: Options
): TransactResult {
  const ops = documents.flatMap(({ path, document }) => fileOps(path, doc.file(path), document ?? undefined))

  return transact(doc, label, ops, { origin: "agent", ...options })
}

/** Restores a recovery copy as one transaction: its files, the files it deleted, its modes and token values. */
export function restoreCopy(doc: ProjectDoc, copy: RecoveryCopy): TransactResult {
  const ops = copy.documents.flatMap(({ path, document }) => fileOps(path, doc.file(path), document ?? undefined))

  if (copy.modes) {
    ops.push({ op: "setModes", modes: copy.modes })
  }

  if (copy.tokens.length > 0) {
    ops.push({ op: "setTokens", tokens: withTokenEdits(doc.tokens(), copy.tokens) })
  }

  return transact(doc, restoreLabel, ops)
}

/** The files, modes and token values now, as the editor's snapshot functions take them. */
export function snapshotOf(doc: ProjectDoc): DesignSnapshot {
  return { documents: doc.files(), modes: doc.modes(), tokens: doc.tokens() }
}

/** The operations that make one snapshot into another. */
export function snapshotOps(before: DesignSnapshot, after: DesignSnapshot): DocOp[] {
  const ops: DocOp[] = []

  if (before.documents !== after.documents) {
    const paths = new Set([...before.documents.keys(), ...after.documents.keys()])

    for (const path of paths) {
      ops.push(...fileOps(path, before.documents.get(path), after.documents.get(path)))
    }
  }

  if (before.modes !== after.modes) {
    ops.push({ op: "setModes", modes: after.modes })
  }

  if (before.tokens !== after.tokens) {
    ops.push({ op: "setTokens", tokens: after.tokens })
  }

  return ops
}

/** For callers that change the files, the modes and the token values together, with a function of a snapshot. */
export function changeSnapshot(
  doc: ProjectDoc,
  label: string,
  update: (snapshot: DesignSnapshot) => DesignSnapshot,
  options?: Options
): TransactResult {
  const before = snapshotOf(doc)

  return transact(doc, label, snapshotOps(before, update(before)), options)
}

function transact(doc: ProjectDoc, label: string, ops: readonly DocOp[], options?: Options): TransactResult {
  if (ops.length === 0) {
    return { ok: true, change: undefined }
  }

  return doc.transact(label, ops, { origin: "edit", ...options })
}
