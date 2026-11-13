import type { DesignNode } from "@parity-app/core"
import { countMedia, mediaWords } from "./drop-files.ts"

/**
 * What a paste does, decided in one place for the four ways to paste (PAR-985): Paste (Ctrl+V and Edit > Paste), Paste
 * over selection (Ctrl+Shift+V), Paste to replace (Ctrl+Shift+R) and Paste here, from the canvas's right-click menu.
 * The app reads the clipboard and the selection, asks `decidePaste`, and carries out the answer.
 */

/** Which paste: Paste, Paste over selection, Paste to replace, or Paste here. */
export type PasteHow = "paste" | "over" | "replace" | "here"

/**
 * What's on the clipboard: Parity's copied layers, designs or notes; an image or SVG markup, or an image or video file
 * copied in Explorer or Finder; plain text; a Parity copy that can't be read; or nothing.
 */
export type PasteContent = "layers" | "designs" | "notes" | "image" | "svg" | "video" | "text" | "unreadable" | "empty"

/** Every kind of clipboard content, in the order `PasteContent` lists them. */
export const pasteContents: readonly PasteContent[] = [
  "layers",
  "designs",
  "notes",
  "image",
  "svg",
  "video",
  "text",
  "unreadable",
  "empty"
]

/**
 * A paste and where it would go, as that paste sees it.
 * - Paste puts layers into the selected `design` (see `pasteTarget`), or onto the `canvas` with no design to go into.
 * - Paste over selection goes over the selected `layers` or `designs`, or has `nothing` to go over.
 * - Paste to replace replaces the selected `layers`, or has `nothing` to replace.
 * - Paste here is over a `layout` or component's slot, over a design with `noLayout` under the pointer, or over the
 *   empty `canvas`.
 */
export type PasteAsk =
  | { how: "paste"; where: "design" | "canvas" }
  | { how: "over"; where: "layers" | "designs" | "nothing" }
  | { how: "replace"; where: "layers" | "nothing" }
  | { how: "here"; where: "layout" | "noLayout" | "canvas" }

/** Why a paste pasted nothing, as `clipboard.failed` records it. */
export type PasteRefusal = "empty" | "unreadable" | "wrongKind" | "noTarget"

/**
 * What to do with what's on the clipboard. Layers, images, videos and text become layers; an image or video is saved
 * into the project first, and text is a text layer.
 */
export type PasteAction =
  /**
   * Layers go into the selected design where Paste puts them (`selection`), over the selected layers (`over`), in
   * place of each selected layer (`replace`), or into the layout or slot under the pointer (`pointer`).
   */
  | { do: "layers"; at: "selection" | "over" | "replace" | "pointer" }
  /** Layers make a new screen of their own, in the middle of the view or at the pointer. */
  | { do: "screen"; at: "view" | "pointer" }
  /** Text makes a frame that hugs it, in the middle of the view or at the pointer, as the text tool does. */
  | { do: "textFrame"; at: "view" | "pointer" }
  /** Designs go beside the ones they were copied from, at the selected designs' corner, or at the pointer. */
  | { do: "designs"; at: "beside" | "selection" | "pointer" }
  /** Notes go a little below and right of where they were copied from, or at the pointer. */
  | { do: "notes"; at: "beside" | "pointer" }
  /**
   * Nothing is pasted. With a `reason` it's recorded, and `message` says why: as a toast, or, for an unreadable copy,
   * as an error. With no reason the paste wasn't available, as its menu item shows, so nothing is said or recorded.
   */
  | { do: "nothing"; reason?: PasteRefusal; message?: string }

/** What's said when the clipboard holds nothing. */
export const nothingToPaste = "There's nothing on the clipboard to paste"

/** What's said when the clipboard holds a Parity copy that can't be read, such as one from a newer version. */
export const unreadablePaste = "The copy on the clipboard couldn't be read, so nothing was pasted"

/** What's said when Paste here is over a design with no layout or slot under the pointer. */
export const noLayoutHere = "There's no layout here to paste into"

/** Clipboard content that pastes as layers: copied layers, a saved image or video, or text as a text layer. */
const asLayers = new Set<PasteContent>(["layers", "image", "svg", "video", "text"])

/** What `ask` does with `content` on the clipboard. */
export function decidePaste(ask: PasteAsk, content: PasteContent): PasteAction {
  // Paste over and Paste to replace need something selected to paste on, and their menu items say so beforehand.
  if (ask.where === "nothing") {
    return { do: "nothing" }
  }

  if (content === "empty") {
    return { do: "nothing", reason: "empty", message: nothingToPaste }
  }

  if (content === "unreadable") {
    return { do: "nothing", reason: "unreadable", message: unreadablePaste }
  }

  switch (ask.how) {
    case "paste":
      return paste(ask.where, content)
    case "over":
      return over(ask.where, content)
    case "replace":
      return asLayers.has(content)
        ? { do: "layers", at: "replace" }
        : { do: "nothing", reason: "wrongKind", message: "Copy layers to replace layers with them" }
    case "here":
      return here(ask.where, content)
  }
}

function paste(where: "design" | "canvas", content: PasteContent): PasteAction {
  if (content === "designs" || content === "notes") {
    return { do: content, at: "beside" }
  }

  if (where === "design") {
    return { do: "layers", at: "selection" }
  }

  return content === "text" ? { do: "textFrame", at: "view" } : { do: "screen", at: "view" }
}

function over(where: "layers" | "designs", content: PasteContent): PasteAction {
  if (where === "designs") {
    return content === "designs"
      ? { do: "designs", at: "selection" }
      : { do: "nothing", reason: "wrongKind", message: "Copy screens or components to paste them over the selection" }
  }

  return asLayers.has(content)
    ? { do: "layers", at: "over" }
    : { do: "nothing", reason: "wrongKind", message: "Copy layers to paste them over layers" }
}

function here(where: "layout" | "noLayout" | "canvas", content: PasteContent): PasteAction {
  if (content === "designs" || content === "notes") {
    return { do: content, at: "pointer" }
  }

  if (where === "noLayout") {
    return { do: "nothing", reason: "noTarget", message: noLayoutHere }
  }

  if (where === "layout") {
    return { do: "layers", at: "pointer" }
  }

  return content === "text" ? { do: "textFrame", at: "pointer" } : { do: "screen", at: "pointer" }
}

/**
 * What a paste's undo step is called when layers land, named for what was pasted: "Paste layer", "Paste 2 layers",
 * "Paste text", "Paste image", "Paste 3 files" for images and videos together, and with " here" after it for Paste here.
 * Paste over and Paste to replace name their own steps.
 */
export function pasteStepName(how: "paste" | "here", content: PasteContent, nodes: readonly DesignNode[]): string {
  return `Paste ${pastedWords(content, nodes)}${how === "here" ? " here" : ""}`
}

function pastedWords(content: PasteContent, nodes: readonly DesignNode[]): string {
  if (content === "text") {
    return "text"
  }

  if (content === "image" || content === "svg" || content === "video") {
    return mediaWords(countMedia(nodes.map((node) => (node.type === "video" ? "video" : "image")))).replace(/^the /, "")
  }

  return nodes.length === 1 ? "layer" : `${nodes.length} layers`
}
