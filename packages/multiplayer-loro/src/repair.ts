import { dropPatches, hasStates, nodeIds } from "@parity-app/core"
import type { TreeID } from "loro-crdt"
import {
  dataOf,
  nodeIn,
  childrenOf,
  compareIds,
  designRecords,
  fieldsOf,
  type Node,
  readDesign,
  slotKey,
  syncField,
  textOf,
  type Tree
} from "./layout.ts"

/*
 * Repairs after others' changes merge (docs/proposals/multiplayer.md: Ids). Each replica runs them on the designs an
 * import touched, and they're deterministic, so two replicas repairing the same merge make the same changes and those
 * merge to one result: "the later one" goes by tree id, and a new id or slot name is derived from the node's tree id.
 */

/** What a repair did, for `projectDoc.repaired` once it's recorded. */
export type Repair =
  | { kind: "roots"; design: TreeID }
  | { kind: "slots"; node: TreeID; slot: string }
  | { kind: "id"; node: TreeID; from: string; to: string }
  | { kind: "slotName"; node: TreeID; from: string; to: string }
  | { kind: "states"; design: TreeID }
  | { kind: "patches"; design: TreeID }

/** Repairs the designs whose nodes are given, in the tree, and says what it did. */
export function repairDesigns(tree: Tree, designs: Iterable<TreeID>): Repair[] {
  const repairs: Repair[] = []

  for (const id of designs) {
    const design = nodeIn(tree, id)

    if (design && !design.isDeleted()) {
      repairDesign(tree, design, repairs)
    }
  }

  return repairs
}

function repairDesign(tree: Tree, design: Node, repairs: Repair[]): void {
  oneRoot(tree, design, repairs)
  const ids = new Map<string, Node[]>()
  const slotLayouts = new Map<string, Node[]>()

  const visit = (node: Node) => {
    group(ids, textOf(dataOf(node).get("id")) ?? "", node)
    const type = dataOf(node).get("type")
    const slot = textOf(dataOf(node).get("slot"))

    if (type === "layout" && slot !== undefined) {
      group(slotLayouts, slot, node)
    }

    if (type === "component" || type === "instance") {
      for (const slotNode of joinSlots(tree, node, repairs)) {
        childrenOf(slotNode).forEach(visit)
      }
    } else {
      childrenOf(node).forEach(visit)
    }
  }

  childrenOf(design).forEach(visit)
  const taken = new Set(ids.keys())

  for (const [id, nodes] of ids) {
    for (const node of laterOnes(nodes)) {
      const to = derived(id, node.id, taken)
      dataOf(node).set("id", to)
      repairs.push({ kind: "id", node: node.id, from: id, to })
    }
  }

  const names = new Set(slotLayouts.keys())

  for (const [slot, nodes] of slotLayouts) {
    for (const node of laterOnes(nodes)) {
      const to = derived(slot, node.id, names)
      dataOf(node).set("slot", to)
      repairs.push({ kind: "slotName", node: node.id, from: slot, to })
    }
  }

  repairFields(design, repairs)
}

/** Two people replacing a design's root at once leave two: the later one stays. */
function oneRoot(tree: Tree, design: Node, repairs: Repair[]): void {
  const roots = childrenOf(design)

  if (roots.length < 2) {
    return
  }

  const kept = roots.reduce((latest, each) => (compareIds(each.id, latest.id) > 0 ? each : latest))

  for (const root of roots) {
    if (root.id !== kept.id) {
      tree.delete(root.id)
    }
  }

  repairs.push({ kind: "roots", design: design.id })
}

/** Two people filling one empty slot make two slot nodes: the later one's layers join the earlier one, in order. */
function joinSlots(tree: Tree, holder: Node, repairs: Repair[]): Node[] {
  const bySlot = new Map<string, Node[]>()

  for (const slot of childrenOf(holder)) {
    group(bySlot, textOf(dataOf(slot).get(slotKey)) ?? "", slot)
  }

  const kept: Node[] = []

  for (const [name, nodes] of bySlot) {
    const [first, ...later] = nodes.toSorted((a, b) => compareIds(a.id, b.id))

    if (!first) {
      continue
    }

    kept.push(first)

    for (const node of later) {
      for (const child of childrenOf(node)) {
        tree.move(child.id, first.id)
      }

      tree.delete(node.id)
      repairs.push({ kind: "slots", node: holder.id, slot: name })
    }
  }

  return kept
}

/** States on a design that can't have them go, and state and variant patches naming a layer that's gone are dropped. */
function repairFields(design: Node, repairs: Repair[]): void {
  const { data } = design

  if (data.get("states") !== undefined && !hasStates(kindOf(data.get("kind")))) {
    data.delete("states")
    repairs.push({ kind: "states", design: design.id })
  }

  const container = readDesign(design)

  if (!container.root) {
    return
  }

  const repaired = dropPatches(container, new Missing(nodeIds(container.root)))

  if (repaired === container) {
    return
  }

  const before = fieldsOf(container)
  const after = fieldsOf(repaired)

  for (const field of ["states", "params"]) {
    if (before[field] !== after[field]) {
      syncField(data, field, before[field], after[field], designRecords)
    }
  }

  repairs.push({ kind: "patches", design: design.id })
}

function kindOf(kind: ReturnType<Node["data"]["get"]>): Parameters<typeof hasStates>[0] {
  return kind === "component" || kind === "story" ? kind : undefined
}

/** The layers a design doesn't have, for `dropPatches`, which asks whether a patch's layer was removed. */
class Missing extends Set<string> {
  readonly #present: ReadonlySet<string>

  constructor(present: ReadonlySet<string>) {
    super()
    this.#present = present
  }

  override has(id: string): boolean {
    return !this.#present.has(id)
  }
}

function group<T>(groups: Map<string, T[]>, key: string, value: T): void {
  const list = groups.get(key)

  if (list) {
    list.push(value)
  } else {
    groups.set(key, [value])
  }
}

/** All but the earliest, by tree id. */
function laterOnes(nodes: readonly Node[]): Node[] {
  return nodes.toSorted((a, b) => compareIds(a.id, b.id)).slice(1)
}

/** A name derived from a node's tree id, so every replica derives the same one, and not one that's taken. */
function derived(name: string, id: TreeID, taken: Set<string>): string {
  for (let salt = 0; ; salt += 1) {
    const candidate = `${name}-${hash(`${id}:${salt}`)}`

    if (!taken.has(candidate)) {
      taken.add(candidate)

      return candidate
    }
  }
}

/** Five letters and digits from a polynomial hash, like `generateId`'s ids have. */
function hash(text: string): string {
  let value = 7

  for (const char of text) {
    value = (value * 31 + (char.codePointAt(0) ?? 0)) % 2_147_483_647
  }

  return value.toString(36).padStart(5, "0").slice(-5)
}
