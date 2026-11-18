import { z } from "zod"
import { defineEvent } from "./events.ts"

/*
 * Route boards drawn from frozen copies of the app's pages (docs/proposals/route-frames.md, PAR-1262). No route path or
 * page content goes into any of them.
 */

export const routeFrameRefused = defineEvent(
  "routeFrame.refused",
  z.object({
    reason: z
      .enum(["cap", "schema", "deadline"])
      .describe("Why: past a snapshot's caps, not what the schema reads, or no answer before its deadline")
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "The freezer refuses a page's snapshot or gets none, so its board keeps what it had."
  }
)

export const routeFrameRemoved = defineEvent(
  "routeFrame.removed",
  z.object({
    elements: z.number().int().nonnegative().describe("How many elements the sanitizer took out of the page's body"),
    attributes: z
      .number()
      .int()
      .nonnegative()
      .describe("How many attributes and classes the sanitizer took out of the page's root")
  }),
  {
    level: "debug",
    sentBy: ["renderer"],
    when: "The sanitizer takes anything out of a snapshot before its copy is built."
  }
)

export const routeFrameProcess = defineEvent(
  "routeFrame.process",
  z.object({
    how: z.enum(["gone", "hung"]).describe("Whether the page's process went or stopped answering"),
    stopped: z.boolean().describe("Whether Parity stopped opening frames for the project after it")
  }),
  {
    level: "warn",
    sentBy: ["renderer"],
    when: "A project's page process goes or stops answering, heard once however many of its frames report it."
  }
)

export const routeFrameLive = defineEvent(
  "routeFrame.live",
  z.object({
    from: z
      .enum(["warming", "parked", "sent", "loading", "new"])
      .describe(
        "Which frame went live: the one warming on the board, a spare on its route, a spare sent there, one still loading, or a new one"
      ),
    ms: z.number().int().nonnegative().describe("How long going live took, from the press to the page in place")
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "A route board goes live with the Interact tool."
  }
)

export const routeFrameMiss = defineEvent("routeFrame.miss", z.object({}), {
  level: "info",
  sentBy: ["renderer"],
  when: "A route board goes live with no spare to take, so a new frame loads at its route."
})

export const routeFrameEvents = [
  routeFrameRefused,
  routeFrameRemoved,
  routeFrameProcess,
  routeFrameLive,
  routeFrameMiss
] as const
