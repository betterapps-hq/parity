import {
  type CanvasDocument,
  type ContainerSpec,
  deleteNode,
  type DesignChange,
  type DesignNode,
  findNode,
  insertNode,
  mapNode,
  moveNode,
  nodeTree,
  parseCanvasDocument
} from "@parity-app/core"
import { z } from "zod"
import { sameDesign } from "./document-equality.ts"
import type { DesignSnapshot } from "./snapshot.ts"

/*
 * Changes to designs as operations on layers and their fields, as an extension sends them (PAR-1093). They're applied
 * to what the editor holds now, checked whole, and turned into the design changes an agent's call makes, so the window
 * applies them the same way: as one undo step, or not at all. The operations are a subset of those the multiplayer
 * proposal names (docs/proposals/multiplayer.md), so moving to the document of operations changes their applying, not
 * their shape.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** A path into a layer's fields: `["name"]`, `["props", "variant"]`. */
export type FieldPath = string[]

/** One change to a layer of a design, by the design's key (`app.par#home`). */
export type DesignOperation =
  | { op: "insert"; design: string; parent: string; slot?: string; before?: string; node: Json }
  | { op: "remove"; design: string; node: string }
  | { op: "move"; design: string; node: string; parent: string; slot?: string; before?: string }
  | { op: "set"; design: string; node: string; path: FieldPath; value?: Json }

/** The fields `set` can't change, since they're a layer's identity or hold other layers. */
const fixedFields = new Set(["id", "type", "children", "slots"])

/**
 * The design changes `operations` make to `snapshot`, applied in order. Throws, naming the operation by its position,
 * when one can't apply (a design or layer that isn't there, an id that's taken, a field that can't be set) or when a
 * design it leaves isn't valid; nothing is applied then.
 */
export function designOperationChanges(
  snapshot: DesignSnapshot,
  operations: readonly DesignOperation[]
): DesignChange[] {
  const before = new Map<string, { path: string; container: ContainerSpec }>()
  const after = new Map<string, ContainerSpec>()

  for (const [index, operation] of operations.entries()) {
    const key = operation.design

    if (!after.has(key)) {
      const found = findDesign(snapshot, key)

      if (!found) {
        throw new Error(`Operation ${index + 1}: no design "${key}"`)
      }

      before.set(key, found)
      after.set(key, found.container)
    }

    try {
      after.set(key, applyOperation(after.get(key)!, operation))
    } catch (error) {
      throw new Error(`Operation ${index + 1}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }
  }

  const changes: DesignChange[] = []

  for (const [key, { path, container }] of before) {
    const changed = after.get(key)!

    // Operations that cancel each other out leave no change, and no undo step.
    if (!sameDesign(changed, container)) {
      changes.push({ path, id: container.id, base: container, after: changed })
    }
  }

  check(snapshot, changes)

  return changes
}

/** The design with `key` (`path#id`), and the file it's in. */
function findDesign(snapshot: DesignSnapshot, key: string): { path: string; container: ContainerSpec } | undefined {
  const split = key.lastIndexOf("#")

  if (split <= 0) {
    return undefined
  }

  const path = key.slice(0, split)
  const container = snapshot.documents.get(path)?.containers.find((each) => each.id === key.slice(split + 1))

  return container && { path, container }
}

function applyOperation(container: ContainerSpec, operation: DesignOperation): ContainerSpec {
  switch (operation.op) {
    case "insert": {
      const node = readNode(operation.node)
      const at = placement(container.root, operation)

      return { ...container, root: insertNode(container.root, operation.parent, node, at) }
    }

    case "remove":
      return deleteNode(container, operation.node)

    case "move": {
      const at = placement(container.root, operation)

      return { ...container, root: moveNode(container.root, operation.node, operation.parent, at) }
    }

    case "set":
      return { ...container, root: setField(container.root, operation.node, operation.path, operation.value) }
  }
}

/** Where `insertNode` and `moveNode` put a layer. */
type Placement = NonNullable<Parameters<typeof insertNode>[3]>

/** Where an insert or a move puts its layer: before `before`, in `slot`. */
function placement(
  root: DesignNode,
  { parent, slot, before }: { parent: string; slot?: string; before?: string }
): Placement {
  const at: Placement = {}
  const index = indexBefore(root, parent, slot, before)

  if (index !== undefined) {
    at.index = index
  }

  if (slot !== undefined) {
    at.slot = slot
  }

  return at
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- an extension's node, checked against core's schema here
function readNode(value: unknown): DesignNode {
  const read = nodeTree.safeParse(value)

  if (!read.success) {
    throw new Error(`The node isn't valid: ${read.error.issues[0]?.message ?? "unknown problem"}`)
  }

  return read.data
}

/** Where `before` is among the layers `parent` holds in `slot`; last when it's left out. */
function indexBefore(
  root: DesignNode,
  parentId: string,
  slot: string | undefined,
  before: string | undefined
): number | undefined {
  if (before === undefined) {
    return undefined
  }

  const parent = findNode(root, parentId)

  if (!parent) {
    throw new Error(`No layer "${parentId}" in this design`)
  }

  let siblings: DesignNode[] = []

  if (parent.type === "layout") {
    siblings = parent.children
  } else if (parent.type === "component") {
    siblings = parent.slots?.[slot ?? "children"] ?? []
  } else if (parent.type === "instance" && slot !== undefined) {
    siblings = parent.slots?.[slot] ?? []
  }

  const index = siblings.findIndex((sibling) => sibling.id === before)

  if (index < 0) {
    throw new Error(`"${before}" isn't in "${parentId}"`)
  }

  return index
}

/** The record fields `set` can change one key of. */
const recordField = z.enum(["props", "style", "args"])

const record = z.record(z.string(), z.json())

/** A layer's record fields, read to change one key. */
const records = z.looseObject({ props: record.optional(), style: record.optional(), args: record.optional() })

/**
 * The tree with one of a layer's fields set, or taken away when `value` is undefined: a field (`["name"]`), or one key
 * of a record field (`["props", "variant"]`).
 */
function setField(root: DesignNode, nodeId: string, path: FieldPath, value: Json | undefined): DesignNode {
  const [field, key, ...rest] = path

  if (field === undefined || rest.length > 0) {
    throw new Error("Say a field, or a field and one of its keys")
  }

  if (fixedFields.has(field)) {
    throw new Error(`A layer's ${field} can't be set`)
  }

  const inRecord = key === undefined ? undefined : recordField.safeParse(field)

  if (inRecord?.success === false) {
    throw new Error(`Only a key of props, style or args can be set, not of ${field}`)
  }

  if (!findNode(root, nodeId)) {
    throw new Error(`No layer "${nodeId}" in this design`)
  }

  return mapNode(root, nodeId, (node) => {
    if (key === undefined || !inRecord?.success) {
      return withField(node, field, value)
    }

    const read = records.safeParse(node)
    const values = { ...read.data?.[inRecord.data] }

    if (value === undefined) {
      delete values[key]
    } else {
      values[key] = value
    }

    return withField(node, field, Object.keys(values).length > 0 ? values : undefined)
  })
}

/** A layer with a field set, or taken away. */
function withField(node: DesignNode, field: string, value: Json | undefined): DesignNode {
  const next = { ...node, [field]: value }

  if (value === undefined) {
    Reflect.deleteProperty(next, field)
  }

  // SAFETY: what the change leaves is checked against core's schemas (`check`) before anything is applied.
  return next as DesignNode
}

/** Checks every file a change touches is still valid with the changes in it. */
function check(snapshot: DesignSnapshot, changes: readonly DesignChange[]): void {
  const documents = new Map<string, CanvasDocument>()

  for (const { path, id, after } of changes) {
    const document = documents.get(path) ?? snapshot.documents.get(path)!

    documents.set(path, {
      ...document,
      containers: document.containers.map((container) => (container.id === id && after ? after : container))
    })
  }

  for (const [path, document] of documents) {
    try {
      parseCanvasDocument(document)
    } catch (error) {
      throw new Error(`${path} would be invalid: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }
  }
}
