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
  type NodeStyle,
  type NoteSpec,
  parseCanvasDocument,
  parseDesignNode,
  type StateSpec,
  topmostNodes,
  uniqueId,
  withFreshIds
} from "@parity-app/core"
import { boardReader } from "./shown.ts"

/**
 * The clipboard's rules: what a copy holds, how it's written as text so it pastes into another project or another
 * Parity window, where pasted layers go, the fresh ids they get, and copying and pasting style. What's copied is what
 * the frame shows: a layer copied in a state other than the base carries that state's changes, the variant options the
 * board shows, the frame's responsive patches and the values its bound params show. Pasted layers get fresh ids, and
 * keep a binding only where the design they go into has a param of that name; pasted designs keep their ids unless
 * taken. Reading and writing the system clipboard stays in the app.
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

/** Whether the clipboard's text is a Parity copy, readable or not, rather than text to paste as it is. */
export function isParityCopy(text: string): boolean {
  return text.startsWith('{"parity":"clipboard"')
}

/**
 * Parity's own copy, read back from the clipboard's text. Its layers, designs and notes are checked against the `.par`
 * schema, as a file's are, since they come from outside the app. Undefined for anything else.
 */
export function readEnvelope(text: string): ClipboardEnvelope | undefined {
  if (!isParityCopy(text)) return undefined
  try {
    const value: unknown = JSON.parse(text)
    if (
      typeof value !== "object" ||
      value === null ||
      !("parity" in value) ||
      value.parity !== "clipboard" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("project" in value) ||
      typeof value.project !== "string" ||
      !("payload" in value)
    ) {
      return undefined
    }
    const payload = parsePayload(value.payload)
    return payload ? { parity: "clipboard", version: 1, project: value.project, payload } : undefined
  } catch {
    // Not JSON, or a payload that doesn't match the schema.
    return undefined
  }
}

/**
 * A payload of a known kind, its list checked by core's parsers, which throw on anything that doesn't match. Parity
 * never copies an empty list, so one isn't a copy to paste.
 */
function parsePayload(value: unknown): ClipboardPayload | undefined {
  if (typeof value !== "object" || value === null || !("kind" in value)) return undefined
  if (value.kind === "layers" && "nodes" in value && isList(value.nodes)) {
    return { kind: "layers", nodes: value.nodes.map((node, index) => parseDesignNode(node, `/payload/nodes/${index}`)) }
  }
  if (value.kind === "designs" && "designs" in value && isList(value.designs)) {
    return { kind: "designs", designs: parseCanvasDocument({ version: 3, containers: value.designs }).containers }
  }
  if (value.kind === "notes" && "notes" in value && isList(value.notes)) {
    return { kind: "notes", notes: parseCanvasDocument({ version: 3, containers: [], notes: value.notes }).notes ?? [] }
  }
  return undefined
}

function isList(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0
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

/**
 * A copy of the layers `ids`, the outermost of them, each with everything in it as the board shows them in `state` and
 * `viewport` (see `asShown`).
 */
export function copyLayers(
  container: ContainerSpec,
  ids: Iterable<string>,
  state: StateSpec | undefined,
  viewport?: string
): ClipboardPayload | undefined {
  const nodes = topmostNodes(container.root, ids).map((node) => asShown(container, node, state, viewport))
  return nodes.length > 0 ? { kind: "layers", nodes } : undefined
}

/**
 * One of a design's nodes and everything in it as the board shows them in a state and viewport, for copying it or
 * moving it to another design: with the state's changes, the variant options shown, the viewport's responsive patches,
 * and each bound value as it shows. The bindings stay, for `fitBindings` to keep where the design they go into has the
 * param.
 */
export function asShown(
  container: ContainerSpec,
  node: DesignNode,
  state: StateSpec | undefined,
  viewport?: string
): DesignNode {
  const read = boardReader(container, { state, viewport })
  const shown = (layer: DesignNode): DesignNode => {
    const drawn = read(layer)
    if (drawn.type === "layout") return { ...drawn, children: drawn.children.map(shown) }
    if (drawn.type === "component" && drawn.slots) {
      const slots = Object.fromEntries(childEntries(drawn).map(({ slot, nodes }) => [slot!, nodes.map(shown)]))
      return { ...drawn, slots }
    }
    return drawn
  }
  return shown(node)
}

/**
 * A copied node and everything in it, bound only to params `destination` has: a binding to a param of the same name is
 * kept, so the layer follows that param there; any other is dropped, leaving the value it showed when it was copied.
 */
export function fitBindings(node: DesignNode, destination: ContainerSpec): DesignNode {
  const has = (param: string) => destination.params !== undefined && Object.hasOwn(destination.params, param)
  let next = node
  if (node.bind) {
    const { text, visible, props } = node.bind
    const keptProps = Object.fromEntries(Object.entries(props ?? {}).filter(([, param]) => has(param)))
    const bind = {
      ...(text !== undefined && has(text) ? { text } : {}),
      ...(visible !== undefined && has(visible) ? { visible } : {}),
      ...(Object.keys(keptProps).length > 0 ? { props: keptProps } : {})
    }
    next = { ...node }
    if (Object.keys(bind).length > 0) next.bind = bind
    else delete next.bind
  }
  if (next.type === "layout")
    return { ...next, children: next.children.map((child) => fitBindings(child, destination)) }
  if (next.type === "component" && next.slots) {
    const slots = Object.fromEntries(
      childEntries(next).map(({ slot, nodes }) => [slot!, nodes.map((child) => fitBindings(child, destination))])
    )
    return { ...next, slots }
  }
  return next
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

/**
 * Pastes copies of `nodes`, with fresh ids and the bindings the design has params for (see `fitBindings`), at
 * `target`, in order. Returns the design and the copies' ids.
 */
export function pasteLayers(
  container: ContainerSpec,
  target: PasteTarget,
  nodes: readonly DesignNode[]
): { container: ContainerSpec; copies: string[] } {
  const taken = nodeIds(container.root)
  const copies = nodes.map((node) => withFreshIds(fitBindings(node, container), taken))
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
 * in a padded column. Its id isn't one of `taken`, the designs' ids, and its layers get fresh ids. It has no params, so
 * the layers keep no bindings, only the values they showed.
 */
export function designOfLayers(
  nodes: readonly DesignNode[],
  taken: Iterable<string>,
  at: { x: number; y: number }
): ContainerSpec {
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  const design: ContainerSpec = {
    id: uniqueId("Pasted", taken),
    name: "Pasted",
    position: at,
    root: { type: "layout", id: rootId, style: { padding: 6, gap: 4 }, children: [] },
    states: [{ id: "default", name: "Default" }]
  }
  const children = nodes.map((node) => withFreshIds(fitBindings(node, design), ids))
  return { ...design, root: { type: "layout", id: rootId, style: { padding: 6, gap: 4 }, children } }
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
    const id = ids.includes(design.id) ? uniqueId(design.name, ids) : design.id
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

/**
 * The look of the layer `id` as the board shows it in `state` and `viewport`, with the variant options shown, to paste
 * onto other layers.
 */
export function styleOf(
  container: ContainerSpec,
  id: string,
  state: StateSpec,
  viewport?: string
): NodeStyle | undefined {
  const node = findNode(container.root, id)
  return node ? { ...boardReader(container, { state, viewport })(node).style } : undefined
}

/**
 * Gives each of the layers `ids` the copied `style` in `state`, in place of the one the board shows in `state` and
 * `viewport`.
 */
export function applyStyle(
  container: ContainerSpec,
  ids: readonly string[],
  state: StateSpec,
  style: NodeStyle,
  viewport?: string
): ContainerSpec {
  let next = container
  for (const id of ids) {
    const node = findNode(next.root, id)
    if (!node) continue
    const shown = boardReader(next, { state, viewport })(node).style ?? {}
    const cleared = Object.fromEntries(Object.keys(shown).map((key) => [key, undefined]))
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
