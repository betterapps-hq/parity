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
  kindsName,
  countMedia,
  missingComponents,
  pastedPlacement,
  pasteLabel,
  pasteHere,
  pasteLayers,
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
  selectedNodes
} from "@parity-app/editor"
import { toast } from "sonner"
import type { CopiedFile } from "../../shared/protocol.ts"
import type { Attributes } from "../chrome/event-attributes.ts"
import { type ContainerEntry, containerKey } from "../design-store.ts"
import { errorCode, errorMessage, reportError, track } from "../report-error.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { canvasIdFor } from "./CanvasEditor.tsx"
import { addImageFiles, mediumOfNode } from "./drop-files.ts"
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
 * Pastes what's on the clipboard: Parity layers, designs or notes; an image or SVG, saved into the project; or plain
 * text as a text layer.
 */
export async function pasteClipboard(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor" | "id" | "info">
): Promise<void> {
  const content = await readClipboard()

  if (content.kind === "envelope") {
    const { envelope } = content
    const { payload } = envelope

    if (payload.kind === "layers") {
      const place = placeLayers(session, payload.nodes)
      pasted("paste", "layers", payload.nodes.length, place?.design)
    } else if (payload.kind === "designs") {
      pasteDesigns(session, payload.designs, envelope.project === session.info.root)
      pasted("paste", "designs", payload.designs.length)
    } else {
      pasteNotes(session, payload.notes)
      pasted("paste", "notes", payload.notes.length)
    }

    return
  }

  if (content.kind === "image") {
    return pasteImage(session, content)
  }

  if (content.kind === "files") {
    return pasteFiles(session, content)
  }

  if (content.kind === "text") {
    pasted("paste", "text", 1, pasteText(session, content.text))
  }

  if (content.kind === "unreadable") {
    reportError(unreadableCopy, { operation: "clipboard.read", title: unreadableCopy })
    pasteFailed("paste", "unreadable", "unreadable")
  }

  if (content.kind === "empty") {
    pasteFailed("paste", "empty", "empty")
  }
}

/** Which paste: Paste, Paste over selection, Paste to replace, or Paste here. */
type PasteHow = "paste" | "over" | "replace" | "here"

/** What was on the clipboard, as `clipboard.pasted` and `clipboard.failed` name it. */
type PastedContent = "layers" | "designs" | "notes" | "image" | "svg" | "video" | "text" | "empty" | "unreadable"

/** What a read of the clipboard holds, as `clipboard.pasted` names it. */
function contentOf(content: ClipboardContent): PastedContent {
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

/**
 * Records a paste that put something on the canvas (PAR-640), as `clipboard.pasted` and, as it's inserted too,
 * `insert.done`: into `design`, or as designs, notes or a frame of its own when there's none.
 */
function pasted(how: PasteHow, content: PastedContent, count: number, design?: string): void {
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

/** Records a paste that pasted nothing, with why. */
function pasteFailed(
  how: PasteHow,
  content: PastedContent,
  reason: "empty" | "unreadable" | "wrongKind" | "noTarget" | "instance" | "imageFailed",
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

const unreadableCopy = "The copy on the clipboard couldn't be read, so nothing was pasted"

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
  const current = selection.get()
  const frame = store.editFrame(current)
  const ids = selectedNodes(current)

  if (frame && ids.length > 0) {
    const layers = await clipboardLayers(session.id, "over", "Copy layers to paste them over layers")

    if (!layers) {
      return
    }

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
      pasteFailed("over", layers.content, "instance")

      return
    }

    selection.set(layersSelection(frame.design, copies, current))
    warnUnknown(nodes, session.components.get())
    pasted("over", layers.content, copies.length, frame.design)

    return
  }

  const selected = selectedDesigns(current).flatMap((key) => store.getEntry(key) ?? [])

  if (selected.length === 0) {
    return
  }

  const content = await readClipboard()

  if (content.kind === "unreadable") {
    reportError(unreadableCopy, { operation: "clipboard.read", title: unreadableCopy })
    pasteFailed("over", "unreadable", "unreadable")

    return
  }

  if (content.kind !== "envelope" || content.envelope.payload.kind !== "designs") {
    toast.info("Copy screens or components to paste them over the selection")
    pasteFailed("over", contentOf(content), content.kind === "empty" ? "empty" : "wrongKind")

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
  const named = kindsName(copies.map((copy) => copy.kind))
  store.change(copies.length === 1 ? `Paste over ${named}` : `Paste ${named} over`, (snapshot) => {
    const document: CanvasDocument = snapshot.documents.get(path) ?? { version: 4, containers: [] }
    const next = { ...document, containers: [...document.containers, ...copies] }

    return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
  })
  selection.set(designsSelection(copies.map((copy) => containerKey(path, copy.id))))
  pasted("over", "designs", copies.length)
}

/**
 * Paste to replace (Ctrl+Shift+R), as Figma's: what's on the clipboard replaces each selected layer, in its place, as
 * one undo step, and ends up selected. Parity's layers, an image or text replace layers; copied designs and notes don't.
 */
export async function pasteToReplace(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "id">
): Promise<void> {
  const current = session.selection.get()
  const frame = session.store.editFrame(current)
  const ids = selectedNodes(current)

  if (!frame || ids.length === 0) {
    return
  }

  const layers = await clipboardLayers(session.id, "replace", "Copy layers to replace layers with them")

  if (!layers) {
    return
  }

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
    pasteFailed("replace", layers.content, "instance")

    return
  }

  session.selection.set(layersSelection(frame.design, copies, current))
  warnUnknown(nodes, session.components.get())
  pasted("replace", layers.content, copies.length, frame.design)
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
  const content = await readClipboard()

  if (content.kind === "empty") {
    toast.info("There's nothing on the clipboard to paste")
    pasteFailed("here", "empty", "empty")

    return
  }

  if (content.kind === "unreadable") {
    reportError(unreadableCopy, { operation: "clipboard.read", title: unreadableCopy })
    pasteFailed("here", "unreadable", "unreadable")

    return
  }

  if (content.kind === "envelope" && content.envelope.payload.kind === "designs") {
    const copies = designsAt(
      content.envelope.payload.designs,
      store.getEntries().map((design) => design.container.id),
      at
    )

    const path = store.mainPath
    store.change(`Paste ${kindsName(copies.map((copy) => copy.kind))} here`, (snapshot) => {
      const document: CanvasDocument = snapshot.documents.get(path) ?? { version: 4, containers: [] }
      const next = { ...document, containers: [...document.containers, ...copies] }

      return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
    })
    selection.set(designsSelection(copies.map((copy) => containerKey(path, copy.id))))
    pasted("here", "designs", copies.length)

    return
  }

  if (content.kind === "envelope" && content.envelope.payload.kind === "notes") {
    pasteNotes(session, content.envelope.payload.notes, at)
    pasted("here", "notes", content.envelope.payload.notes.length)

    return
  }

  if (place.kind === "canvas" && content.kind === "text") {
    addFrameOfText(session, content.text, at, "Paste text")
    pasted("here", "text", 1)

    return
  }

  if (place.kind === "none") {
    toast.info("There's no layout here to paste into")
    pasteFailed("here", contentOf(content), "noTarget")

    return
  }

  const layers = await clipboardLayers(session.id, "here", "Copy layers to paste them here", content)

  if (!layers) {
    return
  }

  const { nodes } = layers

  if (place.kind === "canvas") {
    pasteAsNewDesign(session, nodes, at)
    pasted("here", layers.content, nodes.length)

    return
  }

  const { hit, here, frame } = place
  let copies: string[] = []
  store.updateContainer(
    frame.design,
    nodes.length === 1 ? "Paste layer here" : `Paste ${nodes.length} layers here`,
    (container) => {
      const placed = pasteHere(container, nodes, here, frame.state, frame.viewport)
      copies = placed.copies

      return placed.container
    }
  )
  selection.set(layersSelection(frame.design, copies, hit))
  warnUnknown(nodes, session.components.get())

  // The design or its layout can go while the clipboard is read, leaving nowhere to paste.
  if (copies.length === 0) {
    pasteFailed("here", layers.content, "noTarget")
  } else {
    pasted("here", layers.content, copies.length, frame.design)
  }
}

/**
 * What's on the clipboard as layers to place: Parity's copied layers, an image saved into the project, or plain text as
 * a text layer, with what it was. Undefined, with a message, when it's something else or nothing, which is recorded as
 * a paste `how` that failed. `read` is the clipboard already read.
 */
async function clipboardLayers(
  projectId: string,
  how: PasteHow,
  notLayers: string,
  read?: ClipboardContent
): Promise<{ nodes: DesignNode[]; content: PastedContent } | undefined> {
  const content = read ?? (await readClipboard())
  const kind = contentOf(content)

  if (content.kind === "envelope") {
    if (content.envelope.payload.kind === "layers") {
      return { nodes: content.envelope.payload.nodes, content: kind }
    }

    toast.info(notLayers)
    pasteFailed(how, kind, "wrongKind")

    return undefined
  }

  if (content.kind === "text") {
    return { nodes: [textLayer(content.text)], content: kind }
  }

  if (content.kind === "empty") {
    toast.info("There's nothing on the clipboard to paste")
    pasteFailed(how, kind, "empty")

    return undefined
  }

  if (content.kind === "unreadable") {
    reportError(unreadableCopy, { operation: "clipboard.read", title: unreadableCopy })
    pasteFailed(how, kind, "unreadable")

    return undefined
  }

  if (content.kind === "files") {
    const nodes = await savedFiles(projectId, content)

    if (nodes.length === 0) {
      pasteFailed(how, kind, "imageFailed")

      return undefined
    }

    return { nodes, content: kind }
  }

  const progress = toast.loading("Adding the image…")

  try {
    const node = await importMedia(projectId, content.blob, content.name)
    toast.dismiss(progress)

    return { nodes: [node], content: kind }
  } catch (error) {
    reportError(error, {
      operation: "images.import",
      title: "Couldn't paste the image",
      id: progress,
      description: errorMessage(error)
    })
    pasteFailed(how, kind, "imageFailed", error)

    return undefined
  }
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

/** Pastes a file copied in Explorer or Finder like a pasted layer, at its own proportions (PAR-841). */
async function pasteFiles(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor" | "id">,
  content: ClipboardContent & { kind: "files" }
): Promise<void> {
  const nodes = await savedFiles(session.id, content)

  if (nodes.length === 0) {
    pasteFailed("paste", contentOf(content), "imageFailed")

    return
  }

  const place = placeLayers(session, nodes, pasteLabel(countMedia(nodes.map(mediumOfNode))))
  pasted("paste", contentOf(content), nodes.length, place?.design)
}

/** Saves a pasted image into the project and places it like a pasted layer, at its own proportions. */
async function pasteImage(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor" | "id">,
  content: ClipboardContent & { kind: "image" }
): Promise<void> {
  const progress = toast.loading("Adding the image…")

  try {
    const place = placeLayers(session, [await importMedia(session.id, content.blob, content.name)], "Paste image")
    toast.dismiss(progress)
    pasted("paste", contentOf(content), 1, place?.design)
  } catch (error) {
    reportError(error, {
      operation: "images.import",
      title: "Couldn't paste the image",
      id: progress,
      description: errorMessage(error)
    })
    pasteFailed("paste", contentOf(content), "imageFailed", error)
  }
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
      toast.info("Copy a layer's style first, with Ctrl+Alt+C")
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
 * middle of the view unless placed `at` (PAR-546).
 */
function pasteAsNewDesign(
  session: ProjectDesigns & Pick<ProjectSession, "editor">,
  nodes: DesignNode[],
  at = viewCenter(session.editor),
  label?: string
): void {
  addFrameOfLayers(session, nodes, at, label ?? (nodes.length === 1 ? "Paste layer" : `Paste ${nodes.length} layers`))
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

/**
 * Text from outside the app becomes a text layer where layers would paste, or with nothing to paste into, a text frame
 * in the middle of the view, as the text tool makes one on the empty canvas. Returns the design it went into, unless it
 * made one.
 */
function pasteText(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor">,
  text: string
): string | undefined {
  if (!selectedPasteTarget(session)) {
    addFrameOfText(session, text, viewCenter(session.editor), "Paste text")

    return undefined
  }

  return placeLayers(session, [textLayer(text)])?.design
}

/** Layers from another project can name components this one doesn't have; they paste, with a warning. */
function warnUnknown<Component>(nodes: DesignNode[], known: Readonly<Record<string, Component>>): void {
  const missing = missingComponents(nodes, known)

  if (missing.length > 0) {
    toast.warning("Some components aren't in this project", { description: missing.join(", ") })
  }
}
