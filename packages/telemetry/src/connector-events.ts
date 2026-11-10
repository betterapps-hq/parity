import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * Searches of outside services through connectors, such as Mobbin, and the file that keeps their keys (PAR-829). None
 * carries a key or what was searched for: a search is described by its connector, its filters and how it ended.
 */

export const connectorsSearched = defineEvent(
  "connectors.searched",
  z.object({
    connector: z.string().describe("The connector searched, such as `mobbin`"),
    from: z.enum(["window", "agent"]).describe("Who asked: the person in the window, or an agent through the service"),
    kind: z.string().describe("What it searched for: `screens`, `flows`, `sections` or `photos`"),
    filters: z
      .record(z.string(), z.string())
      .optional()
      .describe("The filters it named, as `{ platform: ios }`: each connector's own values, never what was typed"),
    found: z.number().int().nonnegative().optional().describe("How many results came back, when the search worked"),
    problem: z
      .string()
      .optional()
      .describe("Why it found nothing to show, such as `rate-limited` or `key-refused`, when it didn't work"),
    ms: z.number().nonnegative().describe("How long the search took, in milliseconds")
  }),
  { level: "info", sentBy: ["main"], when: "A connector's search ends, with what it found or why it found nothing." }
)

export const connectorsStoreFailed = defineEvent(
  "connectors.storeFailed",
  z.object({
    action: z.enum(["read", "write"]).describe("Whether Parity was reading the kept keys or writing them"),
    stage: z
      .enum(["file", "decrypt", "json", "schema", "reencrypt"])
      .optional()
      .describe("Where reading failed. A file that can't be decrypted is cleared, so its keys have to be added again"),
    error: z.string().describe("The error's name, never its message, which can hold what was decrypted"),
    code: z.string().optional().describe("The system error code, as `EPERM`, when there is one")
  }),
  { level: "warn", sentBy: ["main"], when: "The file that keeps connectors' keys can't be read or written." }
)

export const connectorEvents = [connectorsSearched, connectorsStoreFailed] as const
