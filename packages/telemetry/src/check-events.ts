import { z } from "zod"
import { defineEvent } from "./events.ts"

/** A zod check failed on data Parity didn't make (PAR-578, PAR-633). */
export const dataInvalid = defineEvent(
  "data.invalid",
  z.object({
    schema: z.string().describe("The schema's name, or the function that checked with it"),
    pointer: z.string().describe("Where the first problem is, as a JSON pointer"),
    message: z.string().describe("What was expected there"),
    issues: z.array(z.string()).describe("Every problem zod found, as `/pointer: message`, the first 20"),
    data: z.string().describe("The data that failed, as JSON, cut to 2,000 characters")
  }),
  {
    level: "warn",
    sentBy: ["main", "renderer", "render", "service", "worker"],
    when: "A check of a file, input, setting or response Parity didn't make fails."
  }
)

/** Parity can't open a project it was asked to (PAR-213, PAR-633). */
export const projectUnsupported = defineEvent(
  "project.unsupported",
  z.object({
    reason: z
      .enum(["no_package", "no_renderer", "no_builder"])
      .describe("Why: no package.json, no renderer for its framework, or no builder for its bundler"),
    detail: z.string().describe("What Parity found, as shown to the person opening it")
  }),
  { level: "warn", sentBy: ["service"], when: "A project is opened that Parity doesn't support." }
)
