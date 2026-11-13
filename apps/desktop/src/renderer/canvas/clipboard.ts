import type { CanvasDocument, ContainerSpec, DesignNode, NodeStyle, NoteSpec } from "@parity-app/core"
import {
  applyStyle,
  type ClipboardEnvelope,
  type ClipboardPayload,
  copyDesigns,
  copyLayers,
  copyNotes,
  designsAt,
  isParityCopy,
  isSvgMarkup,
  decidePaste,
  kindsName,
  missingComponents,
  noLayoutHere,
  type PasteAction,
  type PasteAsk,
  type PasteContent,
  pastedPlacement,
  pasteHere,
  type PasteHow,
  pasteLayers,
  type PasteRefusal,
  pasteStepName,
  type PasteTarget,
  pasteTarget,
  placeOver,
  readEnvelope,
  replaceLayers,
  styleOf,
  textLayer,
  writeEnvelope,
  designsSelection,
  layersSelection,
  selectedDesigns,
  selectedNodes,
  type Selection,
  selectionToPasteOn
} from "@parity-app/editor"
import { toast } from "sonner"
import type { CopiedFile } from "../../shared/protocol.ts"
import type { Attributes } from "../chrome/event-attributes.ts"
import { shortcutOf } from "../chrome/keymap.ts"
import { type ContainerEntry, containerKey } from "../design-store.ts"
import { errorCode, reportError, track } from "../report-error.ts"
import { serviceCall } from "../service-call.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { canvasIdFor } from "./CanvasEditor.tsx"
import { addImageFiles } from "./drop-files.ts"
import { bringIntoView, bringIntoViewOnceSized, takenBounds } from "./free-space.ts"
import type { Point } from "./hit.ts"
import { importMedia } from "./import-media.ts"
import { addFrameOfLayers, addFrameOfText, viewCenter } from "./new-screen.ts"
import { placeAtPoint } from "./paste-here.ts"

/**
 * Copy and paste for layers, designs and text notes, through the system clipboard, so they paste into another
 * project or another Parity window too. What's copied is what the frame shows: a layer copied in a state other than
 * the base carries that state's changes, and the variants, viewport and bound values the frame shows. Pasted layers get fresh ids; pasted designs keep theirs unless taken. The rules
 * are `@parity-app/editor`'s; this reads and writes the system clipboard and applies them to the selection and the store.
 */

/** The last copy from this window, in case the system clipboard can't be read back. */
let lastCopy: { text: string; envelope: ClipboardEnvelope } | undefined

/** Copy style and paste style use their own clipboard, inside the app. */
let copiedStyle: NodeStyle | undefined

/** Copies the selected layers, designs or note. Returns whether there was anything to copy. */
export async function copySelection(session: ProjectDesigns & Pick<ProjectSession, "info">): Promise<boolean> {
  const payload = selectionPayload(session)

  if (!payload) {
    return false
  }

  lastCopy = writeEnvelope(session.info.root, payload)

  try {
    await navigator.clipboard.writeText(lastCopy.text)
  } catch (error) {
    console.warn("The system clipboard couldn't be written; pasting works in this window only", error)
  }

  return true
}

/**
 * Paste (Ctrl+V): Parity's layers go where layers paste in the selected design, or make a new screen in the view with
 * none; designs and notes go beside where they were copied from; an image or SVG is saved into the project and placed
 * as layers are; and plain text is a text layer, or a frame of text in the view with no design to go into. What it does
 * with each is `decidePaste`'s.
 */
export async function pasteClipboard(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor" | "id" | "info">
): Promise<void> {
  const content = await readClipboard()
  const ask: PasteAsk = { how: "paste", where: selectedPasteTarget(session) ? "design" : "canvas" }
  const kind = contentOf(content)
  const action = decidePaste(ask, kind)

  if (action.do === "nothing") {
    return refuse(ask.how, kind, action)
  }

  if (action.do === "designs" && isEnvelope(content, "designs")) {
    pasteDesigns(session, content.envelope.payload.designs, content.envelope.project === session.info.root)
    pasted(ask.how, "designs", content.envelope.payload.designs.length)

    return
  }

  if (action.do === "notes" && isEnvelope(content, "notes")) {
    pasteNotes(session, content.envelope.payload.notes)
    pasted(ask.how, "notes", content.envelope.payload.notes.length)

    return
  }

  if (action.do === "textFrame" && content.kind === "text") {
    addFrameOfText(session, content.text, viewCenter(session.editor), pasteStepName(ask.how, "text", []))
    pasted(ask.how, "text", 1)

    return
  }

  const layers = await clipboardLayers(session.id, ask.how, content)

  if (!layers) {
    return
  }

  const label = pasteStepName(ask.how, layers.content, layers.nodes)

  if (action.do === "screen") {
    pasteAsNewDesign(session, layers.nodes, viewCenter(session.editor), label)
    pasted(ask.how, layers.content, layers.nodes.length)

    return
  }

  // Saving an image takes a while; the layers go where a paste puts them by then.
  const place = placeLayers(session, layers.nodes, label)
  pasted(ask.how, layers.content, layers.nodes.length, place?.design)
}

/** What a read of the clipboard holds, as `decidePaste` and `clipboard.pasted` name it. */
function contentOf(content: ClipboardContent): PasteContent {
  if (content.kind === "envelope") {
    return content.envelope.payload.kind
  }

  if (content.kind === "image") {
    return content.blob.type === "image/svg+xml" ? "svg" : "image"
  }

  if (content.kind === "files") {
    return content.files.every(({ name }) => /\.(?:mp4|webm)$/i.test(name)) ? "video" : "image"
  }

  return content.kind
}

/** Whether the clipboard holds Parity's copy of `kind`. */
function isEnvelope<Kind extends ClipboardPayload["kind"]>(
  content: ClipboardContent,
  kind: Kind
): content is {
  kind: "envelope"
  envelope: ClipboardEnvelope & { payload: Extract<ClipboardPayload, { kind: Kind }> }
} {
  return content.kind === "envelope" && content.envelope.payload.kind === kind
}

/**
 * Records a paste that put something on the canvas (PAR-640), as `clipboard.pasted` and, as it's inserted too,
 * `insert.done`: into `design`, or as designs, notes or a frame of its own when there's none.
 */
function pasted(how: PasteHow, content: PasteContent, count: number, design?: string): void {
  track("clipboard.pasted", { how, content, count })

  if (content === "empty" || content === "unreadable") {
    return
  }

  const done: Attributes<"insert.done"> = {
    source: "paste",
    via: "clipboard",
    kind: content === "svg" ? "image" : content,
    count,
    newDesign: design === undefined && content !== "designs" && content !== "notes"
  }

  if (design) {
    done.design = design
  }

  track("insert.done", done)
}

/**
 * A paste that pastes nothing, as `decidePaste` says: its message as a toast, or as an error for an unreadable copy,
 * and recorded with why. One that wasn't available says and records nothing.
 */
function refuse(how: PasteHow, content: PasteContent, action: Extract<PasteAction, { do: "nothing" }>): void {
  if (!action.reason) {
    return
  }

  if (action.reason === "unreadable" && action.message) {
    reportError(action.message, { operation: "clipboard.read", title: action.message })
  } else if (action.message) {
    toast.info(action.message)
  }

  pasteFailed(how, content, action.reason)
}

/** Records a paste that pasted nothing, with why. */
function pasteFailed(
  how: PasteHow,
  content: PasteContent,
  reason: PasteRefusal | "instance" | "imageFailed",
  cause?: unknown
): void {
  const code = cause === undefined ? undefined : errorCode(cause)
  const failed: Attributes<"clipboard.failed"> = { how, content, reason }

  if (code) {
    failed.code = code
  }

  track("clipboard.failed", failed)
}

type ClipboardContent =
  | { kind: "envelope"; envelope: ClipboardEnvelope }
  | { kind: "image"; blob: Blob; name: string }
  /** A file copied in Explorer or Finder (PAR-841). */
  | { kind: "files"; files: CopiedFile[] }
  | { kind: "text"; text: string }
  | { kind: "unreadable" }
  | { kind: "empty" }

/**
 * What's on the system clipboard: Parity's own copy, a file copied in Explorer or Finder, an image or SVG markup, or
 * plain text. A Parity copy that can't be read, such as one from a newer version, is unreadable rather than text, so
 * its JSON never pastes as a text layer.
 */
async function readClipboard(): Promise<ClipboardContent> {
  let text = ""

  try {
    text = await navigator.clipboard.readText()
  } catch {
    text = lastCopy?.text ?? ""
  }

  const envelope = text === lastCopy?.text ? lastCopy.envelope : readEnvelope(text)

  if (envelope) {
    return { kind: "envelope", envelope }
  }

  if (isParityCopy(text)) {
    return { kind: "unreadable" }
  }

  // The system's clipboard can't be read in a story or a test without the app around it, which then holds no file.
  const files = await window.canvasHost.copiedFiles().catch(() => [])

  if (files.length > 0) {
    return { kind: "files", files }
  }

  const image = await clipboardImage()

  if (image) {
    return { kind: "image", blob: image, name: "pasted-image" }
  }

  const plain = text.trim()

  if (isSvgMarkup(plain)) {
    return { kind: "image", blob: new Blob([plain], { type: "image/svg+xml" }), name: "pasted-vector" }
  }

  return plain ? { kind: "text", text: plain } : { kind: "empty" }
}

/**
 * Paste over selection (Ctrl+Shift+V), as Figma's: what's on the clipboard goes in the selection's place, on top of it,
 * and nothing is removed. Layers go just after the last selected layer, at its insets when it's placed absolutely;
 * copied designs go at the selected designs' position. One undo step, and the copies end up selected.
 */
export async function pasteOverSelection(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "id">
): Promise<void> {
  const { store, selection } = session
  const asked = selection.get()
  const selected = selectedDesigns(asked).flatMap((key) => store.getEntry(key) ?? [])
  let where: "layers" | "designs" | "nothing" = "nothing"

  if (layersSelected(session, asked)) {
    where = "layers"
  } else if (selected.length > 0) {
    where = "designs"
  }

  const ask: PasteAsk = { how: "over", where }

  if (ask.where === "nothing") {
    return
  }

  const content = await readClipboard()
  const kind = contentOf(content)
  const action = decidePaste(ask, kind)

  if (action.do === "nothing") {
    return refuse(ask.how, kind, action)
  }

  if (action.do === "designs" && isEnvelope(content, "designs")) {
    const at = {
      x: Math.min(...selected.map((design) => design.container.position.x)),
      y: Math.min(...selected.map((design) => design.container.position.y))
    }

    const copies = designsAt(
      content.envelope.payload.designs,
      store.getEntries().map((design) => design.container.id),
      at
    )

    const named = kindsName(copies.map((copy) => copy.kind))
    addDesigns(session, copies, copies.length === 1 ? `Paste over ${named}` : `Paste ${named} over`)
    pasted(ask.how, "designs", copies.length)

    return
  }

  const layers = await clipboardLayers(session.id, ask.how, content)

  if (!layers) {
    return
  }

  // Saving an image takes a while, so the selection is read again: the copies go over what's selected now.
  const current = selectionToPasteOn("over", asked, selection.get())
  const frame = current && store.editFrame(current)

  if (!current || !frame) {
    toast.info("No layers are selected, so nothing was pasted")
    pasteFailed(ask.how, layers.content, "noTarget")

    return
  }

  const ids = selectedNodes(current)
  const { nodes } = layers
  let copies: string[] = []
  store.updateContainer(
    frame.design,
    nodes.length === 1 ? "Paste over layer" : `Paste ${nodes.length} layers over`,
    (container) => {
      const placed = placeOver(container, ids, nodes, frame.state, frame.viewport)
      copies = placed.copies

      return placed.container
    }
  )

  if (copies.length === 0) {
    toast.info("Layers inside an instance can't be pasted over")
    pasteFailed(ask.how, layers.content, "instance")

    return
  }

  selection.set(layersSelection(frame.design, copies, current))
  warnUnknown(nodes, session.components.get())
  pasted(ask.how, layers.content, copies.length, frame.design)
}

/**
 * Paste to replace (Ctrl+Shift+R), as Figma's: what's on the clipboard replaces each selected layer, in its place, as
 * one undo step, and ends up selected. Parity's layers, an image or text replace layers; copied designs and notes don't.
 */
export async function pasteToReplace(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "id">
): Promise<void> {
  const asked = session.selection.get()
  const ask: PasteAsk = { how: "replace", where: layersSelected(session, asked) ? "layers" : "nothing" }

  if (ask.where === "nothing") {
    return
  }

  const content = await readClipboard()
  const kind = contentOf(content)
  const action = decidePaste(ask, kind)

  if (action.do === "nothing") {
    return refuse(ask.how, kind, action)
  }

  const layers = await clipboardLayers(session.id, ask.how, content)

  if (!layers) {
    return
  }

  // Saving an image takes a while, and replacing removes layers, so it only replaces what was selected when asked.
  const current = selectionToPasteOn("replace", asked, session.selection.get())
  const frame = current && session.store.editFrame(current)

  if (!current || !frame) {
    toast.info("The selection changed, so nothing was replaced")
    pasteFailed(ask.how, layers.content, "noTarget")

    return
  }

  const ids = selectedNodes(current)
  const { nodes } = layers
  let copies: string[] = []
  session.store.updateContainer(
    frame.design,
    ids.length === 1 ? "Paste to replace" : `Paste to replace ${ids.length} layers`,
    (container) => {
      const replaced = replaceLayers(container, ids, nodes, frame.state, frame.viewport)
      copies = replaced.copies

      return replaced.container
    }
  )

  if (copies.length === 0) {
    toast.info("Layers inside an instance can't be replaced")
    pasteFailed(ask.how, layers.content, "instance")

    return
  }

  session.selection.set(layersSelection(frame.design, copies, current))
  warnUnknown(nodes, session.components.get())
  pasted(ask.how, layers.content, copies.length, frame.design)
}

/**
 * Paste here, from the canvas's right-click menu: what's on the clipboard goes where the pointer was (client
 * coordinates), whatever's selected. Copied designs go there on the canvas, their top left at the pointer, sitting as
 * they sat together, as do copied notes. Layers, text and images go into the layout or component's slot under the
 * pointer, in the frame there, at the place under it, or at the pointer when the layout is absolutely placed (see
 * `placeAtPoint` and `pasteHere`). Over no design, text makes a text frame there and layers a frame of them there.
 * One undo step, and the copies end up selected.
 */
export async function pasteAtPointer(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor" | "id" | "tokens">,
  point: Point
): Promise<void> {
  const { store, selection, editor } = session

  if (!editor) {
    return
  }

  const page = editor.screenToPage(point)
  const at = { x: Math.round(page.x), y: Math.round(page.y) }
  const area = editor.getContainer().closest(".canvas-area") ?? document
  // Measured before the clipboard is read, which can wait on an image being saved.
  const place = placeAtPoint(session, area, point)
  const ask: PasteAsk = { how: "here", where: place.kind === "none" ? "noLayout" : place.kind }
  const content = await readClipboard()
  const kind = contentOf(content)
  const action = decidePaste(ask, kind)

  if (action.do === "nothing") {
    return refuse(ask.how, kind, action)
  }

  if (action.do === "designs" && isEnvelope(content, "designs")) {
    const copies = designsAt(
      content.envelope.payload.designs,
      store.getEntries().map((design) => design.container.id),
      at
    )

    addDesigns(session, copies, `Paste ${kindsName(copies.map((copy) => copy.kind))} here`)
    pasted(ask.how, "designs", copies.length)

    return
  }

  if (action.do === "notes" && isEnvelope(content, "notes")) {
    pasteNotes(session, content.envelope.payload.notes, at)
    pasted(ask.how, "notes", content.envelope.payload.notes.length)

    return
  }

  if (action.do === "textFrame" && content.kind === "text") {
    addFrameOfText(session, content.text, at, pasteStepName(ask.how, "text", []))
    pasted(ask.how, "text", 1)

    return
  }

  const layers = await clipboardLayers(session.id, ask.how, content)

  if (!layers) {
    return
  }

  const { nodes } = layers
  const label = pasteStepName(ask.how, layers.content, nodes)

  if (action.do === "screen" || place.kind !== "layout") {
    pasteAsNewDesign(session, nodes, at, label)
    pasted(ask.how, layers.content, nodes.length)

    return
  }

  const { hit, here, frame } = place
  let copies: string[] = []
  store.updateContainer(frame.design, label, (container) => {
    const placed = pasteHere(container, nodes, here, frame.state, frame.viewport)
    copies = placed.copies

    return placed.container
  })

  // The design or its layout can go while the clipboard is read, leaving nowhere to paste.
  if (copies.length === 0) {
    toast.info(noLayoutHere)
    pasteFailed(ask.how, layers.content, "noTarget")

    return
  }

  selection.set(layersSelection(frame.design, copies, hit))
  warnUnknown(nodes, session.components.get())
  pasted(ask.how, layers.content, copies.length, frame.design)
}

/** Whether `selection` has layers in a frame being edited, for Paste over and Paste to replace to paste on. */
function layersSelected(session: ProjectDesigns, selection: Selection): boolean {
  return Boolean(session.store.editFrame(selection)) && selectedNodes(selection).length > 0
}

/** Adds copied designs to the canvas as one undo step, `label`, and selects them. */
function addDesigns(session: ProjectDesigns, copies: ContainerSpec[], label: string): void {
  const { store, selection } = session
  const path = store.mainPath
  store.change(label, (snapshot) => {
    const document: CanvasDocument = snapshot.documents.get(path) ?? { version: 4, containers: [] }
    const next = { ...document, containers: [...document.containers, ...copies] }

    return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
  })
  selection.set(designsSelection(copies.map((copy) => containerKey(path, copy.id))))
}

/**
 * What's on the clipboard as layers to place, once `decidePaste` says it pastes as layers: Parity's copied layers, an
 * image or video saved into the project, or plain text as a text layer, with what it was. Undefined when saving the
 * image failed, which is said and recorded as a paste `how` that failed.
 */
async function clipboardLayers(
  projectId: string,
  how: PasteHow,
  content: ClipboardContent
): Promise<{ nodes: DesignNode[]; content: PasteContent } | undefined> {
  const kind = contentOf(content)

  if (isEnvelope(content, "layers")) {
    return { nodes: content.envelope.payload.nodes, content: kind }
  }

  if (content.kind === "text") {
    return { nodes: [textLayer(content.text)], content: kind }
  }

  if (content.kind === "files") {
    const nodes = await savedFiles(projectId, content)

    if (nodes.length === 0) {
      pasteFailed(how, kind, "imageFailed")

      return undefined
    }

    return { nodes, content: kind }
  }

  if (content.kind !== "image") {
    // `decidePaste` never places anything else as layers.
    return undefined
  }

  const node = await serviceCall({
    progress: "Adding the image…",
    run: () => importMedia(projectId, content.blob, content.name),
    done: () => "dismiss",
    failed: {
      operation: "images.import",
      title: "Couldn't paste the image",
      track: (error) => pasteFailed(how, kind, "imageFailed", error)
    }
  })

  return node ? { nodes: [node], content: kind } : undefined
}

/** An image on the system clipboard, such as a screenshot or an image copied from a browser. */
async function clipboardImage(): Promise<Blob | undefined> {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((candidate) => candidate.startsWith("image/"))

      if (type) {
        return await item.getType(type)
      }
    }
  } catch {
    // The clipboard can't always be read; then there's just no image to paste.
  }

  return undefined
}

/**
 * Saves a file copied in Explorer or Finder into the project, as dropping it would, and gives the layer that shows it.
 * One that isn't an image or video Parity takes, or is too large, is named in a message, as a dropped one is.
 */
async function savedFiles(projectId: string, content: ClipboardContent & { kind: "files" }): Promise<DesignNode[]> {
  const described = content.files.map(({ name, size }) => ({ name, type: "", size }))
  const files = content.files.map(({ name, data }) => new File(data ? [new Uint8Array(data)] : [], name))
  const saved = await addImageFiles(projectId, files, described)

  return saved.map(({ node }) => node)
}

/** Copies the selected designs, placing the copies in the first free space to the right of the originals. */
export function duplicateDesigns(session: ProjectDesigns & Pick<ProjectSession, "editor">): boolean {
  const designs = selectedDesigns(session.selection.get()).flatMap((key) => {
    const entry = session.store.getEntry(key)

    return entry ? [structuredClone(entry.container)] : []
  })

  if (designs.length === 0) {
    return false
  }

  pasteDesigns(session, designs, true)

  return true
}

/** Copies the selected layer's look, to paste onto other layers. */
export function copyStyle(session: ProjectDesigns): boolean {
  const current = session.selection.get()
  const frame = session.store.editFrame(current)
  const style = frame && current.node ? styleOf(frame.container, current.node, frame.state, frame.viewport) : undefined

  if (!style) {
    return false
  }

  copiedStyle = style
  toast.success("Copied the style", { duration: 1500 })

  return true
}

/** Gives every selected layer the copied style, in place of its own. One undo step. */
export function pasteStyle(session: ProjectDesigns): void {
  const style = copiedStyle
  const current = session.selection.get()
  const frame = session.store.editFrame(current)
  const ids = selectedNodes(current)

  if (!style || !frame || ids.length === 0) {
    if (!style) {
      toast.info(`Copy a layer's style first, with ${shortcutOf("copyStyle")}`)
    }

    return
  }

  session.store.updateContainer(
    frame.design,
    ids.length === 1 ? "Paste style" : `Paste style on ${ids.length} layers`,
    (container) => applyStyle(container, ids, frame.state, style, frame.viewport)
  )
}

function selectionPayload(session: ProjectDesigns): ClipboardPayload | undefined {
  const { store, selection } = session
  const current = selection.get()
  const frame = store.editFrame(current)
  const layers = selectedNodes(current)

  if (frame && layers.length > 0) {
    return copyLayers(frame.container, layers, frame.state, frame.viewport)
  }

  const designs = selectedDesigns(current).flatMap((key) => {
    const found = store.getEntry(key)

    return found ? [structuredClone(found.container)] : []
  })

  if (designs.length > 0) {
    return { kind: "designs", designs }
  }

  const note = current.note ? store.getNotes().find((candidate) => candidate.key === current.note) : undefined

  return note ? { kind: "notes", notes: [structuredClone(note.note)] } : undefined
}

/** Where layers would paste: into a selected layout, after the selected layers, or into the selected design's root. */
function selectedPasteTarget(
  session: ProjectDesigns
): { entry: ContainerEntry; target: PasteTarget; frame: { mode?: string; state?: string } } | undefined {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  const target = entry && pasteTarget(entry.container, { node: current.node, nodes: selectedNodes(current) })

  return entry && target ? { entry, target, frame: { mode: current.mode, state: current.state } } : undefined
}

/**
 * Puts layers where a paste would: into a selected layout, after the selected layers, into the selected design, or
 * into a new frame when nothing is selected. They get fresh ids, and end up selected. Returns where they went.
 */
export function placeLayers(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor">,
  nodes: DesignNode[],
  label?: string
): { design: string; ids: string[]; frame: { mode?: string; state?: string } } | undefined {
  const { store, selection, components } = session
  const place = selectedPasteTarget(session)

  if (!place) {
    pasteAsNewDesign(session, nodes, undefined, label)

    return undefined
  }

  const { entry, target, frame } = place
  let copies: string[] = []
  store.updateContainer(
    entry.key,
    label ?? (nodes.length === 1 ? "Paste layer" : `Paste ${nodes.length} layers`),
    (container) => {
      const pasted = pasteLayers(container, target, nodes)
      copies = pasted.copies

      return pasted.container
    }
  )
  selection.set(layersSelection(entry.key, copies, frame))
  warnUnknown(nodes, components.get())

  return { design: entry.key, ids: copies, frame }
}

/**
 * Layers pasted with nothing to paste them into land on the canvas, so they make a new frame named after them, in the
 * middle of the view unless placed `at` (PAR-546), with a warning when they name components the project doesn't have.
 */
function pasteAsNewDesign(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor">,
  nodes: DesignNode[],
  at = viewCenter(session.editor),
  label?: string
): void {
  addFrameOfLayers(session, nodes, at, label ?? (nodes.length === 1 ? "Paste layer" : `Paste ${nodes.length} layers`))
  warnUnknown(nodes, session.components.get())
}

function pasteDesigns(
  session: ProjectDesigns & Pick<ProjectSession, "editor">,
  designs: ContainerSpec[],
  sameProject: boolean
): void {
  const { store, selection, editor } = session
  const ids = store.getEntries().map((entry) => entry.container.id)

  // Pasted into the project they came from, they sit to the right of the originals, in the first free space along
  // their row; elsewhere, in the view (see `pastedPlacement`).
  const placed = designs.map((design) => {
    const original = sameProject ? store.getEntries().find((entry) => entry.container.id === design.id) : undefined
    const bounds = original ? editor?.getShapePageBounds(canvasIdFor(original.key)) : undefined

    return { position: design.position, bounds }
  })

  const { shift, shown } = pastedPlacement(placed, viewCenter(session.editor), editor ? takenBounds(editor) : [])
  const copies = copyDesigns(designs, ids, shift)
  const path = store.mainPath
  store.change(`Paste ${kindsName(copies.map((copy) => copy.kind))}`, (snapshot) => {
    const document: CanvasDocument = snapshot.documents.get(path) ?? { version: 4, containers: [] }
    const next = { ...document, containers: [...document.containers, ...copies] }

    return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
  })
  const keys = copies.map((copy) => containerKey(path, copy.id))
  selection.set(designsSelection(keys))

  // A copy that lands off screen, as a duplicate beside a wide design does, is brought into view (PAR-204), at the
  // size it's drawn at, which for a copy from elsewhere is known once its board has drawn it.
  if (!editor) {
    return
  }

  const boards = keys.map((key) => canvasIdFor(key))

  if (shown) {
    bringIntoView(editor, shown)
  } else {
    bringIntoViewOnceSized(editor, boards)
  }
}

/**
 * Notes pasted a little below and right of where they were copied from, or with their top left `at` a place on the
 * canvas, sitting as they sat together.
 */
function pasteNotes(session: ProjectDesigns, notes: NoteSpec[], at?: { x: number; y: number }): void {
  const { store, selection } = session
  const taken = store.getNotes().map((note) => note.note.id)
  let last: string | undefined

  for (const note of copyNotes(notes, taken, at)) {
    last = store.addNote(store.mainPath, note)
  }

  if (last) {
    selection.set({ note: last })
  }
}

/** Layers from another project can name components this one doesn't have; they paste, with a warning. */
function warnUnknown<Component>(nodes: DesignNode[], known: Readonly<Record<string, Component>>): void {
  const missing = missingComponents(nodes, known)

  if (missing.length > 0) {
    toast.warning("Some components aren't in this project", { description: missing.join(", ") })
  }
}
