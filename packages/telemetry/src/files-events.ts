import { z } from "zod"
import { defineEvent } from "./events.ts"

/** Handled failures and the editor's saves, exports and project edits (PAR-632). */

const code = z.string().optional().describe("The `CodedError` code, when the failure has one")
const outcome = z.enum(["ok", "error"]).describe("Whether it worked")
const files = z.array(z.string()).describe("The files it changed, by path")
const library = {
  package: z.string().describe("The library, by its catalog ID or package name"),
  version: z.string().optional().describe("The version installed, when known")
}

export const errorCaught = defineEvent(
  "error.caught",
  z.object({
    action: z.string().describe("What failed, as `document.save` or `export.layers`"),
    title: z.string().describe("The notification's title"),
    message: z.string().describe("The error's message"),
    code,
    context: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe("What it was acting on")
  }),
  { level: "error", sentBy: ["renderer"], when: "A failure is shown as an error notification." }
)

export const ipcFailed = defineEvent(
  "ipc.failed",
  z.object({ method: z.string().describe("The service method asked"), code }),
  { level: "warn", sentBy: ["renderer"], when: "A request to the project service fails." }
)

const saveAttributes = {
  file: z.string().describe("The file written"),
  durationMs: z.number().nonnegative().describe("How long it took"),
  bytes: z.number().int().nonnegative().describe("The document's size as JSON")
}

export const documentSaved = defineEvent("document.saved", z.object(saveAttributes), {
  level: "info",
  sentBy: ["renderer"],
  when: "A design file is saved."
})

export const documentSaveFailed = defineEvent("document.saveFailed", z.object({ ...saveAttributes, code }), {
  level: "warn",
  sentBy: ["renderer"],
  when: "A design file couldn't be saved."
})

export const tokensSaved = defineEvent(
  "tokens.saved",
  z.object({ changes: z.number().int().nonnegative().describe("The tokens written"), files, outcome, code }),
  { level: "info", sentBy: ["renderer"], when: "Token changes are written to the stylesheet, or fail to be." }
)

const editAttributes = z.object({ files, outcome, code })

export const projectEditApplied = defineEvent("projectEdit.applied", editAttributes, {
  level: "info",
  sentBy: ["renderer"],
  when: "Parity changes the project's files and says so, with Undo."
})

export const projectEditUndone = defineEvent("projectEdit.undone", editAttributes, {
  level: "info",
  sentBy: ["renderer"],
  when: "Undo puts back a project edit's files, or fails to."
})

const exportAttributes = {
  kind: z.enum(["layers", "designs"]).describe("Layers at the Export section's sizes, or whole designs as images"),
  formats: z.array(z.enum(["png", "jpg"])).describe("The formats written"),
  scales: z.array(z.number()).describe("The scales written"),
  designs: z.number().int().nonnegative().describe("The designs and layers exported"),
  states: z.number().int().nonnegative().optional().describe("The states exported, when they're counted")
}

export const exportDone = defineEvent(
  "export.done",
  z.object({ ...exportAttributes, files: z.number().int().nonnegative().describe("The files written") }),
  { level: "info", sentBy: ["renderer"], when: "An export finishes." }
)

export const exportFailed = defineEvent("export.failed", z.object({ ...exportAttributes, code }), {
  level: "warn",
  sentBy: ["renderer"],
  when: "An export fails."
})

export const libraryAdded = defineEvent("library.added", z.object(library), {
  level: "info",
  sentBy: ["renderer"],
  when: "A catalog library is installed into the project."
})

export const libraryFailed = defineEvent("library.failed", z.object({ ...library, code }), {
  level: "warn",
  sentBy: ["renderer"],
  when: "A catalog library couldn't be installed."
})

export const stylesImported = defineEvent("styles.imported", z.object({ ...library, files }), {
  level: "info",
  sentBy: ["renderer"],
  when: "A library's styles are imported into the project's stylesheet."
})

export const filesEvents = [
  errorCaught,
  ipcFailed,
  documentSaved,
  documentSaveFailed,
  tokensSaved,
  projectEditApplied,
  projectEditUndone,
  exportDone,
  exportFailed,
  libraryAdded,
  libraryFailed,
  stylesImported
] as const
