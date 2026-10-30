import {
  boardTarget,
  childEntries,
  type ContainerSpec,
  type DesignNode,
  editNode,
  findNode,
  generateId,
  insertNode,
  locateNode,
  nodeIds,
  nodeInState,
  type NodeStyle,
  type NoteSpec,
  type StateSpec,
  topmostNodes,
  uniqueId,
  withFreshIds
} from "@parity/core"

/**
 * The clipboard's rules: what a copy holds, how it's written as text so it pastes into another project or another
 * Parity window, where pasted layers go, the fresh ids they get, and copying and pasting style. What's copied is what
 * the frame shows: a layer copied in a state other than the base carries that state's changes. Pasted layers get fresh
 * ids; pasted designs keep theirs unless taken. Reading and writing the system clipboard stays in the app.
 */

export type ClipboardPayload =
  | { kind: "layers"; nodes: DesignNode[] }
  | { kind: "designs"; designs: ContainerSpec[] }
  | { kind: "notes"; notes: NoteSpec[] }

export interface ClipboardEnvelope {
  parity: "clipboard"
  version: 1
  /** The project it was copied from, so a paste there can sit next to the original. */
  project: string
  payload: ClipboardPayload
}

/** A copy from the project at `project`, its root, and the text that goes on the system clipboard for it. */
export function writeEnvelope(
  project: string,
  payload: ClipboardPayload
): { text: string; envelope: ClipboardEnvelope } {
  const envelope: ClipboardEnvelope = { parity: "clipboard", version: 1, project, payload }
  return { text: JSON.stringify(envelope), envelope }
}

/** Parity's own copy, read back from the clipboard's text. Undefined for anything else. */
export function readEnvelope(text: string): ClipboardEnvelope | undefined {
  if (!text.startsWith('{"parity":"clipboard"')) return undefined
  try {
    const value: unknown = JSON.parse(text)
    return isEnvelope(value) ? value : undefined
  } catch {
    return undefined
  }
}

const payloadKinds = new Set(["layers", "designs", "notes"])

function isEnvelope(value: unknown): value is ClipboardEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "parity" in value &&
    value.parity === "clipboard" &&
    "version" in value &&
    value.version === 1 &&
    "project" in value &&
    typeof value.project === "string" &&
    "payload" in value &&
    typeof value.payload === "object" &&
    value.payload !== null &&
    "kind" in value.payload &&
    typeof value.payload.kind === "string" &&
    payloadKinds.has(value.payload.kind)
  )
}

/** SVG markup, as icon sites and design tools copy it, which pastes as a picture rather than as its source. */
export function isSvgMarkup(text: string): boolean {
  const plain = text.trim()
  return /^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(plain) && plain.endsWith("</svg>")
}

/** Text from outside the app, as a layer to paste. */
export function textLayer(text: string): DesignNode {
  return { type: "text", id: "pasted", text }
}

/** A copy of the layers `ids`, the outermost of them, each with everything in it as `state` shows them. */
export function copyLayers(
  container: ContainerSpec,
  ids: Iterable<string>,
  state: StateSpec | undefined
): ClipboardPayload | undefined {
  const nodes = topmostNodes(container.root, ids).map((node) => asShown(node, state))
  return nodes.length > 0 ? { kind: "layers", nodes } : undefined
}

/** A node and everything in it as a state shows them. */
function asShown(node: DesignNode, state: StateSpec | undefined): DesignNode {
  const shown = nodeInState(node, state)
  if (shown.type === "layout") return { ...shown, children: shown.children.map((child) => asShown(child, state)) }
  if (shown.type === "component" && shown.slots) {
    const slots = Object.fromEntries(
      childEntries(shown).map(({ slot, nodes }) => [slot!, nodes.map((child) => asShown(child, state))])
    )
    return { ...shown, slots }
  }
  return shown
}

/** Where pasted layers go in a design: the layout they go into, and their index and slot there, or last when unset. */
export interface PasteTarget {
  parent: string
  index?: number
  slot?: string
}

/**
 * Where pasted layers go: into the selected layout when it's the only layer selected, else just after the selected
 * layers, else into the design's root. Undefined when there's nowhere, as when the root isn't a layout.
 */
export function pasteTarget(
  container: ContainerSpec,
  selection: { node?: string; nodes: readonly string[] }
): PasteTarget | undefined {
  const { root } = container
  const layers = topmostNodes(root, selection.nodes)
  const primary = selection.node ? findNode(root, selection.node) : undefined
  if (primary?.type === "layout" && layers.length === 1) return { parent: primary.id }
  const last = layers.at(-1) && locateNode(root, layers.at(-1)!.id)
  const parent = last?.ancestors.at(-1)
  if (last && parent) return { parent: parent.id, index: last.index + 1, slot: last.slot }
  if (root.type === "layout") return { parent: root.id }
  return undefined
}

/** Pastes copies of `nodes`, with fresh ids, at `target`, in order. Returns the design and the copies' ids. */
export function pasteLayers(
  container: ContainerSpec,
  target: PasteTarget,
  nodes: readonly DesignNode[]
): { container: ContainerSpec; copies: string[] } {
  const taken = nodeIds(container.root)
  const copies = nodes.map((node) => withFreshIds(node, taken))
  let root = container.root
  for (const [offset, copy] of copies.entries()) {
    root = insertNode(root, target.parent, copy, {
      index: target.index === undefined ? undefined : target.index + offset,
      slot: target.slot
    })
  }
  return { container: { ...container, root }, copies: copies.map((copy) => copy.id) }
}

/**
 * Layers pasted with nothing to paste them into: a new screen called Pasted, with its top left `at`, that lays them out
 * in a padded column. Its id isn't one of `taken`, the designs' ids, and its layers get fresh ids.
 */
export function designOfLayers(
  nodes: readonly DesignNode[],
  taken: Iterable<string>,
  at: { x: number; y: number }
): ContainerSpec {
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  return {
    id: uniqueId("Pasted", taken),
    name: "Pasted",
    position: at,
    root: {
      type: "layout",
      id: rootId,
      style: { padding: 6, gap: 4 },
      children: nodes.map((node) => withFreshIds(node, ids))
    },
    states: [{ id: "default", name: "Default" }]
  }
}

/**
 * Copies of `designs` moved by `shift` and rounded to whole pixels. Each keeps its id unless `taken`, or a copy before
 * it, has it, when it gets one from its name.
 */
export function copyDesigns(
  designs: readonly ContainerSpec[],
  taken: Iterable<string>,
  shift: { x: number; y: number }
): ContainerSpec[] {
  const ids = [...taken]
  return designs.map((design) => {
    const id = uniqueId(design.name, ids)
    ids.push(id)
    return {
      ...design,
      id,
      position: { x: Math.round(design.position.x + shift.x), y: Math.round(design.position.y + shift.y) }
    }
  })
}

/**
 * Copies of `notes` with fresh ids, not one of `taken`, sitting as they sat together: with their top left `at`, or a
 * little below and right of where they were copied from.
 */
export function copyNotes(
  notes: readonly NoteSpec[],
  taken: Iterable<string>,
  at?: { x: number; y: number }
): NoteSpec[] {
  const ids = new Set(taken)
  const left = Math.min(...notes.map((note) => note.position.x))
  const top = Math.min(...notes.map((note) => note.position.y))
  const shift = at ? { x: at.x - left, y: at.y - top } : { x: 24, y: 24 }
  return notes.map((note) => {
    const id = `note-${generateId(ids)}`
    ids.add(id)
    return { ...note, id, position: { x: note.position.x + shift.x, y: note.position.y + shift.y } }
  })
}

/** The look of the layer `id` as `state` shows it, to paste onto other layers. */
export function styleOf(container: ContainerSpec, id: string, state: StateSpec): NodeStyle | undefined {
  const node = findNode(container.root, id)
  return node ? { ...nodeInState(node, state).style } : undefined
}

/** Gives each of the layers `ids` the copied `style` in `state`, in place of its own. */
export function applyStyle(
  container: ContainerSpec,
  ids: readonly string[],
  state: StateSpec,
  style: NodeStyle
): ContainerSpec {
  let next = container
  for (const id of ids) {
    const node = findNode(next.root, id)
    if (!node) continue
    const cleared = Object.fromEntries(Object.keys(nodeInState(node, state).style ?? {}).map((key) => [key, undefined]))
    next = editNode(next, boardTarget(next, state.id), id, { style: { ...cleared, ...style } })
  }
  return next
}

/**
 * The components the layers name that aren't among `known`, such as layers from another project. None when nothing is
 * known yet.
 */
export function missingComponents(nodes: readonly DesignNode[], known: Record<string, unknown>): string[] {
  if (Object.keys(known).length === 0) return []
  const missing = new Set<string>()
  const visit = (node: DesignNode) => {
    if (node.type === "component" && !(node.component in known)) missing.add(node.component)
    for (const { nodes: children } of childEntries(node)) children.forEach(visit)
  }
  nodes.forEach(visit)
  return [...missing]
}
