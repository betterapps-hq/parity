import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * Searches of outside services through connectors, such as Mobbin (PAR-829). None carries a key or what was searched
 * for: a search is described by its connector, its filters and how it ended.
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
      .describe(
        "Every filter's value it ran with, as `{ platform: ios }`: the connector's own values, never what was typed"
      ),
    found: z.number().int().nonnegative().optional().describe("How many results came back, when the search worked"),
    problem: z
      .string()
      .optional()
      .describe("Why it found nothing to show, such as `rate-limited` or `no-key`, when it didn't work"),
    ms: z.number().nonnegative().describe("How long the search took, in milliseconds")
  }),
  { level: "info", sentBy: ["main"], when: "A connector's search ends, with what it found or why it found nothing." }
)

export const connectorEvents = [connectorsSearched] as const
