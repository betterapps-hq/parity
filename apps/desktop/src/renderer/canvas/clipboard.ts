import {
  boardTarget,
  type CanvasDocument,
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
import { toast } from "sonner"
import { editingState } from "../chrome/LayerPanel.tsx"
import { containerKey } from "../design-store.ts"
import { designsSelection, layersSelection, selectedDesigns, selectedNodes } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { shapeIdFor } from "./CanvasEditor.tsx"
import { freeSpotBeside, takenBounds } from "./free-space.ts"
import { nodeForItem } from "./insert.ts"
import { designsAt, placeOver, replaceLayers } from "./paste-over.ts"

/**
 * Copy and paste for layers, designs and text notes, through the system clipboard, so they paste into another
 * project or another Parity window too. What's copied is what the frame shows: a layer copied in a state other than
 * the base carries that state's changes. Pasted layers get fresh ids; pasted designs keep theirs unless taken.
 */

type Payload =
  | { kind: "layers"; nodes: DesignNode[] }
  | { kind: "designs"; designs: ContainerSpec[] }
  | { kind: "notes"; notes: NoteSpec[] }

interface Envelope {
  parity: "clipboard"
  version: 1
  /** The project it was copied from, so a paste there can sit next to the original. */
  project: string
  payload: Payload
}

/** The last copy from this window, in case the system clipboard can't be read back. */
let lastCopy: { text: string; envelope: Envelope } | undefined
/** Copy style and paste style use their own clipboard, inside the app. */
let copiedStyle: NodeStyle | undefined

/** Copies the selected layers, designs or note. Returns whether there was anything to copy. */
export async function copySelection(session: ProjectSession): Promise<boolean> {
  const payload = selectionPayload(session)
  if (!payload) return false
  const envelope: Envelope = { parity: "clipboard", version: 1, project: session.info.root, payload }
  const text = JSON.stringify(envelope)
  lastCopy = { text, envelope }
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    console.warn("The system clipboard couldn't be written; pasting works in this window only", error)
  }
  return true
}

/**
 * Pastes what's on the clipboard: Parity layers, designs or notes; an image or SVG, saved into the project; or plain
 * text as a text layer.
 */
export async function pasteClipboard(session: ProjectSession): Promise<void> {
  const content = await readClipboard()
  if (content.kind === "envelope") {
    const { envelope } = content
    const { payload } = envelope
    if (payload.kind === "layers") placeLayers(session, payload.nodes)
    else if (payload.kind === "designs") pasteDesigns(session, payload.designs, envelope.project === session.info.root)
    else pasteNotes(session, payload.notes)
    return
  }
  if (content.kind === "image") return pasteImage(session, content.blob, content.name)
  if (content.kind === "text") pasteText(session, content.text)
}

type ClipboardContent =
  | { kind: "envelope"; envelope: Envelope }
  | { kind: "image"; blob: Blob; name: string }
  | { kind: "text"; text: string }
  | { kind: "empty" }

/** What's on the system clipboard: Parity's own copy, an image or SVG markup, or plain text. */
async function readClipboard(): Promise<ClipboardContent> {
  let text = ""
  try {
    text = await navigator.clipboard.readText()
  } catch {
    text = lastCopy?.text ?? ""
  }
  const envelope = text === lastCopy?.text ? lastCopy.envelope : parseEnvelope(text)
  if (envelope) return { kind: "envelope", envelope }
  const image = await clipboardImage()
  if (image) return { kind: "image", blob: image, name: "pasted-image" }
  const plain = text.trim()
  // SVG markup, as icon sites and design tools copy it, pastes as a picture rather than as its source.
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(plain) && plain.endsWith("</svg>")) {
    return { kind: "image", blob: new Blob([plain], { type: "image/svg+xml" }), name: "pasted-vector" }
  }
  return plain ? { kind: "text", text: plain } : { kind: "empty" }
}

/**
 * Paste over selection (Ctrl+Shift+V), as Figma's: what's on the clipboard goes in the selection's place, on top of it,
 * and nothing is removed. Layers go just after the last selected layer, at its insets when it's placed absolutely;
 * copied designs go at the selected designs' position. One undo step, and the copies end up selected.
 */
export async function pasteOverSelection(session: ProjectSession): Promise<void> {
  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined
  const ids = selectedNodes(current)
  if (entry && ids.length > 0) {
    const nodes = await clipboardLayers(session, "Copy layers to paste them over layers")
    if (!nodes) return
    let copies: string[] = []
    const state = editingState(entry.container, current.state)
    store.updateContainer(
      entry.key,
      nodes.length === 1 ? "Paste over layer" : `Paste ${nodes.length} layers over`,
      (container) => {
        const placed = placeOver(container, ids, nodes, state)
        copies = placed.copies
        return placed.container
      }
    )
    if (copies.length === 0) {
      toast.info("Layers inside an instance can't be pasted over")
      return
    }
    selection.set(layersSelection(entry.key, copies, current))
    warnUnknown(nodes, session.components.get())
    return
  }
  const selected = selectedDesigns(current).flatMap((key) => store.getEntry(key) ?? [])
  if (selected.length === 0) return
  const content = await readClipboard()
  if (content.kind !== "envelope" || content.envelope.payload.kind !== "designs") {
    toast.info("Copy designs to paste them over designs")
    return
  }
  const at = {
    x: Math.min(...selected.map((design) => design.container.position.x)),
    y: Math.min(...selected.map((design) => design.container.position.y))
  }
  const copies = designsAt(
    content.envelope.payload.designs,
    store.getEntries().map((design) => design.container.id),
    at
  )
  const path = store.mainPath
  store.change(copies.length === 1 ? "Paste over design" : `Paste ${copies.length} designs over`, (snapshot) => {
    const document: CanvasDocument = snapshot.documents.get(path) ?? { version: 3, containers: [] }
    const next = { ...document, containers: [...document.containers, ...copies] }
    return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
  })
  selection.set(designsSelection(copies.map((copy) => containerKey(path, copy.id))))
}

/**
 * Paste to replace (Ctrl+Shift+R), as Figma's: what's on the clipboard replaces each selected layer, in its place, as
 * one undo step, and ends up selected. Parity's layers, an image or text replace layers; copied designs and notes don't.
 */
export async function pasteToReplace(session: ProjectSession): Promise<void> {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  const ids = selectedNodes(current)
  if (!entry || ids.length === 0) return
  const nodes = await clipboardLayers(session, "Copy layers to replace layers with them")
  if (!nodes) return
  let copies: string[] = []
  const state = editingState(entry.container, current.state)
  session.store.updateContainer(
    entry.key,
    ids.length === 1 ? "Paste to replace" : `Paste to replace ${ids.length} layers`,
    (container) => {
      const replaced = replaceLayers(container, ids, nodes, state)
      copies = replaced.copies
      return replaced.container
    }
  )
  if (copies.length === 0) {
    toast.info("Layers inside an instance can't be replaced")
    return
  }
  session.selection.set(layersSelection(entry.key, copies, current))
  warnUnknown(nodes, session.components.get())
}

/**
 * What's on the clipboard as layers to place: Parity's copied layers, an image saved into the project, or plain text as
 * a text layer. Undefined, with a message, when it's something else or nothing.
 */
async function clipboardLayers(session: ProjectSession, notLayers: string): Promise<DesignNode[] | undefined> {
  const content = await readClipboard()
  if (content.kind === "envelope") {
    if (content.envelope.payload.kind === "layers") return content.envelope.payload.nodes
    toast.info(notLayers)
    return undefined
  }
  if (content.kind === "text") return [{ type: "text", id: "pasted", text: content.text }]
  if (content.kind === "empty") {
    toast.info("There's nothing on the clipboard to paste")
    return undefined
  }
  const progress = toast.loading("Adding the image…")
  try {
    const node = await importImage(session, content.blob, content.name)
    toast.dismiss(progress)
    return [node]
  } catch (error) {
    toast.error("Couldn't paste the image", {
      id: progress,
      description: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}

/** An image on the system clipboard, such as a screenshot or an image copied from a browser. */
async function clipboardImage(): Promise<Blob | undefined> {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((candidate) => candidate.startsWith("image/"))
      if (type) return await item.getType(type)
    }
  } catch {
    // The clipboard can't always be read; then there's just no image to paste.
  }
  return undefined
}

/** Saves a pasted image into the project and places it like a pasted layer, at its own proportions. */
async function pasteImage(session: ProjectSession, blob: Blob, name: string): Promise<void> {
  const progress = toast.loading("Adding the image…")
  try {
    placeLayers(session, [await importImage(session, blob, name)], "Paste image")
    toast.dismiss(progress)
  } catch (error) {
    toast.error("Couldn't paste the image", {
      id: progress,
      description: error instanceof Error ? error.message : String(error)
    })
  }
}

/** Saves an image into the project, and gives the layer that shows it at its own proportions. */
async function importImage(session: ProjectSession, blob: Blob, name: string): Promise<DesignNode> {
  const [size, data] = await Promise.all([imageSize(blob), base64(blob)])
  const { src } = await window.canvasHost.request("images.import", {
    projectId: session.id,
    name,
    type: blob.type,
    data
  })
  return nodeForItem({ kind: "image", src, width: size.width, height: size.height }, undefined, new Set())
}

/** An image's natural size, in pixels; SVGs without one count as square. */
function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob)
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.onerror = () => reject(new Error("The clipboard's image couldn't be read"))
    image.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error ?? new Error("The image couldn't be read"))
    reader.readAsDataURL(blob)
  })
}

/** Copies the selected designs, placing the copies in the first free space to the right of the originals. */
export function duplicateDesigns(session: ProjectSession): boolean {
  const designs = selectedDesigns(session.selection.get()).flatMap((key) => {
    const entry = session.store.getEntry(key)
    return entry ? [structuredClone(entry.container)] : []
  })
  if (designs.length === 0) return false
  pasteDesigns(session, designs, true)
  return true
}

/** Copies the selected layer's look, to paste onto other layers. */
export function copyStyle(session: ProjectSession): boolean {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  const node = entry && current.node ? findNode(entry.container.root, current.node) : undefined
  if (!entry || !node) return false
  copiedStyle = { ...nodeInState(node, editingState(entry.container, current.state)).style }
  toast.success("Copied the style", { duration: 1500 })
  return true
}

/** Gives every selected layer the copied style, in place of its own. One undo step. */
export function pasteStyle(session: ProjectSession): void {
  const style = copiedStyle
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  const ids = selectedNodes(current)
  if (!style || !entry || ids.length === 0) {
    if (!style) toast.info("Copy a layer's style first, with Ctrl+Alt+C")
    return
  }
  const state = editingState(entry.container, current.state)
  session.store.updateContainer(
    entry.key,
    ids.length === 1 ? "Paste style" : `Paste style on ${ids.length} layers`,
    (container) => {
      let next = container
      for (const id of ids) {
        const node = findNode(next.root, id)
        if (!node) continue
        const cleared = Object.fromEntries(
          Object.keys(nodeInState(node, state).style ?? {}).map((key) => [key, undefined])
        )
        next = editNode(next, boardTarget(next, state.id), id, { style: { ...cleared, ...style } })
      }
      return next
    }
  )
}

function selectionPayload(session: ProjectSession): Payload | undefined {
  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined
  const layers = selectedNodes(current)
  if (entry && layers.length > 0) {
    const state = editingState(entry.container, current.state)
    const nodes = topmostNodes(entry.container.root, layers).map((node) => asShown(node, state))
    return nodes.length > 0 ? { kind: "layers", nodes } : undefined
  }
  const designs = selectedDesigns(current).flatMap((key) => {
    const found = store.getEntry(key)
    return found ? [structuredClone(found.container)] : []
  })
  if (designs.length > 0) return { kind: "designs", designs }
  const note = current.note ? store.getNotes().find((candidate) => candidate.key === current.note) : undefined
  return note ? { kind: "notes", notes: [structuredClone(note.note)] } : undefined
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

function parseEnvelope(text: string): Envelope | undefined {
  if (!text.startsWith('{"parity":"clipboard"')) return undefined
  try {
    const value = JSON.parse(text) as Envelope
    return value.parity === "clipboard" && value.version === 1 && value.payload ? value : undefined
  } catch {
    return undefined
  }
}

/** Where pasted layers go: into a selected layout, else after the selected layers, else into the design's root. */
function pasteTarget(
  session: ProjectSession
):
  | { key: string; parent: string; index?: number; slot?: string; frame: { mode?: string; state?: string } }
  | undefined {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  if (!entry) return undefined
  const { root } = entry.container
  const frame = { mode: current.mode, state: current.state }
  const layers = topmostNodes(root, selectedNodes(current))
  const primary = current.node ? findNode(root, current.node) : undefined
  if (primary?.type === "layout" && layers.length === 1) return { key: entry.key, parent: primary.id, frame }
  const last = layers.at(-1) && locateNode(root, layers.at(-1)!.id)
  const parent = last?.ancestors.at(-1)
  if (last && parent) return { key: entry.key, parent: parent.id, index: last.index + 1, slot: last.slot, frame }
  if (root.type === "layout") return { key: entry.key, parent: root.id, frame }
  return undefined
}

/**
 * Puts layers where a paste would: into a selected layout, after the selected layers, into the selected design, or
 * into a new screen when nothing is selected. They get fresh ids, and end up selected. Returns where they went.
 */
export function placeLayers(
  session: ProjectSession,
  nodes: DesignNode[],
  label?: string
): { design: string; ids: string[]; frame: { mode?: string; state?: string } } | undefined {
  const { store, selection, components } = session
  const target = pasteTarget(session)
  if (!target) {
    pasteAsNewDesign(session, nodes)
    return undefined
  }
  const entry = store.getEntry(target.key)!
  const taken = nodeIds(entry.container.root)
  const copies = nodes.map((node) => withFreshIds(node, taken))
  store.updateContainer(
    entry.key,
    label ?? (copies.length === 1 ? "Paste layer" : `Paste ${copies.length} layers`),
    (container) => {
      let root = container.root
      for (const [offset, copy] of copies.entries()) {
        root = insertNode(root, target.parent, copy, {
          index: target.index === undefined ? undefined : target.index + offset,
          slot: target.slot
        })
      }
      return { ...container, root }
    }
  )
  selection.set(
    layersSelection(
      entry.key,
      copies.map((copy) => copy.id),
      target.frame
    )
  )
  warnUnknown(copies, components.get())
  return { design: entry.key, ids: copies.map((copy) => copy.id), frame: target.frame }
}

/** Layers pasted with nothing to paste them into become a new screen, in the middle of the view. */
function pasteAsNewDesign(session: ProjectSession, nodes: DesignNode[]): void {
  const { store, selection } = session
  const taken = new Set<string>()
  const rootId = generateId(taken)
  taken.add(rootId)
  const id = uniqueId(
    "Pasted",
    store.getEntries().map((entry) => entry.container.id)
  )
  const key = store.addContainer(
    store.mainPath,
    {
      id,
      name: "Pasted",
      position: viewCenter(session),
      root: {
        type: "layout",
        id: rootId,
        style: { padding: 6, gap: 4 },
        children: nodes.map((node) => withFreshIds(node, taken))
      },
      states: [{ id: "default", name: "Default" }]
    },
    "Paste layers"
  )
  selection.set({ design: key })
}

function pasteDesigns(session: ProjectSession, designs: ContainerSpec[], sameProject: boolean): void {
  const { store, selection, editor } = session
  const ids = store.getEntries().map((entry) => entry.container.id)
  // Pasted into the project they came from, they sit to the right of the originals, in the first free space along
  // their row; elsewhere, in the view.
  const bounds = designs.map((design) => {
    const original = sameProject ? store.getEntries().find((entry) => entry.container.id === design.id) : undefined
    const box = original ? editor?.getShapePageBounds(shapeIdFor(original.key)) : undefined
    return (
      box ?? {
        minX: design.position.x,
        maxX: design.position.x + 1280,
        minY: design.position.y,
        maxY: design.position.y + 800
      }
    )
  })
  const left = Math.min(...bounds.map((box) => box.minX))
  const right = Math.max(...bounds.map((box) => box.maxX))
  const top = Math.min(...bounds.map((box) => box.minY))
  const bottom = Math.max(...bounds.map((box) => box.maxY))
  const center = viewCenter(session)
  const spot = sameProject
    ? freeSpotBeside({ minX: left, minY: top, maxX: right, maxY: bottom }, editor ? takenBounds(editor) : bounds)
    : undefined
  const shift = spot ? { x: spot.x - left, y: 0 } : { x: center.x - left, y: center.y - top }
  const copies = designs.map((design) => {
    const id = uniqueId(design.name, ids)
    ids.push(id)
    return {
      ...design,
      id,
      position: { x: Math.round(design.position.x + shift.x), y: Math.round(design.position.y + shift.y) }
    }
  })
  const path = store.mainPath
  store.change(copies.length === 1 ? "Paste design" : `Paste ${copies.length} designs`, (snapshot) => {
    const document: CanvasDocument = snapshot.documents.get(path) ?? { version: 3, containers: [] }
    const next = { ...document, containers: [...document.containers, ...copies] }
    return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
  })
  selection.set(designsSelection(copies.map((copy) => containerKey(path, copy.id))))
}

function pasteNotes(session: ProjectSession, notes: NoteSpec[]): void {
  const { store, selection } = session
  const taken = new Set(store.getNotes().map((note) => note.note.id))
  const offset = 24
  let last: string | undefined
  for (const note of notes) {
    const id = `note-${generateId(taken)}`
    taken.add(id)
    last = store.addNote(store.mainPath, {
      ...note,
      id,
      position: { x: note.position.x + offset, y: note.position.y + offset }
    })
  }
  if (last) selection.set({ note: last })
}

/** Text from outside the app becomes a text layer where layers would paste, or a note on the canvas. */
function pasteText(session: ProjectSession, text: string): void {
  const target = pasteTarget(session)
  if (!target) {
    const { store, selection } = session
    const taken = new Set(store.getNotes().map((note) => note.note.id))
    const key = store.addNote(store.mainPath, { id: `note-${generateId(taken)}`, text, position: viewCenter(session) })
    selection.set({ note: key })
    return
  }
  placeLayers(session, [{ type: "text", id: "pasted", text }])
}

function viewCenter(session: ProjectSession): { x: number; y: number } {
  const bounds = session.editor?.getViewportPageBounds()
  return bounds ? { x: Math.round(bounds.midX), y: Math.round(bounds.midY) } : { x: 0, y: 0 }
}

/** Layers from another project can name components this one doesn't have; they paste, with a warning. */
function warnUnknown(nodes: DesignNode[], known: Record<string, unknown>): void {
  if (Object.keys(known).length === 0) return
  const missing = new Set<string>()
  const visit = (node: DesignNode) => {
    if (node.type === "component" && !(node.component in known)) missing.add(node.component)
    for (const { nodes: children } of childEntries(node)) children.forEach(visit)
  }
  nodes.forEach(visit)
  if (missing.size > 0) {
    toast.warning("Some components aren't in this project", { description: [...missing].join(", ") })
  }
}
