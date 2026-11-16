import {
  type CanvasDocument,
  type ContainerSpec,
  childEntries,
  type DesignNode,
  type JsonValue,
  nodeIds
} from "@parity-app/core"
import { sameValue } from "@parity-app/editor"
import { designKey } from "./keys.ts"
import { type DesignKey, type DocOp, type FileField, fileFields } from "./types.ts"
import { fieldOf, fieldsOf, type Holder, isRecord, jsonOf, type PlainRecord } from "./values.ts"

/*
 * The operations that make one value into another, for callers that change whole designs and files. Anything that's
 * the same object is skipped with everything inside it, as PAR-1088's collector does, so a change to one field of one
 * layer compares only the layers above it.
 */

/** Layers' fields that hold other layers or say what they are, compared apart from the rest. */
const structural = new Set(["id", "type", "children", "slots"])

const layerRecords = new Set(["style", "props", "args", "overrides", "responsive"])

const designRecords = new Set(["params", "frames"])

/** The operations that make `before` into `after`. */
export function containerOps(key: DesignKey, before: ContainerSpec, after: ContainerSpec): DocOp[] {
  if (before === after) {
    return []
  }

  const ops: DocOp[] = []

  if (before.root !== after.root) {
    if (before.root.id === after.root.id && before.root.type === after.root.type) {
      new LayerDiff(key, before.root, ops).run(after.root)
    } else {
      ops.push({ op: "replaceRoot", design: key, root: after.root })
    }
  }

  for (const field of keysOf(before, after)) {
    if (field === "id" || field === "root") {
      continue
    }

    fieldOps(before, after, field, designRecords.has(field), (path, value) =>
      ops.push(valued({ op: "setDesign", design: key, path }, value))
    )
  }

  return ops
}

/** The same for a whole file: its designs, notes, references and other fields. `undefined` adds or removes the file. */
export function fileOps(path: string, before: CanvasDocument | undefined, after: CanvasDocument | undefined): DocOp[] {
  if (before === after) {
    return []
  }

  if (!after) {
    return [{ op: "removeFile", file: path }]
  }

  if (!before) {
    const fields: Partial<Record<FileField, JsonValue>> = {}

    for (const field of fileFields) {
      if (after[field] !== undefined) {
        fields[field] = fieldOf(after, field)
      }
    }

    return [
      { op: "addFile", file: path, fields },
      ...after.containers.map((design): DocOp => ({ op: "addDesign", file: path, design })),
      ...(after.notes ?? []).map((note): DocOp => ({ op: "setNote", file: path, note })),
      ...(after.references ?? []).map((reference): DocOp => ({ op: "setReference", file: path, reference }))
    ]
  }

  const ops: DocOp[] = []

  if (before.containers !== after.containers) {
    ops.push(...designOps(path, before.containers, after.containers))
  }

  ops.push(...itemOps(path, "notes", before.notes ?? [], after.notes ?? []))
  ops.push(...itemOps(path, "references", before.references ?? [], after.references ?? []))

  for (const field of fileFields) {
    if (before[field] !== after[field] && !sameValue(before[field], after[field])) {
      ops.push(valued({ op: "setFileField", file: path, field }, fieldOf(after, field)))
    }
  }

  return ops
}

function designOps(path: string, before: readonly ContainerSpec[], after: readonly ContainerSpec[]): DocOp[] {
  const wanted = new Set(after.map((design) => design.id))
  const previous = new Map(before.map((design) => [design.id, design]))
  const removes: DocOp[] = []
  const order: DocOp[] = []
  const changes: DocOp[] = []
  const working = before.flatMap((design) => (wanted.has(design.id) ? [design.id] : []))

  for (const design of before) {
    if (!wanted.has(design.id)) {
      removes.push({ op: "removeDesign", design: designKey(path, design.id) })
    }
  }

  let next: string | undefined

  for (const design of after.toReversed()) {
    const key = designKey(path, design.id)
    const at = working.indexOf(design.id)
    const beforeKey = next === undefined ? {} : { before: designKey(path, next) }

    if (at < 0) {
      order.push({ op: "addDesign", file: path, design, ...beforeKey })
      working.splice(next === undefined ? working.length : working.indexOf(next), 0, design.id)
    } else {
      if (working[at + 1] !== next) {
        order.push({ op: "moveDesign", design: key, ...beforeKey })
        working.splice(at, 1)
        working.splice(next === undefined ? working.length : working.indexOf(next), 0, design.id)
      }

      changes.push(...containerOps(key, previous.get(design.id)!, design))
    }

    next = design.id
  }

  return [...removes, ...order, ...changes]
}

function itemOps<T extends { id: string }>(
  path: string,
  list: "notes" | "references",
  before: readonly T[],
  after: readonly T[]
): DocOp[] {
  if (before === after) {
    return []
  }

  const wanted = new Set(after.map((item) => item.id))
  const previous = new Map(before.map((item) => [item.id, item]))
  const ops: DocOp[] = []
  const working = before.flatMap((item) => (wanted.has(item.id) ? [item.id] : []))

  const set = (item: T, beforeId?: string): DocOp => {
    const at = beforeId === undefined ? {} : { before: beforeId }

    // SAFETY: `list` names which list the items came from, so each is that list's item.
    return list === "notes"
      ? { op: "setNote", file: path, note: item as never, ...at }
      : { op: "setReference", file: path, reference: item as never, ...at }
  }

  for (const item of before) {
    if (!wanted.has(item.id)) {
      ops.push(
        list === "notes"
          ? { op: "removeNote", file: path, id: item.id }
          : { op: "removeReference", file: path, id: item.id }
      )
    }
  }

  let next: string | undefined

  for (const item of after.toReversed()) {
    const at = working.indexOf(item.id)

    if (at < 0 || working[at + 1] !== next) {
      ops.push(set(item, next))

      if (at >= 0) {
        working.splice(at, 1)
      }

      working.splice(next === undefined ? working.length : working.indexOf(next), 0, item.id)
    } else if (previous.get(item.id) !== item && !sameValue(previous.get(item.id), item)) {
      ops.push(set(item))
    }

    next = item.id
  }

  return ops
}

/**
 * The operations between two trees with the same root. It keeps a working copy of the tree as the operations would
 * leave it, to place each layer before the right sibling. The copy is an index of where each layer is, changed in place,
 * so finding or moving a layer costs its list rather than the whole tree.
 */
class LayerDiff {
  private readonly key: DesignKey
  private readonly before: DesignNode
  private readonly ops: DocOp[]
  private readonly working: WorkingTree
  /** Each layer of `before` by id, in the order `nodeIds` gives them. */
  private readonly previous = new Map<string, DesignNode>()
  private wanted = new Set<string>()

  constructor(key: DesignKey, before: DesignNode, ops: DocOp[]) {
    this.key = key
    this.before = before
    this.ops = ops
    this.working = new WorkingTree(before)

    const visit = (node: DesignNode) => {
      if (!this.previous.has(node.id)) {
        this.previous.set(node.id, node)
      }

      for (const entry of childEntries(node)) {
        for (const child of entry.nodes) {
          visit(child)
        }
      }
    }

    visit(before)
  }

  run(after: DesignNode): void {
    this.wanted = nodeIds(after)
    this.visit(this.before, after)
    const removes: string[] = []

    for (const id of this.previous.keys()) {
      if (!this.wanted.has(id) && this.working.has(id)) {
        removes.push(id)
        this.working.remove(id)
      }
    }

    this.ops.push(...removes.map((node): DocOp => ({ op: "remove", design: this.key, node })))
  }

  /** Makes a layer that's already in place into `after`: its fields, and the layers it holds. */
  private visit(before: DesignNode, after: DesignNode): void {
    if (before === after) {
      return
    }

    for (const field of keysOf(before, after)) {
      if (structural.has(field)) {
        continue
      }

      if (field === "text" && after.type === "text") {
        if (before.type === "text" && before.text !== after.text) {
          this.ops.push({
            op: "editText",
            design: this.key,
            node: after.id,
            edit: { kind: "replace", text: after.text }
          })
        }

        continue
      }

      fieldOps(before, after, field, layerRecords.has(field), (path, value) =>
        this.ops.push(valued({ op: "set", design: this.key, node: after.id, path }, value))
      )
    }

    if ((after.type === "component" || after.type === "instance") && after.slots) {
      const had = before.type === after.type ? (before.slots ?? {}) : {}
      const names = Object.keys(after.slots)

      for (const [index, slot] of names.entries()) {
        if (!(slot in had) && after.slots[slot]!.length === 0) {
          const next = names.slice(index + 1).find((name) => name in had)
          this.ops.push({
            op: "addSlot",
            design: this.key,
            node: after.id,
            slot,
            before: next
          })
        }
      }
    }

    for (const { slot, nodes } of lists(after)) {
      this.place(after.id, slot, nodes)
    }

    if ((before.type === "component" || before.type === "instance") && before.slots) {
      const kept = after.type === before.type ? (after.slots ?? {}) : {}

      for (const slot of Object.keys(before.slots)) {
        if (!(slot in kept)) {
          this.ops.push({ op: "removeSlot", design: this.key, node: after.id, slot })
          this.working.removeSlot(after.id, slot)
        }
      }
    }
  }

  /** Puts a list's layers in order under `parent`, inserting new ones and moving those from elsewhere. */
  private place(parent: string, slot: string | undefined, nodes: readonly DesignNode[]): void {
    let next: string | undefined
    const placed: { node: DesignNode; previous: DesignNode | undefined }[] = []

    for (const node of nodes.toReversed()) {
      const previous = this.previous.get(node.id)
      const where = { slot, before: next }

      if (this.working.has(node.id) && previous && previous.type !== node.type) {
        // A layer whose type changed keeps its id, as a remove and an insert.
        this.ops.push({ op: "remove", design: this.key, node: node.id })
        this.working.remove(node.id)
      }

      const current = this.working.locate(node.id)

      if (!current) {
        const whole = [...nodeIds(node)].every((id) => !this.working.has(id))
        const inserted = whole ? node : shallow(node)
        this.ops.push({ op: "insert", design: this.key, parent, ...where, node: inserted })
        this.working.insert(parent, inserted, this.at(parent, slot, next))
        placed.push({ node, previous: whole ? node : inserted })
      } else {
        const holder = current.parent

        // The next sibling that stays: ones about to be removed don't count.
        const after = holder === undefined ? undefined : this.nextKept(holder, current.slot, current.index)

        if (holder !== parent || current.slot !== slotName(this.working.type(holder), slot) || after !== next) {
          this.ops.push({ op: "move", design: this.key, node: node.id, parent, ...where })
          this.working.move(node.id, parent, this.at(parent, slot, next))
        }

        placed.push({ node, previous })
      }

      next = node.id
    }

    for (const { node, previous } of placed) {
      if (previous) {
        this.visit(previous, node)
      }
    }
  }

  /** Where `insertNode` and `moveNode` put a layer to land before `next`. */
  private at(parent: string, slot: string | undefined, next: string | undefined) {
    const index = next === undefined ? undefined : this.working.siblings(parent, slot).indexOf(next)

    return { index, slot }
  }

  /** The first layer after `index` in a holder's list that's in the new tree. */
  private nextKept(holder: string, slot: string | undefined, index: number): string | undefined {
    const list = this.working.siblings(holder, slot)

    for (let at = index + 1; at < list.length; at++) {
      if (this.wanted.has(list[at]!)) {
        return list[at]
      }
    }

    return undefined
  }
}

/** Where a layer sits in the working tree: its parent's id, the slot `locateNode` would report, and its index. */
interface WorkingLocation {
  parent: string | undefined
  slot: string | undefined
  index: number
}

/** One of a layer's lists in the working tree: its key, and the ids in it, which change in place. */
interface WorkingList {
  key: string
  ids: string[]
}

interface WorkingEntry {
  type: DesignNode["type"]
  parent: string | undefined
  /** The key of the list it's in, among its parent's lists. */
  list: string
  /** Inside a list `mapNode` doesn't reach, a route's children or a component's internals, so edits leave it alone. */
  frozen: boolean
}

/**
 * A tree's layers by id, with the ids in each list a layer holds, changed in place. It does what `locateNode`,
 * `insertNode`, `moveNode` and `mapNode` would do to the tree of values, and throws where they would. A list's key is
 * "" for a layout's or a route's children, "i" for a component's internals, and "s:" and the name for a slot.
 */
class WorkingTree {
  private readonly root: string
  private readonly entries = new Map<string, WorkingEntry>()
  private readonly lists = new Map<string, Map<string, string[]>>()

  constructor(root: DesignNode) {
    this.root = root.id
    this.add(root, undefined, "", false)
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  type(id: string): DesignNode["type"] | undefined {
    return this.entries.get(id)?.type
  }

  locate(id: string): WorkingLocation | undefined {
    const entry = this.entries.get(id)

    if (!entry) {
      return undefined
    }

    if (entry.parent === undefined) {
      return { parent: undefined, slot: undefined, index: 0 }
    }

    const index = this.lists.get(entry.parent)!.get(entry.list)!.indexOf(id)

    return { parent: entry.parent, slot: reportedSlot(entry.list), index }
  }

  /** The ids in the list `siblings` in apply.ts reads for a holder and slot. */
  siblings(holder: string, slot: string | undefined): readonly string[] {
    const key = siblingsKey(this.entries.get(holder)?.type, slot)

    return (key === undefined ? undefined : this.lists.get(holder)?.get(key)) ?? []
  }

  /** As `mapNode(root, id, () => undefined)`. */
  remove(id: string): void {
    if (id === this.root) {
      throw new Error("The root of a design can't be removed")
    }

    const entry = this.entries.get(id)

    if (!entry || entry.frozen) {
      return
    }

    this.detach(id, entry)
    this.drop(id)
  }

  /** As `insertNode`. */
  insert(parent: string, node: DesignNode, options: { index?: number; slot?: string }): void {
    for (const id of nodeIds(node)) {
      if (this.entries.has(id)) {
        throw new Error(`A node with id "${id}" already exists in this design`)
      }
    }

    const list = this.listFor(parent, options.slot)
    this.add(node, parent, list.key, false)
    spliceAt(list.ids, node.id, options.index)
  }

  /** As `moveNode`. */
  move(id: string, parent: string, options: { index?: number; slot?: string }): void {
    const location = this.locate(id)

    if (!location) {
      throw new Error(`No node "${id}" in this design`)
    }

    if (location.parent === undefined) {
      throw new Error("The root of a design can't be moved")
    }

    for (let at: string | undefined = parent; at !== undefined; at = this.entries.get(at)?.parent) {
      if (at === id) {
        throw new Error("A node can't be moved inside itself")
      }
    }

    const entry = this.entries.get(id)!

    // `moveNode` takes it out with `mapNode`, which can't reach it, and then finds its id taken.
    if (entry.frozen) {
      throw new Error(`A node with id "${id}" already exists in this design`)
    }

    let index = options.index

    // Removing the node first shifts later siblings in the same list up by one.
    if (index !== undefined && location.parent === parent && location.slot === options.slot && location.index < index) {
      index--
    }

    this.detach(id, entry)
    const list = this.listFor(parent, options.slot)
    entry.parent = parent
    entry.list = list.key
    spliceAt(list.ids, id, index)
  }

  /** As `mapNode(root, id, (node) => withoutSlot(node, slot))`. */
  removeSlot(id: string, slot: string): void {
    const entry = this.entries.get(id)

    if (!entry || entry.frozen || (entry.type !== "component" && entry.type !== "instance")) {
      return
    }

    const lists = this.lists.get(id)
    const ids = lists?.get(`s:${slot}`)

    if (ids) {
      lists!.delete(`s:${slot}`)

      for (const child of ids) {
        this.drop(child)
      }
    }
  }

  /** The list `insertNode` puts a layer in under `parent`, made when a component or instance doesn't have it yet. */
  private listFor(parent: string, slot: string | undefined): WorkingList {
    const entry = this.entries.get(parent)

    if (!entry || entry.frozen) {
      throw new Error(`No node "${parent}" in this design`)
    }

    let key: string

    if (entry.type === "layout") {
      key = ""
    } else if (entry.type === "component") {
      key = `s:${slot ?? "children"}`
    } else if (entry.type === "instance") {
      if (!slot) {
        throw new Error(`Say which of "${parent}"'s slots to fill`)
      }

      key = `s:${slot}`
    } else {
      throw new Error(`"${parent}" is a ${entry.type} node and can't contain other nodes`)
    }

    let lists = this.lists.get(parent)

    if (!lists) {
      lists = new Map()
      this.lists.set(parent, lists)
    }

    let ids = lists.get(key)

    if (!ids) {
      ids = []
      lists.set(key, ids)
    }

    return { key, ids }
  }

  private add(node: DesignNode, parent: string | undefined, list: string, frozen: boolean): void {
    this.entries.set(node.id, { type: node.type, parent, list, frozen })
    const entries = childEntries(node)

    if (entries.length === 0) {
      return
    }

    const lists = new Map<string, string[]>()
    this.lists.set(node.id, lists)

    for (const entry of entries) {
      const key = listKey(node.type, entry.slot)
      const inside = frozen || key === "i" || node.type === "route"
      lists.set(
        key,
        entry.nodes.map((child) => child.id)
      )

      for (const child of entry.nodes) {
        this.add(child, node.id, key, inside)
      }
    }
  }

  private detach(id: string, entry: WorkingEntry): void {
    const ids = this.lists.get(entry.parent!)!.get(entry.list)!
    ids.splice(ids.indexOf(id), 1)
  }

  /** Forgets a layer and everything inside it. */
  private drop(id: string): void {
    this.entries.delete(id)

    for (const ids of this.lists.get(id)?.values() ?? []) {
      for (const child of ids) {
        this.drop(child)
      }
    }

    this.lists.delete(id)
  }
}

/** The key of a list `childEntries` gives: a slot's, a component's internals, or a layout's or route's children. */
function listKey(type: DesignNode["type"], slot: string | undefined): string {
  if (slot !== undefined) {
    return `s:${slot}`
  }

  return type === "component" ? "i" : ""
}

/** The slot `locateNode` reports for a list's key. */
function reportedSlot(list: string): string | undefined {
  return list.startsWith("s:") ? list.slice(2) : undefined
}

/** The key of the list `siblings` in apply.ts reads for a holder of this type. */
function siblingsKey(type: DesignNode["type"] | undefined, slot: string | undefined): string | undefined {
  if (type === "layout" || type === "route") {
    return ""
  }

  if (type === "component") {
    return `s:${slot ?? "children"}`
  }

  if (type === "instance" && slot !== undefined) {
    return `s:${slot}`
  }

  return undefined
}

/** Puts `id` in a list at `index`, clamped, or at the end, as `insertNode` does. */
function spliceAt(ids: string[], id: string, index: number | undefined): void {
  ids.splice(Math.max(0, Math.min(index ?? ids.length, ids.length)), 0, id)
}

/** The lists of layers a layer holds, with their slots. */
function lists(node: DesignNode): { slot: string | undefined; nodes: readonly DesignNode[] }[] {
  if (node.type === "layout") {
    return [{ slot: undefined, nodes: node.children }]
  }

  if (node.type === "component" || node.type === "instance") {
    return Object.entries(node.slots ?? {}).map(([slot, nodes]) => ({ slot, nodes }))
  }

  return []
}

/** The slot `locateNode` reports for a layer in a list: a component's default slot is `children`. */
function slotName(holder: DesignNode["type"] | undefined, slot: string | undefined): string | undefined {
  return holder === "component" ? (slot ?? "children") : slot
}

/** A new layer without the layers it holds, which are placed after it, since some of them already exist. */
function shallow(node: DesignNode): DesignNode {
  if (node.type === "layout") {
    return { ...node, children: [] }
  }

  if ((node.type === "component" || node.type === "instance") && node.slots) {
    return { ...node, slots: Object.fromEntries(Object.keys(node.slots).map((slot) => [slot, []])) }
  }

  return node
}

/** Every field either value has. */
function keysOf(before: Holder | PlainRecord, after: Holder | PlainRecord): Set<string> {
  return new Set([...Object.keys(before), ...Object.keys(after)])
}

/** The changes to one field: whole, or by key for a record field. */
function fieldOps(
  before: Holder,
  after: Holder,
  field: string,
  byKey: boolean,
  emit: (path: string[], value: JsonValue | undefined) => void
): void {
  const from = fieldsOf(before)[field]
  const to = fieldsOf(after)[field]

  if (from === to || sameValue(from, to)) {
    return
  }

  if (!byKey || !isRecord(from) || !isRecord(to)) {
    emit([field], jsonOf(to))

    return
  }

  for (const key of keysOf(from, to)) {
    if (!sameValue(from[key], to[key])) {
      emit([field, key], jsonOf(to[key]))
    }
  }
}

function valued<T extends DocOp>(op: T, value: JsonValue | undefined): T {
  return value === undefined ? op : { ...op, value }
}
