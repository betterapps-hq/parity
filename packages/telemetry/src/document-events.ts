import { z } from "zod"
import { defineEvent } from "./events.ts"

/** The project document an open project's designs live in (docs/proposals/multiplayer.md: Telemetry). */

const provider = z.string().describe("The document's provider: `loro` or `local`")
const files = z.array(z.string()).describe("The project files in the document, by path")

export const documentEvents = [
  defineEvent(
    "projectDoc.opened",
    z.object({
      provider,
      files,
      designs: z.int().min(0).describe("Designs in the document"),
      layers: z.int().min(0).describe("Layers in the document"),
      durationMs: z.number().describe("From reading the files to the document being ready, in milliseconds"),
      wasmMs: z
        .number()
        .optional()
        .describe("Time to download and compile the provider's WebAssembly, in milliseconds, when it has any"),
      bytes: z.int().min(0).optional().describe("The provider's state, in bytes, when it can say")
    }),
    { level: "info", sentBy: ["renderer"], when: "A project's designs are loaded into the document." }
  ),
  defineEvent(
    "projectDoc.openFailed",
    z.object({
      provider,
      files,
      file: z.string().optional().describe("The file it failed on, when one is to blame"),
      message: z.string().describe("Why, as the provider said it")
    }),
    { level: "error", sentBy: ["renderer"], when: "Loading a project's designs into the document fails." }
  ),
  defineEvent(
    "projectDoc.refused",
    z.object({
      provider,
      label: z.string().describe("The transaction's label: `Move layer`"),
      origin: z.enum(["edit", "agent", "extension", "file", "view", "code", "remote"]).describe("Who made it"),
      problem: z
        .enum(["unknownDesign", "unknownNode", "takenId", "intoItself", "notSibling", "fixedField", "invalid"])
        .describe("Why the first was refused"),
      op: z.string().describe("The kind of operation refused: `move`"),
      count: z.int().min(1).describe("Transactions refused in the run: one, or all of a gesture's")
    }),
    {
      level: "warn",
      sentBy: ["renderer"],
      when: "A transaction is refused, or a gesture ends that had some refused, so nothing in them was applied."
    }
  ),
  defineEvent(
    "projectDoc.closed",
    z.object({
      provider,
      durationMs: z.number().describe("How long the document was open, in milliseconds"),
      transactions: z.int().min(0).describe("Transactions applied"),
      operations: z.int().min(0).describe("Operations in them"),
      undos: z.int().min(0).describe("Steps undone"),
      redos: z.int().min(0).describe("Steps redone"),
      refused: z.int().min(0).describe("Transactions refused"),
      layers: z.int().min(0).describe("Layers when it closed"),
      peakBytes: z.int().min(0).optional().describe("The provider's largest state, in bytes, when it can say"),
      transactMs: z.number().describe("Time spent checking and applying transactions, in milliseconds")
    }),
    { level: "info", sentBy: ["renderer"], when: "A project closes, with a summary of its document's session." }
  )
] as const
