import type {
  CanvasDocument,
  ChangeConflict,
  ContainerSpec,
  DesignChange,
  ModesChange,
  NoteSpec
} from "@parity-app/core"
import type { DesignRef } from "./arrange.ts"
import { sameDesign, sameValue } from "./document-equality.ts"
import { type DesignSnapshot, withoutModes } from "./history.ts"
import { type TokenEdit, withTokenEdits } from "./token-edits.ts"

// The changes the editor makes to what it holds. Each gives back the snapshot it was given when it changes nothing.

/** A design changed by `update`. */
export function changeDesign(
  snapshot: DesignSnapshot,
  design: DesignRef,
  update: (container: ContainerSpec) => ContainerSpec
): DesignSnapshot {
  const document = snapshot.documents.get(design.path)
  const current = document?.containers.find((container) => container.id === design.id)
  if (!document || !current) return snapshot
  const next = update(current)
  if (next === current) return snapshot
  const containers = document.containers.map((container) => (container === current ? next : container))
  return { ...snapshot, documents: new Map(snapshot.documents).set(design.path, { ...document, containers }) }
}

/** Several designs changed together: `update` gets them in the order of `designs` and returns them in that order. */
export function changeDesigns(
  snapshot: DesignSnapshot,
  designs: readonly DesignRef[],
  update: (containers: ContainerSpec[]) => ContainerSpec[]
): DesignSnapshot {
  const current: ContainerSpec[] = []
  for (const design of designs) {
    const container = snapshot.documents.get(design.path)?.containers.find((candidate) => candidate.id === design.id)
    if (!container) return snapshot
    current.push(container)
  }
  const next = update(current)
  if (next.every((container, index) => container === current[index])) return snapshot
  const documents = new Map(snapshot.documents)
  for (const [index, design] of designs.entries()) {
    if (next[index] === current[index]) continue
    const document = documents.get(design.path)!
    const containers = document.containers.map((container) => (container.id === design.id ? next[index]! : container))
    documents.set(design.path, { ...document, containers })
  }
  return { ...snapshot, documents }
}

/** A design moved to `position`, in whole pixels; the same design when it's there already. */
export function moveDesign(container: ContainerSpec, position: { x: number; y: number }): ContainerSpec {
  const x = Math.round(position.x)
  const y = Math.round(position.y)
  return container.position.x === x && container.position.y === y ? container : { ...container, position: { x, y } }
}

/** A design added to a file, which is created when it doesn't exist yet. */
export function addDesign(snapshot: DesignSnapshot, path: string, container: ContainerSpec): DesignSnapshot {
  const document = snapshot.documents.get(path) ?? { version: 3, containers: [] }
  const next = { ...document, containers: [...document.containers, container] }
  return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
}

/** A design taken out of its file. */
export function deleteDesign(snapshot: DesignSnapshot, design: DesignRef): DesignSnapshot {
  const document = snapshot.documents.get(design.path)
  if (!document) return snapshot
  const containers = document.containers.filter((container) => container.id !== design.id)
  return { ...snapshot, documents: new Map(snapshot.documents).set(design.path, { ...document, containers }) }
}

/** A text note added to a file, which is created when it doesn't exist yet. */
export function addNote(snapshot: DesignSnapshot, path: string, note: NoteSpec): DesignSnapshot {
  const document = snapshot.documents.get(path) ?? { version: 3, containers: [] }
  const next = { ...document, notes: [...(document.notes ?? []), note] }
  return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
}

/** A text note changed by `update`, or taken out when it returns undefined. */
export function changeNote(
  snapshot: DesignSnapshot,
  ref: DesignRef,
  update: (note: NoteSpec) => NoteSpec | undefined
): DesignSnapshot {
  const document = snapshot.documents.get(ref.path)
  const current = document?.notes?.find((note) => note.id === ref.id)
  if (!document?.notes || !current) return snapshot
  const next = update(current)
  if (next === current) return snapshot
  const notes = next
    ? document.notes.map((note) => (note === current ? next : note))
    : document.notes.filter((note) => note !== current)
  const updated: CanvasDocument = { ...document, notes }
  if (notes.length === 0) delete updated.notes
  return { ...snapshot, documents: new Map(snapshot.documents).set(ref.path, updated) }
}

/**
 * An agent's call merged into what's here now: each design it changed, created or deleted, its modes and its token
 * values. Designs it didn't touch stay as they are, whatever happened to them since it read the tab. A design it
 * changed must still be as the call read it (or already as the call left it); when one isn't, or the modes aren't,
 * nothing is applied and the conflicts say which.
 */
export function mergeAgentChanges(
  snapshot: DesignSnapshot,
  designs: readonly DesignChange[],
  modes?: ModesChange,
  tokens: readonly TokenEdit[] = []
): { snapshot: DesignSnapshot; conflicts: ChangeConflict[] } {
  const conflicts: ChangeConflict[] = []
  let next = snapshot
  for (const change of designs) {
    const { path, id, base, after } = change
    const current = snapshot.documents.get(path)?.containers.find((container) => container.id === id)
    const conflict = (reason: ChangeConflict["reason"]) =>
      conflicts.push({ path, id, name: current?.name ?? base?.name ?? after?.name ?? id, reason })
    // Already as the call left it: made the same way here, or deleted here too.
    if (current ? after && sameDesign(current, after) : !after) continue
    if (!current) {
      if (base) conflict("deleted")
      else if (after) next = addDesign(next, path, after)
    } else if (!base) conflict("added")
    else if (!sameDesign(current, base)) conflict("changed")
    else next = after ? changeDesign(next, { path, id }, () => after) : deleteDesign(next, { path, id })
  }
  let nextModes = snapshot.modes
  if (modes && !sameValue(snapshot.modes, modes.after)) {
    if (sameValue(snapshot.modes, modes.base)) nextModes = modes.after
    else conflicts.push({ name: "Modes", reason: "changed" })
  }
  if (conflicts.length > 0) return { snapshot, conflicts }
  return {
    snapshot: { documents: next.documents, modes: nextModes, tokens: withTokenEdits(snapshot.tokens, tokens) },
    conflicts
  }
}

/** Whole documents replaced, as the person's corrections to the component list do; their modes are kept apart. */
export function replaceDocuments(
  snapshot: DesignSnapshot,
  documents: readonly { path: string; document: CanvasDocument }[]
): DesignSnapshot {
  if (documents.length === 0) return snapshot
  const next = new Map(snapshot.documents)
  for (const { path, document } of documents) next.set(path, withoutModes(document))
  return { ...snapshot, documents: next }
}
