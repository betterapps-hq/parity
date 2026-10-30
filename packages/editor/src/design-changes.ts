import type { CanvasDocument, ContainerSpec, ModeSettings, NoteSpec } from "@parity-app/core"
import type { DesignRef } from "./arrange.ts"
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

/** Whole documents replaced, and modes and token values changed, as an agent's call does. */
export function replaceDocuments(
  snapshot: DesignSnapshot,
  documents: readonly { path: string; document: CanvasDocument }[],
  modes?: ModeSettings,
  tokens: readonly TokenEdit[] = []
): DesignSnapshot {
  const next = new Map(snapshot.documents)
  for (const { path, document } of documents) next.set(path, withoutModes(document))
  return {
    documents: documents.length > 0 ? next : snapshot.documents,
    modes: modes ?? snapshot.modes,
    tokens: withTokenEdits(snapshot.tokens, tokens)
  }
}
