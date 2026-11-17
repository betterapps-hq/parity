import { z } from "zod"
import { defineEvent } from "./events.ts"

const sentBy = ["renderer"] as const

/** Why following ended: Esc, the person's own pan or zoom, opening another design, another follow, or its owner ending it. */
export const followEnds = ["escape", "panned", "zoomed", "navigated", "replaced", "disposed"] as const

/**
 * The canvas surface that internal extensions draw through (PAR-1233): following someone's view and colors handed out
 * by key. Each is recorded once, when it happens, never per frame.
 */
export const canvasSurfaceEvents = [
  defineEvent(
    "follow.ended",
    z.object({
      extension: z.string().describe("Who followed: an extension by its id, or `core`"),
      why: z.enum(followEnds).describe("Why it ended"),
      durationMs: z.number().describe("From when following began to when it ended, in milliseconds")
    }),
    { level: "info", sentBy, when: "Following a view on the canvas ends." }
  ),
  defineEvent(
    "colors.generated",
    z.object({
      list: z.enum(["people", "agents"]).describe("Whose palettes: people's or agents'"),
      n: z.int().min(0).describe("The palette's number, past the hand-tuned ones"),
      keys: z.int().min(0).describe("How many people and agents held a color in the tab then")
    }),
    {
      level: "info",
      sentBy,
      when: "A claim or assignment needs a generated palette, once per tab, list and number."
    }
  )
] as const
