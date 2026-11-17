import {
  type CanvasDocument,
  canvasDocument,
  type ContainerSpec,
  containerSpec,
  type DesignNode,
  formatVersion,
  type JsonValue,
  type ModeSettings,
  modeSettings,
  nodeTree,
  type NoteSpec,
  type ReferenceSpec
} from "@parity-app/core"
import type { TokenEdit, TokenEdits } from "@parity-app/editor"
import { LoroMap, type LoroMovableList, LoroText, type LoroTree, type LoroTreeNode, type TreeID } from "loro-crdt"

/*
 * How the project document sits in Loro (docs/proposals/multiplayer.md: How the document maps onto Loro), and reading
 * and writing the plain values there. Designs and layers are nodes of one movable tree with fractional order, a slot is
 * a node of its own under its component or instance, and record fields and text are mergeable containers, so two
 * people creating the same one get the same container.
 */

/** A JSON object as Loro gives it back. */
export type JsonRecord = Record<string, JsonValue>

/** A design, a layer, a file or the modes by field name, as JSON: an optional field may be absent. */
export type Fields = Record<string, JsonValue | undefined>

/** A record field (`style`, `params`), a file's other fields, or the modes: one entry per key. */
export type FieldMap = LoroMap<JsonRecord>

/** A value in a tree node's data: a plain field, a record field, or a text layer's text. */
export type NodeValue = JsonValue | LoroMap | LoroText

/** What a tree node's data holds. */
export type NodeData = Record<string, NodeValue>

export type Node = LoroTreeNode<NodeData>

export type Tree = LoroTree<NodeData>

/** A file's notes or references, in order, each replaced whole. */
export type ItemList = LoroMovableList<JsonValue>

/*
 * Every Loro object JavaScript holds keeps its whole document alive until it's freed, and V8 frees one only once it
 * collects it, which a document's WebAssembly memory doesn't prompt: opening and disposing a large project eight times
 * held 480 MB. So each object this package gets from Loro is kept here and freed when the backend's call returns.
 */
const kept: { free(): void }[] = []
let depth = 0

/** Keeps a Loro object to free when the backend's call returns. */
export function keep<T extends { free(): void }>(value: T): T {
  kept.push(value)

  return value
}

/** Runs one of the backend's calls, freeing the Loro objects it got once the outermost returns. */
export function scoped<T>(run: () => T): T {
  depth += 1

  try {
    return run()
  } finally {
    depth -= 1

    if (depth === 0) {
      for (const value of kept.splice(0)) {
        value.free()
      }
    }
  }
}

/** A node's fields. */
export function dataOf(node: Node): LoroMap<NodeData> {
  return keep(node.data)
}

/** A node by its tree id, if the tree has it. */
export function nodeIn(tree: Tree, id: TreeID): Node | undefined {
  const found = tree.getNodeByID(id)

  return found ? keep(found) : undefined
}

/** The document's root containers. */
export type ProjectContainers = {
  designs: Tree
  /** A file's path to its notes. */
  notes: LoroMap<Record<string, ItemList>>
  references: LoroMap<Record<string, ItemList>>
  /** A file's path to its other fields; a file is in the project while it has an entry. */
  files: LoroMap<Record<string, FieldMap>>
  modes: FieldMap
  /** Token values edited on the canvas, by `name theme`, each replaced whole. */
  tokens: FieldMap
}

/** A design node's own field naming its file, beside the design's fields. */
export const fileKey = "file"

/** A slot node's field naming the slot. */
export const slotKey = "slotOf"

export const layerRecords: ReadonlySet<string> = new Set(["style", "props", "args", "overrides", "responsive"])

export const designRecords: ReadonlySet<string> = new Set(["params", "frames"])

/** Layers' fields read from code and never saved, so never in the document. */
const unsaved = new Set(["internals", "element"])

/** Each layer type's fields in the order core's schema lists them, so saved files keep a steady key order. */
const layerOrder = new Map<string, string[]>(
  nodeTree.options.map((option) => [option.shape.type.value, Object.keys(option.shape)])
)

const designOrder = Object.keys(containerSpec.shape)

const fileOrder = Object.keys(canvasDocument.shape)

const modesOrder = Object.keys(modeSettings.shape)

export function isJsonRecord(value: NodeValue | undefined): value is JsonRecord {
  return value instanceof Object && !Array.isArray(value)
}

/** A design's, a layer's, a file's or the modes' fields by name, as JSON. */
export function fieldsOf(
  value: ContainerSpec | DesignNode | CanvasDocument | ModeSettings | NoteSpec | ReferenceSpec
): Fields {
  // SAFETY: designs, layers, files and modes are JSON objects, read from a `.par` file or checked against its schema.
  return value as Fields
}

/** The fields that have a value. */
export function entriesOf(fields: Fields): [string, JsonValue][] {
  return Object.entries(fields).flatMap(([field, value]): [string, JsonValue][] =>
    value === undefined ? [] : [[field, value]]
  )
}

/** A plain field's text: an id, a type, a slot's name or a file's path. */
export function textOf(value: NodeValue | undefined): string | undefined {
  if (
    value === undefined ||
    value === null ||
    value instanceof LoroText ||
    value instanceof LoroMap ||
    Array.isArray(value) ||
    isJsonRecord(value)
  ) {
    return undefined
  }

  return String(value)
}

/** A record field's map, made if it isn't there. */
export function recordIn(data: Pick<LoroMap, "ensureMergeableMap">, field: string): FieldMap {
  // SAFETY: record fields, a file's fields and the modes hold JSON values, one per key, set only from checked values.
  return keep(data.ensureMergeableMap(field) as FieldMap)
}

/** A file's notes or references, made if they aren't there. */
export function listIn(map: Pick<LoroMap, "ensureMergeableMovableList">, file: string): ItemList {
  // SAFETY: notes and references hold JSON items, each set whole from a checked item.
  return keep(map.ensureMergeableMovableList(file) as ItemList)
}

/** The tree's roots: one node per design. */
export function rootsOf(tree: Tree): Node[] {
  // SAFETY: every node in the tree is made with `NodeData`; Loro's class doesn't carry the tree's type to `roots`.
  return (tree.roots() as Node[]).map((root) => keep(root))
}

export function sameJson(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) {
    return true
  }

  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((each, index) => sameJson(each, b[index]))
  }

  if (!isJsonRecord(a) || !isJsonRecord(b)) {
    return false
  }

  const keys = Object.keys(a)

  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameJson(a[key], b[key]))
}

// Writing.

/** Makes a layer and everything inside it, under `parent` at `index` or last, telling `made` of each layer. */
export function writeLayer(
  parent: Node,
  layer: DesignNode,
  index: number | undefined,
  made: (id: string, node: Node) => void
): Node {
  const node = keep(index === undefined ? parent.createNode() : parent.createNode(index))
  made(layer.id, node)
  const data = dataOf(node)

  for (const [field, value] of entriesOf(fieldsOf(layer))) {
    if (field === "children" || field === "slots" || unsaved.has(field)) {
      continue
    }

    writeField(data, field, value, layerRecords)
  }

  if ("children" in layer) {
    for (const child of layer.children) {
      writeLayer(node, child, undefined, made)
    }
  }

  if ("slots" in layer && layer.slots) {
    for (const [name, layers] of Object.entries(layer.slots)) {
      const slot = keep(node.createNode())
      dataOf(slot).set(slotKey, name)
      made("", slot)

      for (const child of layers) {
        writeLayer(slot, child, undefined, made)
      }
    }
  }

  return node
}

/** Makes a design's node, at `index` among the tree's roots or last, with its root layer. */
export function writeDesign(
  tree: Tree,
  path: string,
  design: ContainerSpec,
  index: number | undefined,
  made: (root: Node) => (id: string, node: Node) => void
): Node {
  const node = keep(index === undefined ? tree.createNode() : tree.createNode(undefined, index))
  const data = dataOf(node)
  data.set(fileKey, path)

  for (const [field, value] of entriesOf(fieldsOf(design))) {
    if (field !== "root") {
      writeField(data, field, value, designRecords)
    }
  }

  writeLayer(node, design.root, undefined, made(node))

  return node
}

function writeField(data: LoroMap<NodeData>, field: string, value: JsonValue, records: ReadonlySet<string>): void {
  syncField(data, field, undefined, value, records)
}

/**
 * Makes a field of a node's data hold `after`, from `before`: a record field key by key, so others' changes to other
 * keys stay, and text by its difference, so others' typing stays. `before` undefined writes it whole.
 */
export function syncField(
  data: LoroMap<NodeData>,
  field: string,
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  records: ReadonlySet<string>
): void {
  if (after === undefined) {
    if (data.get(field) !== undefined) {
      data.delete(field)
    }

    return
  }

  if (field === "text" && records === layerRecords) {
    const text = keep(data.ensureMergeableText(field))
    const value = textOf(after) ?? ""

    // A new text is filled in one insert; `update` works out a difference, which costs far more on opening a project.
    if (text.length === 0) {
      text.insert(0, value)
    } else {
      text.update(value)
    }

    return
  }

  if (records.has(field) && isJsonRecord(after)) {
    const record = recordIn(data, field)
    syncRecord(record, isJsonRecord(before) ? before : undefined, after)

    return
  }

  data.set(field, after)
}

/** Sets one key of a record field, creating the record if it isn't there, and taking it away once it's empty. */
export function syncKey(
  data: LoroMap<NodeData>,
  field: string,
  key: string,
  value: JsonValue | undefined,
  recordAfter: JsonValue | undefined
): void {
  if (recordAfter === undefined) {
    if (data.get(field) !== undefined) {
      data.delete(field)
    }

    return
  }

  const present = data.get(field) !== undefined
  const record = recordIn(data, field)

  if (!present && isJsonRecord(recordAfter)) {
    // A record taken away and made again keeps what it held in Loro: what isn't in it now goes.
    syncRecord(record, undefined, recordAfter)
  } else if (value === undefined) {
    record.delete(key)
  } else {
    record.set(key, value)
  }
}

function syncRecord(record: FieldMap, before: JsonRecord | undefined, after: JsonRecord): void {
  const previous = before ?? recordJson(record)

  for (const key of Object.keys(previous)) {
    if (!(key in after)) {
      record.delete(key)
    }
  }

  for (const [key, value] of Object.entries(after)) {
    if (!before || !sameJson(before[key], value)) {
      record.set(key, value)
    }
  }
}

// Reading.

/** A field's value as plain JSON: a record field's keys, or a text layer's text. An empty record reads as absent. */
function readValue(value: NodeValue | undefined): JsonValue | undefined {
  if (value instanceof LoroText) {
    return keep(value).toString()
  }

  if (value instanceof LoroMap) {
    const json = recordJson(keep(value))

    return Object.keys(json).length > 0 ? json : undefined
  }

  return value
}

/** A node's layers: its children, or a slot node's. */
export function childrenOf(node: Node): Node[] {
  return (node.children() ?? []).map((child) => keep(child))
}

export function readLayer(node: Node): DesignNode {
  const data = dataOf(node)
  const order = layerOrder.get(textOf(data.get("type")) ?? "") ?? []
  const layer: Fields = {}

  for (const field of order) {
    if (field === "children") {
      layer.children = childrenOf(node).map(readLayerJson)
    } else if (field === "slots") {
      const slots = childrenOf(node)

      if (slots.length > 0) {
        layer.slots = Object.fromEntries(
          slots.map((slot) => [textOf(dataOf(slot).get(slotKey)) ?? "", slotLayers(slot)])
        )
      }
    } else {
      setRead(layer, field, data.get(field))
    }
  }

  for (const field of data.keys()) {
    if (!order.includes(field)) {
      setRead(layer, field, data.get(field))
    }
  }

  // SAFETY: the layer was written from a checked `DesignNode` and only changed by operations `ProjectDoc` checked.
  return layer as DesignNode
}

function readLayerJson(node: Node): JsonRecord {
  return jsonOf(fieldsOf(readLayer(node)))
}

function slotLayers(slot: Node): JsonValue[] {
  return childrenOf(slot).map(readLayerJson)
}

/** Fields with nothing absent, as Loro takes them and gives them back. */
export function jsonOf(fields: Fields): JsonRecord {
  // SAFETY: fields read from Loro are only set when they have a value.
  return fields as JsonRecord
}

/** A map's keys and values, which Loro gives back as JSON. */
export function recordJson(map: LoroMap): JsonRecord {
  // SAFETY: the maps this package makes hold JSON values only.
  return map.toJSON() as JsonRecord
}

function setRead(target: Fields, field: string, value: NodeValue | undefined): void {
  const read = readValue(value)

  if (read !== undefined) {
    target[field] = read
  }
}

export function readDesign(node: Node): ContainerSpec {
  const data = dataOf(node)
  const design: Fields = {}

  for (const field of designOrder) {
    if (field === "root") {
      const root = childrenOf(node).at(-1)

      if (root) {
        design.root = readLayerJson(root)
      }
    } else {
      setRead(design, field, data.get(field))
    }
  }

  for (const field of data.keys()) {
    if (field !== fileKey && !designOrder.includes(field)) {
      setRead(design, field, data.get(field))
    }
  }

  // SAFETY: the design was written from a checked `ContainerSpec` and only changed by checked operations and repairs.
  return design as ContainerSpec
}

/** A file as the plain values hold it, without its modes, from its designs, items and other fields. */
export function readFile(
  containers: readonly ContainerSpec[],
  notes: ItemList | undefined,
  references: ItemList | undefined,
  fields: FieldMap | undefined
): CanvasDocument {
  const file: Fields = {}
  const other = fields ? recordJson(fields) : {}

  for (const field of fileOrder) {
    if (field === "version") {
      file.version = formatVersion
    } else if (field === "containers") {
      file.containers = containers.map((design) => jsonOf(fieldsOf(design)))
    } else if (field === "notes" || field === "references") {
      const list = field === "notes" ? notes : references
      const items = list ? listJson(list) : []

      if (items.length > 0) {
        file[field] = items
      }
    } else if (field !== "modes" && other[field] !== undefined) {
      file[field] = other[field]
    }
  }

  // SAFETY: built from checked designs, items and file fields, in the order core's schema lists them.
  return file as CanvasDocument
}

/** A list's items, which Loro gives back as JSON. */
export function listJson(list: ItemList): JsonValue[] {
  // SAFETY: notes and references are set from checked items, each whole.
  return list.toJSON() as JsonValue[]
}

/** The token values edited on the canvas, as the tokens map holds them. */
export function readTokens(tokens: FieldMap): TokenEdits {
  const edits = new Map<string, TokenEdit>()

  for (const [key, value] of Object.entries(recordJson(tokens))) {
    if (!isJsonRecord(value)) {
      continue
    }

    const name = textOf(value.name)
    const theme = textOf(value.theme)
    const edit = textOf(value.value)

    if (name === undefined || theme === undefined || edit === undefined) {
      continue
    }

    const read: TokenEdit = { name, theme, value: edit }
    const original = textOf(value.original)

    if (original !== undefined) {
      read.original = original
    }

    edits.set(key, read)
  }

  return edits
}

/** A token edit as the tokens map holds it, `original` null when the token had no value in its theme. */
export function tokenJson({ name, theme, value, original }: TokenEdit) {
  return { name, theme, value, original: original ?? null }
}

export function readModes(modes: FieldMap): ModeSettings {
  const json = recordJson(modes)
  const ordered: Fields = {}

  for (const field of [...modesOrder, ...Object.keys(json)]) {
    if (json[field] !== undefined && !(field in ordered)) {
      ordered[field] = json[field]
    }
  }

  // SAFETY: the modes were written from checked `ModeSettings`, a top-level field at a time.
  return ordered as ModeSettings
}

/** Orders tree ids by when they were made: a later counter, then a larger peer, is later. */
export function compareIds(a: TreeID, b: TreeID): number {
  const [counterA = "0", peerA = "0"] = a.split("@")
  const [counterB = "0", peerB = "0"] = b.split("@")
  const counter = Number(counterA) - Number(counterB)

  if (counter !== 0) {
    return counter
  }

  const peer = BigInt(peerA) - BigInt(peerB)

  if (peer === 0n) {
    return 0
  }

  return peer > 0n ? 1 : -1
}
