import { type CanvasDocument, findNode, type JsonValue } from "@parity-app/core"
import { sameValue } from "@parity-app/editor"
import { fileOps } from "./diff-ops.ts"
import { designKey, splitKey } from "./keys.ts"
import type { DesignKey, FieldPath, FileField, LayerAddress } from "./types.ts"
import { asJson, pathOf } from "./values.ts"

/*
 * What changed between two `.par` snapshots, by id, whichever provider made them, for review links that show what
 * changed between two commits. It reads the operations that make one into the other.
 */

export interface DocumentDiff {
  designs: {
    added: readonly DesignKey[]
    removed: readonly DesignKey[]
    moved: readonly DesignKey[]
    changed: readonly { design: DesignKey; fields: readonly FieldDiff[] }[]
  }
  layers: {
    added: readonly LayerAddress[]
    removed: readonly LayerAddress[]
    /** A new parent, slot or place among its siblings. */
    moved: readonly LayerAddress[]
    changed: readonly { address: LayerAddress; fields: readonly FieldDiff[] }[]
  }
  notes: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] }
  references: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] }
  fileFields: readonly FileField[]
  modes: boolean
}

export interface FieldDiff {
  path: FieldPath
  before: JsonValue | undefined
  after: JsonValue | undefined
}

/** Comments on a review link, anchored to what they're about in the commit they were written on. */
export interface CommentAnchor {
  /** The commit the comment was written on. */
  commit: string
  design: DesignKey
  node?: string
  /** A range of a text layer's text, by UTF-16 offset in that commit. */
  text?: { start: number; end: number }
}

interface Changes<T> {
  added: T[]
  removed: T[]
  moved: T[]
}

interface ItemChanges {
  added: string[]
  removed: string[]
  changed: string[]
}

export function diffFiles(
  path: string,
  before: CanvasDocument | undefined,
  after: CanvasDocument | undefined
): DocumentDiff {
  const designs: Changes<DesignKey> = { added: [], removed: [], moved: [] }
  const designFields = new Map<DesignKey, FieldDiff[]>()
  const layers: Changes<LayerAddress> = { added: [], removed: [], moved: [] }
  const layerFields = new Map<string, { address: LayerAddress; fields: FieldDiff[] }>()
  const notes: ItemChanges = { added: [], removed: [], changed: [] }
  const references: ItemChanges = { added: [], removed: [], changed: [] }
  const changedFields: FileField[] = []

  const designBefore = (key: DesignKey) => {
    const split = splitKey(key)

    return split && before?.containers.find((container) => container.id === split.id)
  }

  const layerField = (address: LayerAddress, diff: FieldDiff) => {
    const key = `${address.design}\u0000${address.node}`
    const entry = layerFields.get(key) ?? { address, fields: [] }
    entry.fields.push(diff)
    layerFields.set(key, entry)
  }

  if (before && !after) {
    designs.removed.push(...before.containers.map((container) => designKey(path, container.id)))
  }

  for (const op of fileOps(path, before, after)) {
    switch (op.op) {
      case "addDesign":
        designs.added.push(designKey(op.file, op.design.id))
        break
      case "removeDesign":
        designs.removed.push(op.design)
        break
      case "moveDesign":
        designs.moved.push(op.design)
        break
      case "setDesign": {
        const fields = designFields.get(op.design) ?? []
        fields.push({ path: op.path, before: pathOf(designBefore(op.design), op.path), after: op.value })
        designFields.set(op.design, fields)
        break
      }

      case "replaceRoot": {
        const fields = designFields.get(op.design) ?? []
        const root = designBefore(op.design)?.root
        fields.push({ path: ["root"], before: root && asJson(root), after: asJson(op.root) })
        designFields.set(op.design, fields)
        break
      }

      case "insert":
        layers.added.push({ design: op.design, node: op.node.id })
        break
      case "remove":
        layers.removed.push({ design: op.design, node: op.node })
        break
      case "move":
        layers.moved.push({ design: op.design, node: op.node })
        break
      case "set": {
        const node = nodeBefore(designBefore(op.design)?.root, op.node)
        layerField(
          { design: op.design, node: op.node },
          { path: op.path, before: pathOf(node, op.path), after: op.value }
        )
        break
      }

      case "editText": {
        const node = nodeBefore(designBefore(op.design)?.root, op.node)
        const text = op.edit.kind === "replace" ? op.edit.text : undefined
        layerField(
          { design: op.design, node: op.node },
          { path: ["text"], before: pathOf(node, ["text"]), after: text }
        )
        break
      }

      case "addSlot":
      case "removeSlot":
        layerField(
          { design: op.design, node: op.node },
          {
            path: ["slots", op.slot],
            before: op.op === "addSlot" ? undefined : [],
            after: op.op === "addSlot" ? [] : undefined
          }
        )
        break
      case "setNote":
      case "setReference": {
        const item = op.op === "setNote" ? op.note : op.reference
        const list = op.op === "setNote" ? before?.notes : before?.references
        const target = op.op === "setNote" ? notes : references
        const previous = list?.find((each) => each.id === item.id)
        const key = designKey(path, item.id)

        if (!previous) {
          target.added.push(key)
        } else if (!sameValue(previous, item)) {
          target.changed.push(key)
        }

        break
      }

      case "removeNote":
        notes.removed.push(designKey(path, op.id))
        break
      case "removeReference":
        references.removed.push(designKey(path, op.id))
        break
      case "setFileField":
        changedFields.push(op.field)
        break
      default:
        break
    }
  }

  return {
    designs: {
      ...designs,
      changed: [...designFields].map(([design, fields]) => ({ design, fields }))
    },
    layers: { ...layers, changed: [...layerFields.values()] },
    notes,
    references,
    fileFields: changedFields,
    modes: !sameValue(before?.modes, after?.modes)
  }
}

function nodeBefore(root: Parameters<typeof findNode>[0] | undefined, id: string) {
  return root && findNode(root, id)
}
