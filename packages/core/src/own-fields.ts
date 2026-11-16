import type { ContainerSpec, DesignNode, ImageCredit, ImageNode, TextNode } from "./document.ts"
import { findNode, mapNode } from "./edit.ts"
import { CodedError } from "./errors.ts"

/**
 * A node's own fields: what it's called, and what it is or shows. Only the design sets them; a state or a variant option
 * patches the rest. A field left `undefined` stays as it is; `null` takes it away, as an empty name or alt text and a
 * video's controls turned off do.
 */
export interface OwnFields {
  name?: string | null
  /** A text's element. */
  tag?: TextNode["tag"] | null
  /** A code component's name in its package. */
  component?: string
  /** An image's or a video's file. */
  src?: string
  /** What an image or a video shows, for screen readers. */
  alt?: string | null
  /** How an image or a video fills its box. */
  fit?: ImageNode["fit"] | null
  /** Who made a stock image or video and where it came from. */
  credit?: ImageCredit | null
  /** Whether a video shows the browser's controls. */
  controls?: boolean | null
}

/** The fields only some nodes have: every node has a name. */
const heldFields = ["tag", "component", "src", "alt", "fit", "credit", "controls"] as const

/** The node types that have each of `heldFields`, and what to say when it's given for anything else. */
const holders: Record<(typeof heldFields)[number], { types: readonly DesignNode["type"][]; message: string }> = {
  tag: { types: ["text"], message: "Only a text has a tag" },
  component: { types: ["component"], message: "Only a code component has a component name" },
  src: {
    types: ["image", "video"],
    message: "Only an image or a video has src; a component takes its picture as a prop"
  },
  alt: {
    types: ["image", "video"],
    message: "Only an image or a video has alt; a component takes its picture as a prop"
  },
  fit: { types: ["image", "video"], message: "Only an image or a video has fit" },
  credit: {
    types: ["image", "video"],
    message: "Only an image or a video has credit; a component takes its picture as a prop"
  },
  controls: { types: ["video"], message: "Only a video has controls" }
}

/**
 * Sets a node's own fields in the design, wherever the node sits: in a layout, a code component's slot, or the layers an
 * instance fills its component's slots with. Returns the same container when nothing changes, so callers can skip
 * saving. Throws when the node isn't there, when it doesn't have a field that's given, or when a file or component name
 * is empty.
 */
export function setOwnFields(container: ContainerSpec, nodeId: string, fields: OwnFields): ContainerSpec {
  const node = findNode(container.root, nodeId)

  if (!node) {
    throw new Error(`No node "${nodeId}" in ${container.name}`)
  }

  for (const field of heldFields) {
    const holder = holders[field]

    if (fields[field] !== undefined && !holder.types.includes(node.type)) {
      throw new CodedError(holder.message, { code: "invalid_input", field })
    }
  }

  for (const field of ["src", "component"] as const) {
    if (fields[field] === "") {
      throw new CodedError(field === "src" ? "An image or a video needs a file" : "A code component needs a name", {
        code: "invalid_input",
        field
      })
    }
  }

  const next = withOwnFields(node, fields)

  return next === node ? container : { ...container, root: mapNode(container.root, nodeId, () => next) }
}

/** The node with `fields` set, or the same node when they're what it has already. */
function withOwnFields(node: DesignNode, fields: OwnFields): DesignNode {
  const next = { ...node }
  let changed = settle(next, "name", fields.name)

  if (next.type === "text") {
    changed = settle(next, "tag", fields.tag) || changed
  }

  if (next.type === "component") {
    changed = settle(next, "component", fields.component) || changed
  }

  if (next.type === "image" || next.type === "video") {
    changed = settle(next, "src", fields.src) || changed
    changed = settle(next, "alt", fields.alt) || changed
    changed = settle(next, "fit", fields.fit) || changed
    changed = settle(next, "credit", fields.credit) || changed
  }

  if (next.type === "video") {
    changed = settle(next, "controls", fields.controls) || changed
  }

  return changed ? next : node
}

/**
 * Writes one field: leaves it for `undefined`, takes it away for `null`, `""` or `false`, and sets it otherwise. Says
 * whether that changed the node.
 */
function settle<Node extends object, Key extends keyof Node>(
  node: Node,
  key: Key,
  value: Node[Key] | null | undefined
): boolean {
  if (value === undefined) {
    return false
  }

  if (value === null || value === "" || value === false) {
    return key in node && Reflect.deleteProperty(node, key)
  }

  if (node[key] === value) {
    return false
  }

  node[key] = value

  return true
}
