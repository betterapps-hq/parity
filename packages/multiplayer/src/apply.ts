import {
  type CanvasDocument,
  type ContainerSpec,
  type DesignNode,
  dropPatches,
  emptyDocument,
  findNode,
  placeNode,
  type JsonValue,
  locateNode,
  type ModeSettings,
  moveNode,
  type NoteSpec,
  nodeIds,
  type ReferenceSpec,
  mapNode
} from "@parity-app/core"
import { prunedDocument, type TokenEdits } from "@parity-app/editor"
import { designKey, splitKey } from "./keys.ts"
import { Recorder } from "./recorder.ts"
import { type DesignKey, type DocOp, type FileField, fileFields, type TransactProblem } from "./types.ts"
import { fieldOf, keyOf, withField, withKey } from "./values.ts"

/*
 * Operations applied to plain values: what checks a transaction on a draft, works out each operation's inverse, and
 * what a provider without merging keeps as its state. Each change copies only what's above it, so every design, layer
 * and file it doesn't touch stays the same object.
 */

/** The values a project document holds: its files without their modes, the modes, and the token values edited. */
export interface DocState {
  readonly files: ReadonlyMap<string, CanvasDocument>
  readonly main: string
  readonly modes: ModeSettings
  readonly tokens: TokenEdits
}

/** Why an operation can't apply. */
export class OpProblem extends Error {
  readonly problem: TransactProblem

  constructor(problem: TransactProblem) {
    super("message" in problem ? problem.message : problem.kind)
    this.problem = problem
  }
}

export interface Applied {
  state: DocState
  /** The operations that take this one back, to apply in order. */
  inverse: DocOp[]
  /**
   * The operation as a backend applies it: with the `setDesign`s that drop a removed layer's patches, or prune views
   * when modes go, so a backend never works those out itself.
   */
  plain: DocOp[]
}

/** Layers' record fields, whose keys `set` can change one at a time. */
const layerRecords = new Set(["style", "props", "args", "overrides", "responsive"])

/** A design's record fields, whose keys `setDesign` can change one at a time. */
const designRecords = new Set(["params", "frames"])

/** A layer's fields `set` can't change: its identity, and what holds other layers. */
const fixedLayerFields = new Set(["id", "type", "children", "slots"])

/**
 * Applies one operation, with `index` naming it in a problem. `expand` adds what follows from it (a removed layer's
 * patches dropped, views pruned of modes that are gone); a backend applying plain operations leaves it off.
 */
export function applyOp(
  state: DocState,
  op: DocOp,
  index: number,
  recorder: Recorder = new Recorder(),
  expand = true
): Applied {
  switch (op.op) {
    case "insert":
      return insert(state, op, index, recorder)
    case "remove":
      return remove(state, op, index, recorder, expand)
    case "move":
      return move(state, op, index, recorder)
    case "set":
      return set(state, op, index, recorder)
    case "editText":
      return editText(state, op, index, recorder)
    case "replaceRoot": {
      const found = designAt(state, op.design, index)
      recorder.designField(op.design, found.path, "root")

      return {
        state: withDesign(state, found, { ...found.container, root: rootOf(op.root, index, op.design) }),
        inverse: [{ op: "replaceRoot", design: op.design, root: found.container.root }],
        plain: [op]
      }
    }

    case "addSlot":
      return addSlot(state, op, index, recorder)
    case "removeSlot":
      return removeSlot(state, op, index, recorder, expand)
    case "addFile":
      return addFile(state, op, index, recorder)
    case "removeFile":
      return removeFile(state, op, index, recorder)
    case "addDesign":
      return addDesign(state, op, index, recorder)
    case "removeDesign":
      return removeDesign(state, op, index, recorder)
    case "moveDesign":
      return moveDesign(state, op, index, recorder)
    case "setDesign":
      return setDesign(state, op, index, recorder)
    case "setNote":
      return setItem(state, noteOps(op.file), op.note, op.before, index, recorder)
    case "removeNote":
      return removeItem(state, noteOps(op.file), op.id, index, recorder)
    case "setReference":
      return setItem(state, referenceOps(op.file), op.reference, op.before, index, recorder)
    case "removeReference":
      return removeItem(state, referenceOps(op.file), op.id, index, recorder)
    case "setFileField": {
      const document = fileAt(state, op.file, index)
      const before = fieldOf(document, op.field)
      recorder.fileField(op.file, op.field)

      return {
        state: withFile(state, op.file, withField(document, op.field, op.value)),
        inverse: [valued({ op: "setFileField", file: op.file, field: op.field }, before)],
        plain: [op]
      }
    }

    case "setModes":
      return setModes(state, op.modes, recorder, expand)
    case "setTokens":
      recorder.tokens = true

      return {
        state: { ...state, tokens: op.tokens },
        inverse: [{ op: "setTokens", tokens: state.tokens }],
        plain: [op]
      }
  }
}

/** Applies operations a backend was sent: each alone, in order, without working out what follows from them. */
export function applyPlain(state: DocState, ops: readonly DocOp[], recorder: Recorder = new Recorder()): DocState {
  let next = state

  for (const [index, op] of ops.entries()) {
    next = applyOp(next, op, index, recorder, false).state
  }

  return next
}

// Layers.

function insert(state: DocState, op: Extract<DocOp, { op: "insert" }>, index: number, recorder: Recorder): Applied {
  const found = designAt(state, op.design, index)
  const { root } = found.container
  const parent = findNode(root, op.parent)

  if (!parent) {
    throw new OpProblem({ kind: "unknownNode", op: index, address: { design: op.design, node: op.parent } })
  }

  holdsLayers(parent, op.slot, op.design, index)
  const taken = nodeIds(root)
  const added = nodeIds(op.node)

  for (const id of added) {
    if (taken.has(id)) {
      throw new OpProblem({ kind: "takenId", op: index, design: op.design, id })
    }
  }

  const at = placeBefore(parent, op.slot, op.before, op.design, op.node.id, index)
  // The ids were checked just above.
  const next = placeNode(root, op.parent, op.node, slotted(at, op.slot))

  for (const id of added) {
    recorder.layerAdded({ design: op.design, node: id }, found.path)
  }

  return {
    state: withDesign(state, found, { ...found.container, root: rootOf(next, index, op.design) }),
    inverse: [{ op: "remove", design: op.design, node: op.node.id }],
    plain: [op]
  }
}

function remove(
  state: DocState,
  op: Extract<DocOp, { op: "remove" }>,
  index: number,
  recorder: Recorder,
  expand: boolean
): Applied {
  const found = designAt(state, op.design, index)
  const location = locateNode(found.container.root, op.node)

  if (!location) {
    throw new OpProblem({ kind: "unknownNode", op: index, address: { design: op.design, node: op.node } })
  }

  const parent = location.ancestors.at(-1)

  if (!parent) {
    throw invalid(index, op.design, "The root layer can't be removed; replace it with `replaceRoot`")
  }

  const after = siblings(parent, location.slot)[location.index + 1]?.id
  const removed = nodeIds(location.node)
  const container = { ...found.container, root: rootOf(withoutNode(found.container.root, op.node), index, op.design) }

  for (const id of removed) {
    recorder.layerRemoved({ design: op.design, node: id }, found.path)
  }

  const restore: DocOp = {
    op: "insert",
    design: op.design,
    parent: parent.id,
    slot: location.slot,
    before: after,
    node: location.node
  }

  const dropped = expand ? droppedPatches(found.container, container, removed, op.design, found.path, recorder) : none

  return {
    state: withDesign(state, found, dropped.container ?? container),
    inverse: [restore, ...dropped.inverse],
    plain: [op, ...dropped.plain]
  }
}

function move(state: DocState, op: Extract<DocOp, { op: "move" }>, index: number, recorder: Recorder): Applied {
  const found = designAt(state, op.design, index)
  const { root } = found.container
  const location = locateNode(root, op.node)

  if (!location) {
    throw new OpProblem({ kind: "unknownNode", op: index, address: { design: op.design, node: op.node } })
  }

  const from = location.ancestors.at(-1)

  if (!from) {
    throw invalid(index, op.design, "The root layer can't be moved")
  }

  const parent = findNode(root, op.parent)

  if (!parent) {
    throw new OpProblem({ kind: "unknownNode", op: index, address: { design: op.design, node: op.parent } })
  }

  if (findNode(location.node, op.parent)) {
    throw new OpProblem({
      kind: "intoItself",
      op: index,
      address: { design: op.design, node: op.node },
      parent: op.parent
    })
  }

  holdsLayers(parent, op.slot, op.design, index)
  const at = placeBefore(parent, op.slot, op.before, op.design, op.node, index)
  const after = siblings(from, location.slot)[location.index + 1]?.id
  const next = moveNode(root, op.node, op.parent, slotted(at, op.slot))
  recorder.layerMoved({ design: op.design, node: op.node }, found.path)

  return {
    state: withDesign(state, found, { ...found.container, root: rootOf(next, index, op.design) }),
    inverse: [
      {
        op: "move",
        design: op.design,
        node: op.node,
        parent: from.id,
        slot: location.slot,
        before: after
      }
    ],
    plain: [op]
  }
}

function set(state: DocState, op: Extract<DocOp, { op: "set" }>, index: number, recorder: Recorder): Applied {
  const found = designAt(state, op.design, index)
  const [field, key, ...rest] = op.path
  const address = { design: op.design, node: op.node }

  if (field === undefined || rest.length > 0) {
    throw invalid(index, op.design, "Say a field, or a field and one of its keys")
  }

  if (fixedLayerFields.has(field)) {
    throw new OpProblem({ kind: "fixedField", op: index, address, field })
  }

  if (key !== undefined && !layerRecords.has(field)) {
    throw invalid(index, op.design, `Only a key of ${[...layerRecords].join(", ")} can be set, not of ${field}`)
  }

  const node = findNode(found.container.root, op.node)

  if (!node) {
    throw new OpProblem({ kind: "unknownNode", op: index, address })
  }

  const before = key === undefined ? fieldOf(node, field) : keyOf(node, field, key)
  const next = key === undefined ? withField(node, field, op.value) : withKey(node, field, key, op.value)
  const root = replaceNode(found.container.root, op.node, next)
  recorder.layerField(address, found.path, field)

  return {
    state: withDesign(state, found, { ...found.container, root: rootOf(root, index, op.design) }),
    inverse: [valued({ op: "set", design: op.design, node: op.node, path: op.path }, before)],
    plain: [op]
  }
}

function editText(state: DocState, op: Extract<DocOp, { op: "editText" }>, index: number, recorder: Recorder): Applied {
  const found = designAt(state, op.design, index)
  const address = { design: op.design, node: op.node }
  const node = findNode(found.container.root, op.node)

  if (!node) {
    throw new OpProblem({ kind: "unknownNode", op: index, address })
  }

  if (node.type !== "text") {
    throw invalid(index, op.design, `"${op.node}" isn't a text layer`)
  }

  const { edit } = op
  let text: string
  let inverse: DocOp

  if (edit.kind === "replace") {
    text = edit.text
    inverse = { op: "editText", design: op.design, node: op.node, edit: { kind: "replace", text: node.text } }
  } else {
    if (edit.at < 0 || edit.remove < 0 || edit.at + edit.remove > node.text.length) {
      throw invalid(index, op.design, `The splice is outside "${op.node}"'s text`)
    }

    const removed = node.text.slice(edit.at, edit.at + edit.remove)
    text = node.text.slice(0, edit.at) + edit.insert + node.text.slice(edit.at + edit.remove)
    inverse = {
      op: "editText",
      design: op.design,
      node: op.node,
      edit: { kind: "splice", at: edit.at, remove: edit.insert.length, insert: removed }
    }
  }

  const root = replaceNode(found.container.root, op.node, { ...node, text })
  recorder.layerField(address, found.path, "text")

  return {
    state: withDesign(state, found, { ...found.container, root: rootOf(root, index, op.design) }),
    inverse: [inverse],
    plain: [op]
  }
}

function addSlot(state: DocState, op: Extract<DocOp, { op: "addSlot" }>, index: number, recorder: Recorder): Applied {
  const found = designAt(state, op.design, index)
  const address = { design: op.design, node: op.node }
  const node = slotHolder(found.container.root, address, index)
  const slots = node.slots ?? {}

  if (op.slot in slots) {
    throw invalid(index, op.design, `"${op.node}" already has the slot "${op.slot}"`)
  }

  if (op.before !== undefined && !(op.before in slots)) {
    throw new OpProblem({ kind: "notSibling", op: index, address, before: op.before })
  }

  const entries = Object.entries(slots)
  const at = op.before === undefined ? entries.length : entries.findIndex(([name]) => name === op.before)
  entries.splice(at, 0, [op.slot, []])
  const root = replaceNode(found.container.root, op.node, { ...node, slots: Object.fromEntries(entries) })
  recorder.layerField(address, found.path, "slots")

  return {
    state: withDesign(state, found, { ...found.container, root: rootOf(root, index, op.design) }),
    inverse: [{ op: "removeSlot", design: op.design, node: op.node, slot: op.slot }],
    plain: [op]
  }
}

function removeSlot(
  state: DocState,
  op: Extract<DocOp, { op: "removeSlot" }>,
  index: number,
  recorder: Recorder,
  expand: boolean
): Applied {
  const found = designAt(state, op.design, index)
  const address = { design: op.design, node: op.node }
  const node = slotHolder(found.container.root, address, index)
  const slots = node.slots ?? {}
  const filled = slots[op.slot]

  if (!filled) {
    throw invalid(index, op.design, `"${op.node}" has no slot "${op.slot}"`)
  }

  const names = Object.keys(slots)
  const after = names[names.indexOf(op.slot) + 1]
  const kept = Object.fromEntries(Object.entries(slots).filter(([name]) => name !== op.slot))
  const next = { ...node, slots: kept }

  if (Object.keys(kept).length === 0) {
    Reflect.deleteProperty(next, "slots")
  }

  const removed = new Set(filled.flatMap((child) => [...nodeIds(child)]))

  const container = {
    ...found.container,
    root: rootOf(replaceNode(found.container.root, op.node, next), index, op.design)
  }

  recorder.layerField(address, found.path, "slots")

  for (const id of removed) {
    recorder.layerRemoved({ design: op.design, node: id }, found.path)
  }

  const dropped = expand ? droppedPatches(found.container, container, removed, op.design, found.path, recorder) : none

  const refill: DocOp[] = filled.map((child) => ({
    op: "insert",
    design: op.design,
    parent: op.node,
    slot: op.slot,
    node: child
  }))

  return {
    state: withDesign(state, found, dropped.container ?? container),
    inverse: [
      {
        op: "addSlot",
        design: op.design,
        node: op.node,
        slot: op.slot,
        before: after
      },
      ...refill,
      ...dropped.inverse
    ],
    plain: [op, ...dropped.plain]
  }
}

// Files.

function addFile(state: DocState, op: Extract<DocOp, { op: "addFile" }>, index: number, recorder: Recorder): Applied {
  if (state.files.has(op.file)) {
    throw new OpProblem({ kind: "takenFile", op: index, file: op.file })
  }

  let document = emptyDocument()

  for (const field of fileFields) {
    const value = op.fields?.[field]

    if (value !== undefined) {
      document = withField(document, field, value)
    }
  }

  recorder.fileAdded(op.file)

  return {
    state: { ...state, files: new Map(state.files).set(op.file, document) },
    inverse: [{ op: "removeFile", file: op.file }],
    plain: [op]
  }
}

function removeFile(
  state: DocState,
  op: Extract<DocOp, { op: "removeFile" }>,
  index: number,
  recorder: Recorder
): Applied {
  const document = fileAt(state, op.file, index)

  if (op.file === state.main) {
    throw invalid(index, undefined, "The main file can't be removed")
  }

  const fields: Partial<Record<FileField, JsonValue>> = {}

  for (const field of fileFields) {
    const value = fieldOf(document, field)

    if (value !== undefined) {
      fields[field] = value
    }
  }

  const files = new Map(state.files)
  files.delete(op.file)
  recorder.fileRemoved(op.file)

  for (const container of document.containers) {
    recorder.designRemoved(designKey(op.file, container.id), op.file)
  }

  // Its notes and references go too, which a file added back in the same change doesn't bring back.
  for (const list of ["notes", "references"] as const) {
    for (const item of document[list] ?? []) {
      recorder.item(list, op.file, item.id)
    }
  }

  return {
    state: { ...state, files },
    inverse: [
      { op: "addFile", file: op.file, fields },
      ...document.containers.map((design): DocOp => ({ op: "addDesign", file: op.file, design })),
      ...(document.notes ?? []).map((note): DocOp => ({ op: "setNote", file: op.file, note })),
      ...(document.references ?? []).map((reference): DocOp => ({ op: "setReference", file: op.file, reference }))
    ],
    plain: [op]
  }
}

// Designs.

function addDesign(
  state: DocState,
  op: Extract<DocOp, { op: "addDesign" }>,
  index: number,
  recorder: Recorder
): Applied {
  const document = fileAt(state, op.file, index)
  const key = designKey(op.file, op.design.id)

  if (document.containers.some((container) => container.id === op.design.id)) {
    throw new OpProblem({ kind: "takenId", op: index, design: key, id: op.design.id })
  }

  const containers = [...document.containers]
  containers.splice(designIndex(document, op.file, op.before, key, index), 0, op.design)
  recorder.designAdded(key, op.file)

  return {
    state: withFile(state, op.file, { ...document, containers }),
    inverse: [{ op: "removeDesign", design: key }],
    plain: [op]
  }
}

function removeDesign(
  state: DocState,
  op: Extract<DocOp, { op: "removeDesign" }>,
  index: number,
  recorder: Recorder
): Applied {
  const found = designAt(state, op.design, index)
  const document = state.files.get(found.path)!
  const after = document.containers[found.index + 1]
  recorder.designRemoved(op.design, found.path)

  return {
    state: withFile(state, found.path, {
      ...document,
      containers: document.containers.filter((_, at) => at !== found.index)
    }),
    inverse: [
      {
        op: "addDesign",
        file: found.path,
        design: found.container,
        before: after ? designKey(found.path, after.id) : undefined
      }
    ],
    plain: [op]
  }
}

function moveDesign(
  state: DocState,
  op: Extract<DocOp, { op: "moveDesign" }>,
  index: number,
  recorder: Recorder
): Applied {
  const found = designAt(state, op.design, index)
  const target = op.file ?? found.path
  const source = state.files.get(found.path)!
  const after = source.containers[found.index + 1]
  const key = designKey(target, found.container.id)
  const without = { ...source, containers: source.containers.filter((_, at) => at !== found.index) }
  let next = withFile(state, found.path, without)
  const destination = fileAt(next, target, index)

  if (target !== found.path && destination.containers.some((container) => container.id === found.container.id)) {
    throw new OpProblem({ kind: "takenId", op: index, design: key, id: found.container.id })
  }

  if (op.before === op.design) {
    throw new OpProblem({ kind: "notSibling", op: index, address: { design: op.design, node: "" }, before: op.before })
  }

  const containers = [...destination.containers]
  containers.splice(designIndex(destination, target, op.before, key, index), 0, found.container)
  next = withFile(next, target, { ...destination, containers })

  if (target === found.path) {
    recorder.designField(op.design, found.path, "order")
  } else {
    recorder.designRenamed(op.design, key, found.path, target)
  }

  return {
    state: next,
    inverse: [
      {
        op: "moveDesign",
        design: key,
        file: target === found.path ? undefined : found.path,
        before: after ? designKey(found.path, after.id) : undefined
      }
    ],
    plain: [op]
  }
}

function setDesign(
  state: DocState,
  op: Extract<DocOp, { op: "setDesign" }>,
  index: number,
  recorder: Recorder
): Applied {
  const found = designAt(state, op.design, index)
  const [field, key, ...rest] = op.path

  if (field === undefined || rest.length > 0) {
    throw invalid(index, op.design, "Say a field, or a field and one of its keys")
  }

  if (field === "id" || field === "root") {
    throw invalid(index, op.design, `A design's ${field} can't be set${field === "root" ? "; use `replaceRoot`" : ""}`)
  }

  if (key !== undefined && !designRecords.has(field)) {
    throw invalid(index, op.design, `Only a key of params or frames can be set, not of ${field}`)
  }

  const before = key === undefined ? fieldOf(found.container, field) : keyOf(found.container, field, key)

  const container =
    key === undefined ? withField(found.container, field, op.value) : withKey(found.container, field, key, op.value)

  recorder.designField(op.design, found.path, field)

  return {
    state: withDesign(state, found, container),
    inverse: [valued({ op: "setDesign", design: op.design, path: op.path }, before)],
    plain: [op]
  }
}

// Notes and references.

/** How to read and change one file's notes, or its references. */
interface ItemList<T extends NoteSpec | ReferenceSpec> {
  name: "notes" | "references"
  file: string
  read(document: CanvasDocument): readonly T[] | undefined
  set(item: T, before: string | undefined): DocOp
  remove(id: string): DocOp
}

function noteOps(file: string): ItemList<NoteSpec> {
  return {
    name: "notes",
    file,
    read: (document) => document.notes,
    set: (note, before) => ({ op: "setNote", file, note, before }),
    remove: (id) => ({ op: "removeNote", file, id })
  }
}

function referenceOps(file: string): ItemList<ReferenceSpec> {
  return {
    name: "references",
    file,
    read: (document) => document.references,
    set: (reference, before) => ({ op: "setReference", file, reference, before }),
    remove: (id) => ({ op: "removeReference", file, id })
  }
}

function setItem<T extends NoteSpec | ReferenceSpec>(
  state: DocState,
  list: ItemList<T>,
  item: T,
  before: string | undefined,
  index: number,
  recorder: Recorder
): Applied {
  const document = fileAt(state, list.file, index)
  const items = [...(list.read(document) ?? [])]
  const at = items.findIndex((each) => each.id === item.id)
  const previous = at >= 0 ? items[at] : undefined
  const after = at >= 0 ? items[at + 1]?.id : undefined

  const place = (target: string) => {
    const found = items.findIndex((each) => each.id === target)

    if (found < 0 || target === item.id) {
      throw new OpProblem({
        kind: "notSibling",
        op: index,
        address: { design: list.file, node: item.id },
        before: target
      })
    }

    return found
  }

  if (previous && before === undefined) {
    items[at] = item
  } else {
    if (previous) {
      items.splice(at, 1)
    }

    items.splice(before === undefined ? items.length : place(before), 0, item)
  }

  recorder.item(list.name, list.file, item.id)
  let inverse: DocOp[]

  if (!previous) {
    inverse = [list.remove(item.id)]
  } else if (before === undefined) {
    inverse = [list.set(previous, undefined)]
  } else {
    // Moved: taken out and put back where it was, which is last when nothing came after it.
    inverse = [list.remove(item.id), list.set(previous, after)]
  }

  return {
    state: withFile(state, list.file, withField(document, list.name, items.length > 0 ? items : undefined)),
    inverse,
    plain: [list.set(item, before)]
  }
}

function removeItem<T extends NoteSpec | ReferenceSpec>(
  state: DocState,
  list: ItemList<T>,
  id: string,
  index: number,
  recorder: Recorder
): Applied {
  const document = fileAt(state, list.file, index)
  const items = list.read(document) ?? []
  const at = items.findIndex((each) => each.id === id)

  if (at < 0) {
    throw invalid(index, undefined, `${list.file} has no ${list.name === "notes" ? "note" : "reference"} "${id}"`)
  }

  const kept = items.filter((_, position) => position !== at)
  recorder.item(list.name, list.file, id)

  return {
    state: withFile(state, list.file, withField(document, list.name, kept.length > 0 ? kept : undefined)),
    inverse: [list.set(items[at]!, items[at + 1]?.id)],
    plain: [list.remove(id)]
  }
}

// Modes.

function setModes(state: DocState, modes: ModeSettings, recorder: Recorder, expand: boolean): Applied {
  recorder.modesChanged(state.main)
  let next: DocState = { ...state, modes }
  const plain: DocOp[] = [{ op: "setModes", modes }]

  if (expand) {
    // A mode taken away goes from every design's view in the same step, as `setModes` does today. Undo leaves views as
    // they are, so these have no inverse.
    for (const [path, document] of state.files) {
      const pruned = prunedDocument(document, modes)

      if (pruned === document) {
        continue
      }

      for (const [at, container] of pruned.containers.entries()) {
        if (container !== document.containers[at]) {
          const key = designKey(path, container.id)
          plain.push(valued({ op: "setDesign", design: key, path: ["view"] }, fieldOf(container, "view")))
          recorder.designField(key, path, "view")
        }
      }

      if (pruned.codeDesigns !== document.codeDesigns) {
        plain.push(valued({ op: "setFileField", file: path, field: "codeDesigns" }, fieldOf(pruned, "codeDesigns")))
        recorder.fileField(path, "codeDesigns")
      }

      next = withFile(next, path, pruned)
    }
  }

  return { state: next, inverse: [{ op: "setModes", modes: state.modes }], plain }
}

// Patches.

/** What dropping a removed layer's patches changed, and the operations that say so. */
interface Dropped {
  container: ContainerSpec | undefined
  inverse: DocOp[]
  plain: DocOp[]
}

const none: Dropped = { container: undefined, inverse: [], plain: [] }

/**
 * Drops the state and variant patches naming removed layers, as `deleteNode` does, and says how: as `setDesign`s of
 * `states` and `params` to send, and those that put them back.
 */
function droppedPatches(
  before: ContainerSpec,
  container: ContainerSpec,
  removed: ReadonlySet<string>,
  key: DesignKey,
  path: string,
  recorder: Recorder
): Dropped {
  const dropped = dropPatches(container, removed)

  if (dropped === container) {
    return none
  }

  const inverse: DocOp[] = []
  const plain: DocOp[] = []

  for (const field of ["states", "params"] as const) {
    if (dropped[field] !== container[field]) {
      plain.push(valued({ op: "setDesign", design: key, path: [field] }, fieldOf(dropped, field)))
      inverse.push(valued({ op: "setDesign", design: key, path: [field] }, fieldOf(before, field)))
      recorder.designField(key, path, field)
    }
  }

  return { container: dropped, inverse, plain }
}

// Finding things.

interface FoundDesign {
  path: string
  index: number
  container: ContainerSpec
}

function fileAt(state: DocState, file: string, index: number): CanvasDocument {
  const document = state.files.get(file)

  if (!document) {
    throw new OpProblem({ kind: "unknownFile", op: index, file })
  }

  return document
}

function designAt(state: DocState, key: DesignKey, index: number): FoundDesign {
  const split = splitKey(key)
  const document = split && state.files.get(split.path)
  const at = document ? document.containers.findIndex((container) => container.id === split.id) : -1

  if (!split || !document || at < 0) {
    throw new OpProblem({ kind: "unknownDesign", op: index, design: key })
  }

  return { path: split.path, index: at, container: document.containers[at]! }
}

/** Where a design goes in a file: before `before`, or last. */
function designIndex(
  document: CanvasDocument,
  file: string,
  before: DesignKey | undefined,
  key: DesignKey,
  index: number
): number {
  if (before === undefined) {
    return document.containers.length
  }

  const split = splitKey(before)
  const at = split?.path === file ? document.containers.findIndex((container) => container.id === split.id) : -1

  if (at < 0) {
    throw new OpProblem({ kind: "notSibling", op: index, address: { design: key, node: "" }, before })
  }

  return at
}

/** The layers a parent holds in a slot: a layout's children, or a component's or instance's slot. */
export function siblings(parent: DesignNode, slot: string | undefined): readonly DesignNode[] {
  if (parent.type === "layout" || parent.type === "route") {
    return parent.children
  }

  if (parent.type === "component") {
    return parent.slots?.[slot ?? "children"] ?? []
  }

  if (parent.type === "instance" && slot !== undefined) {
    return parent.slots?.[slot] ?? []
  }

  return []
}

function holdsLayers(parent: DesignNode, slot: string | undefined, design: DesignKey, index: number): void {
  if (parent.type === "layout" && slot === undefined) {
    return
  }

  if (parent.type === "component" || (parent.type === "instance" && slot !== undefined)) {
    return
  }

  throw invalid(
    index,
    design,
    parent.type === "instance"
      ? `Say which of "${parent.id}"'s slots to fill`
      : `"${parent.id}" is a ${parent.type} layer and can't hold ${slot === undefined ? "layers" : "slots"}`
  )
}

/** The index to insert at so a layer lands before `before`, or undefined for last. */
function placeBefore(
  parent: DesignNode,
  slot: string | undefined,
  before: string | undefined,
  design: DesignKey,
  node: string,
  index: number
): number | undefined {
  if (before === undefined) {
    return undefined
  }

  const at = siblings(parent, slot).findIndex((sibling) => sibling.id === before)

  if (at < 0 || before === node) {
    throw new OpProblem({ kind: "notSibling", op: index, address: { design, node }, before })
  }

  return at
}

function slotted(index: number | undefined, slot: string | undefined) {
  return { index, slot }
}

function slotHolder(
  root: DesignNode,
  address: { design: DesignKey; node: string },
  index: number
): Extract<DesignNode, { type: "component" | "instance" }> {
  const node = findNode(root, address.node)

  if (!node) {
    throw new OpProblem({ kind: "unknownNode", op: index, address })
  }

  if (node.type !== "component" && node.type !== "instance") {
    throw invalid(index, address.design, `"${address.node}" is a ${node.type} layer, which has no slots`)
  }

  return node
}

// Values.

function withFile(state: DocState, path: string, document: CanvasDocument): DocState {
  return { ...state, files: new Map(state.files).set(path, document) }
}

function withDesign(state: DocState, found: FoundDesign, container: ContainerSpec): DocState {
  const document = state.files.get(found.path)!
  const containers = [...document.containers]
  containers[found.index] = container

  return withFile(state, found.path, { ...document, containers })
}

function replaceNode(root: DesignNode, id: string, next: DesignNode): DesignNode {
  const location = locateNode(root, id)

  if (!location) {
    return root
  }

  let replaced = next

  for (let depth = location.ancestors.length - 1; depth >= 0; depth -= 1) {
    const parent = location.ancestors[depth]!
    const child = depth === location.ancestors.length - 1 ? location.node : location.ancestors[depth + 1]!
    replaced = withChild(parent, child, replaced)
  }

  return replaced
}

/** A parent with one of the layers it holds replaced, in whichever list holds it. */
function withChild(parent: DesignNode, child: DesignNode, next: DesignNode): DesignNode {
  const swap = (list: DesignNode[]) => list.map((each) => (each === child ? next : each))

  if ("children" in parent && parent.children.includes(child)) {
    return { ...parent, children: swap(parent.children) }
  }

  if ((parent.type === "component" || parent.type === "instance") && parent.slots) {
    const slots: Record<string, DesignNode[]> = {}

    for (const [name, list] of Object.entries(parent.slots)) {
      slots[name] = list.includes(child) ? swap(list) : list
    }

    return { ...parent, slots }
  }

  return parent
}

function rootOf(node: DesignNode, index: number, design: DesignKey): ContainerSpec["root"] {
  if (node.type === "text" || node.type === "image" || node.type === "video" || node.type === "route") {
    throw invalid(index, design, `A design's root can't be a ${node.type} layer`)
  }

  return node
}

/** An operation with `value` set, or without one when it's undefined, which removes. */
function valued<T extends DocOp>(op: T, value: JsonValue | undefined): T {
  return value === undefined ? op : { ...op, value }
}

function invalid(index: number, design: DesignKey | undefined, message: string): OpProblem {
  return new OpProblem({
    kind: "invalid",
    op: index,
    design,
    pointer: "",
    message
  })
}

/** The tree without a layer and everything inside it. */
function withoutNode(root: DesignNode, id: string): DesignNode {
  return mapNode(root, id, () => undefined)
}
