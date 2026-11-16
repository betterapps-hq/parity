import { z } from "zod"
import { defineEvent } from "./events.ts"

const sentBy = ["renderer"] as const

const extension = z
  .string()
  .describe("What showed it or made it: an internal extension's id, `agent-presence`, or `core` for Parity's own")

/**
 * What the canvas draws for others (PAR-1234): previews of someone else's drag and holds on boards an agent moves. Each
 * is recorded once, as it ends.
 */
export const canvasEvents = [
  defineEvent(
    "dragPreview.settled",
    z.object({
      extension,
      kind: z
        .enum(["board", "layout", "absolute"])
        .describe("What it moved: boards, layers in a layout, or an absolutely placed layer"),
      items: z.int().min(0).describe("How many nodes it moved"),
      how: z
        .enum(["write", "timeout", "cancel", "disposed"])
        .describe(
          "How it ended: settled by the write covering the drop, given up on after 2 s without one, called off, or disposed by what showed it"
        ),
      durationMs: z.number().describe("From when it showed to when it ended, in milliseconds"),
      concurrent: z.int().min(1).describe("Previews open at once when it ended, this one among them")
    }),
    {
      level: "info",
      sentBy,
      when: "A preview of someone else's drag ends. One in ten that end by their write is recorded; every other ending is."
    }
  ),
  defineEvent(
    "hold.released",
    z.object({
      extension,
      how: z
        .enum(["released", "timeout", "grabbed", "disposed"])
        .describe(
          "How it ended: let go, after the 10 s limit, by the person grabbing the board, or disposed by what made it"
        ),
      heldMs: z.number().describe("How long the board was held, in milliseconds")
    }),
    { level: "info", sentBy, when: "A hold on a board an agent moves ends." }
  )
]
