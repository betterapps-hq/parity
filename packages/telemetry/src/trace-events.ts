import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * The spans that make one trace of an action across processes (PAR-629): the window starts one for each action and
 * gesture, and the work it causes elsewhere continues it.
 */
export const actionRan = defineEvent(
  "action.ran",
  z.object({
    action: z.string().describe("The action's ID in the keymap, as `chrome/actions.ts` names it"),
    code: z.string().optional().describe("The error code, when it failed")
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "An action runs from a key, a menu or the actions search, until it's done."
  }
)

export const gestureRan = defineEvent(
  "gesture.ran",
  z.object({
    gesture: z.string().describe("The gesture's kind, as `canvas/gesture.ts` names it"),
    how: z.string().optional().describe("How it ended: release, escape or interrupted")
  }),
  { level: "info", sentBy: ["renderer"], when: "A press on the canvas becomes a drag, until the drag ends." }
)

export const requestHandled = defineEvent(
  "request.handled",
  z.object({
    method: z.string().describe("The method asked for"),
    code: z.string().optional().describe("The error code, when it failed")
  }),
  { level: "debug", sentBy: ["service", "main"], when: "The service or main answers another process's request." }
)

export const builderStarted = defineEvent(
  "builder.started",
  z.object({ builder: z.string().describe("The builder's name") }),
  { level: "info", sentBy: ["service"], when: "The service starts a project's builder, until it's spawned." }
)

export const agentCalled = defineEvent(
  "agent.called",
  z.object({
    method: z.string().describe("The agent method called"),
    agent: z.string().optional().describe("The caller's name"),
    code: z.string().optional().describe("The error code, when it failed")
  }),
  { level: "info", sentBy: ["service"], when: "The agent server answers a call from the CLI." }
)
