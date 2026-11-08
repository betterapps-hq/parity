import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * The spans that make one trace of an action across processes (PAR-629): the window starts one for each action and
 * gesture, and the work it causes elsewhere continues it.
 */
export const commandRan = defineEvent(
  "command.ran",
  z.object({
    action: z.string().describe("The action's ID in the keymap, as `chrome/actions.ts` names it"),
    from: z
      .enum(["key", "menu", "canvasMenu", "layersMenu", "search", "toolbar", "panel"])
      .describe(
        "What ran it: a key, the menubar, the canvas's or a Layers row's menu, Search actions, the toolbar, or a button in a panel or page"
      ),
    enabled: z.boolean().describe("Whether it applied then. One that didn't is recorded as cancelled, without running"),
    layers: z.int().min(0).describe("How many layers were selected"),
    designs: z.int().min(0).describe("How many designs were selected, with no layer inside one"),
    code: z.string().optional().describe("The error code, when it failed")
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "An action in `chrome/actions.ts` is asked for, from anywhere, until it's done."
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
