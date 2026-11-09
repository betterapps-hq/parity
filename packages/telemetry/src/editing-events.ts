import { z } from "zod"
import { defineEvent } from "./events.ts"

const sentBy = ["renderer"] as const

/**
 * The gestures the canvas records, by the names `canvas/gesture.ts` gives them: boards and notes moved on the canvas,
 * its pointer gestures' policies, a run of arrow presses on the canvas or of Up and Down in a field, an item dragged in
 * from the Assets panel, and the camera.
 */
export const gestureKinds = [
  "move",
  "resize",
  "layerDrag",
  "absoluteDrag",
  "titleDrag",
  "boxSelect",
  "frameDraw",
  "nudge",
  "fieldNudge",
  "insertDrag",
  "pan",
  "zoom"
] as const

/**
 * How a gesture ended. A pointer gesture: released, Escape, or interrupted by the pointer being cancelled or the window
 * losing focus. An item dragged in: dropped (`release`) or `cancelled`, dropped nowhere or with Escape. The camera:
 * `settled`, once it has stopped. A run of presses: `selection`, when the selection changed, or `ended`.
 */
export const gestureEnds = ["release", "escape", "interrupted", "cancelled", "settled", "selection", "ended"] as const

const designKeys = z.array(z.string()).describe("Designs, by key: the file and the design's id, `app.par#home`")
const layerIds = z.array(z.string()).describe("Layers, by id, or by path inside an instance (`card/title`)")

/** What changed in an undo or redo step. */
const stepAttributes = z.object({
  step: z.string().describe("The step's label, as Edit > Undo names it: `Move frame`, `Change padding`"),
  designs: designKeys.describe("The designs it changed, by key"),
  files: z.array(z.string()).describe("The files it changed, which are written again"),
  modes: z.boolean().describe("Whether it changed the project's modes"),
  tokens: z.boolean().describe("Whether it changed token values")
})

/** How something was pasted: Paste, Paste over selection, Paste to replace, or Paste here at the pointer. */
const pasteHow = z
  .enum(["paste", "over", "replace", "here"])
  .describe("Which paste: Paste, Paste over selection, Paste to replace, or Paste here")

/** What was on the clipboard. */
const clipboardContent = z
  .enum(["layers", "designs", "notes", "image", "svg", "text", "empty", "unreadable"])
  .describe(
    "What was on the clipboard: Parity's layers, designs or notes, an image, SVG markup, text, nothing, or a copy that can't be read"
  )

/**
 * Editing on the canvas and in the inspector (PAR-640): gestures, undo and redo, inspector fields, inserts, pastes and
 * text edited in place. Each is recorded once, when it's done, never per pointer move or per frame.
 */
export const editingEvents = [
  defineEvent(
    "gesture.ended",
    z.object({
      kind: z.enum(gestureKinds).describe("The gesture, as `canvas/gesture.ts` names it"),
      how: z.enum(gestureEnds).describe("How it ended"),
      kept: z.boolean().describe("Whether what it did stands, rather than being taken back or called off"),
      durationMs: z.number().describe("From when it began to when it ended, in milliseconds"),
      designs: designKeys.optional().describe("The designs it moved or changed, by key"),
      layers: layerIds.optional().describe("The layers it moved"),
      fps: z.number().optional().describe("Frames the window drew per second during it"),
      presses: z.int().min(0).optional().describe("How many presses a run took"),
      undoStep: z.boolean().describe("Whether it became an undo step")
    }),
    { level: "info", sentBy, when: "A gesture ends: a drag, a resize, a run of presses, a pan or a zoom." }
  ),
  defineEvent("edit.undone", stepAttributes, { level: "info", sentBy, when: "A step is undone." }),
  defineEvent("edit.redone", stepAttributes, { level: "info", sentBy, when: "A step undone is redone." }),
  defineEvent(
    "inspector.changed",
    z.object({
      field: z
        .string()
        .describe(
          "What it changed: a style row (`style.padding`), a prop (`props.variant`), `name`, a param (`params.size`), a token (`token.primary`) or another field the Editing section lists"
        ),
      design: z.string().optional().describe("The design, by key; none for a token, which the whole project shares"),
      layers: layerIds.describe("The layers it changed; none for the design's own name, states and params, or a token"),
      state: z.string().optional().describe("The state the edit went to, by id"),
      from: z.string().describe("The value before, as JSON; `mixed` when the layers differed"),
      to: z.string().describe("The value after, as JSON"),
      gesture: z.boolean().describe("Whether it's part of a run of Up and Down presses")
    }),
    { level: "info", sentBy, when: "A field in the inspector changes a layer, a design or a token." }
  ),
  defineEvent(
    "component.changed",
    z.object({
      action: z
        .enum(["detach", "push", "extract"])
        .describe(
          "What was done: an instance detached into plain layers, a copy's overrides pushed to its component, or layers made a component"
        ),
      design: z.string().describe("The design whose layers it changed, by key"),
      layers: layerIds.describe(
        "The layers: the instance detached or pushed, a layer inside one by path, or the layers made a component"
      ),
      component: z.string().describe("The component, by id: the one the copy follows, or the one made")
    }),
    {
      level: "info",
      sentBy,
      when: "Detach, Push to main or Make component changes how layers follow a component."
    }
  ),
  defineEvent(
    "insert.done",
    z.object({
      source: z
        .enum(["components", "icons", "images", "paste", "drop"])
        .describe("Where it came from: the Assets panel's Components, Icons or Images, a paste, or files dropped"),
      via: z
        .enum(["click", "drag", "quickInsert", "clipboard", "files"])
        .describe("How: clicked or dragged from the panel, Quick insert, the clipboard, or files dropped"),
      kind: z
        .enum(["component", "instance", "image", "layers", "designs", "notes", "text"])
        .describe("What it inserted"),
      item: z.string().optional().describe("Which: the component, the design an instance places, or the image's file"),
      count: z.int().min(0).describe("How many layers, designs or notes went in"),
      design: z.string().optional().describe("The design it went into, by key"),
      newDesign: z.boolean().describe("Whether it made a design of its own, with nothing to go into")
    }),
    { level: "info", sentBy, when: "Something is inserted onto the canvas." }
  ),
  defineEvent(
    "clipboard.pasted",
    z.object({
      how: pasteHow,
      content: clipboardContent,
      count: z.int().min(0).describe("How many layers, designs or notes were pasted")
    }),
    { level: "info", sentBy, when: "A paste puts something on the canvas." }
  ),
  defineEvent(
    "clipboard.failed",
    z.object({
      how: pasteHow,
      content: clipboardContent,
      reason: z
        .enum(["empty", "unreadable", "wrongKind", "noTarget", "instance", "imageFailed"])
        .describe(
          "Why nothing was pasted: nothing to paste, a copy that can't be read, content that can't go there, no layout there, layers inside an instance, or an image that couldn't be saved"
        ),
      code: z.string().optional().describe("The error code, when saving an image failed")
    }),
    { level: "info", sentBy, when: "A paste pastes nothing, and says why." }
  ),
  defineEvent(
    "text.edited",
    z.object({
      design: z.string().describe("The design, by key"),
      layer: z.string().describe("The text layer, by id"),
      outcome: z
        .enum(["committed", "unchanged", "cancelled"])
        .describe("Whether the text was changed, left as it was, or the editor closed before it could be written"),
      how: z.enum(["enter", "escape", "blur"]).optional().describe("What closed it: Enter, Escape, or clicking away"),
      durationMs: z.number().describe("How long it was open, in milliseconds"),
      length: z.int().min(0).describe("How many characters the text has after it")
    }),
    { level: "info", sentBy, when: "Editing a text layer in place on the canvas ends." }
  )
] as const
