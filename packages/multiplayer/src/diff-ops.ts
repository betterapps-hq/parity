import {
  type CanvasDocument,
  type ContainerSpec,
  type DesignNode,
  insertNode,
  type JsonValue,
  locateNode,
  moveNode,
  nodeIds,
  mapNode
} from "@parity-app/core"
import { sameValue } from "@parity-app/editor"
import { siblings } from "./apply.ts"
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
 * leave it, to place each layer before the right sibling.
 */
class LayerDiff {
  private readonly key: DesignKey
  private readonly before: DesignNode
  private readonly ops: DocOp[]
  private working: DesignNode
  private readonly previous = new Map<string, DesignNode>()
  private wanted = new Set<string>()

  constructor(key: DesignKey, before: DesignNode, ops: DocOp[]) {
    this.key = key
    this.before = before
    this.ops = ops
    this.working = before

    for (const id of nodeIds(before)) {
      this.previous.set(id, locateNode(before, id)!.node)
    }
  }

  run(after: DesignNode): void {
    this.wanted = nodeIds(after)
    this.visit(this.before, after)
    const removes: string[] = []

    for (const id of nodeIds(this.before)) {
      if (!this.wanted.has(id) && locateNode(this.working, id)) {
        removes.push(id)
        this.working = withoutNode(this.working, id)
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
          this.working = mapNode(this.working, after.id, (node) => withoutSlot(node, slot))
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
      const location = locateNode(this.working, node.id)
      const where = { slot, before: next }

      if (location && previous && previous.type !== node.type) {
        // A layer whose type changed keeps its id, as a remove and an insert.
        this.ops.push({ op: "remove", design: this.key, node: node.id })
        this.working = withoutNode(this.working, node.id)
      }

      if (!locateNode(this.working, node.id)) {
        const whole = [...nodeIds(node)].every((id) => !locateNode(this.working, id))
        const inserted = whole ? node : shallow(node)
        this.ops.push({ op: "insert", design: this.key, parent, ...where, node: inserted })
        this.working = insertNode(this.working, parent, inserted, this.at(parent, slot, next))
        placed.push({ node, previous: whole ? node : inserted })
      } else {
        const current = locateNode(this.working, node.id)!
        const holder = current.ancestors.at(-1)

        // The next sibling that stays: ones about to be removed don't count.
        const after = holder
          ? siblings(holder, current.slot)
              .slice(current.index + 1)
              .find((each) => this.wanted.has(each.id))?.id
          : undefined

        if (holder?.id !== parent || current.slot !== slotName(holder, slot) || after !== next) {
          this.ops.push({ op: "move", design: this.key, node: node.id, parent, ...where })
          this.working = moveNode(this.working, node.id, parent, this.at(parent, slot, next))
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
    const holder = locateNode(this.working, parent)!.node
    const list = siblings(holder, slot)
    const index = next === undefined ? undefined : list.findIndex((each) => each.id === next)

    return { index, slot }
  }
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
function slotName(holder: DesignNode | undefined, slot: string | undefined): string | undefined {
  return holder?.type === "component" ? (slot ?? "children") : slot
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

/** The tree without a layer and everything inside it. */
function withoutNode(root: DesignNode, id: string): DesignNode {
  return mapNode(root, id, () => undefined)
}

/** A component or instance layer without one of its slots, and the layers in it. */
function withoutSlot(node: DesignNode, slot: string): DesignNode {
  if ((node.type !== "component" && node.type !== "instance") || !node.slots) {
    return node
  }

  const slots = Object.fromEntries(Object.entries(node.slots).filter(([name]) => name !== slot))

  return { ...node, slots }
}
