import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * Searches of outside services through connectors, such as Mobbin, and their results placed in designs (PAR-829). None
 * carries a key, what was searched for, or which result went where.
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

export const connectorsPlaced = defineEvent(
  "connectors.placed",
  z.object({
    connector: z.string().describe("The connector the result came from, such as `unsplash`"),
    kind: z.string().describe("What was placed: `screens`, `flows`, `sections` or `photos`"),
    from: z.enum(["window", "agent"]).describe("Who placed it: the person in the window, or an agent")
  }),
  {
    level: "info",
    sentBy: ["main"],
    when: "A connector's result goes into a design for the first time, before the source is told, if it asks to be."
  }
)

export const connectorEvents = [connectorsSearched, connectorsPlaced] as const
