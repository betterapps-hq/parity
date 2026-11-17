import { z } from "zod"
import { defineEvent } from "./events.ts"

const sentBy = ["renderer"] as const

/**
 * The interface and navigation events (PAR-634): panels, dialogs, modes, settings and the start page. A project
 * opening and closing is `project.opened` and `project.closed`.
 */
export const interfaceEvents = [
  defineEvent(
    "panel.shown",
    z.object({
      panel: z.enum(["left", "right", "console"]).describe("The side panel, or the console under the canvas"),
      tab: z.string().optional().describe("The tab the side panel shows, such as layers or design")
    }),
    { level: "info", sentBy, when: "A side panel or the console opens, or a side panel shows another tab." }
  ),
  defineEvent(
    "dialog.opened",
    z.object({ dialog: z.string().describe("Which dialog: settings, shortcuts, about, actions or report") }),
    { level: "info", sentBy, when: "One of the app's own dialogs opens." }
  ),
  defineEvent(
    "mode.switched",
    z.object({ mode: z.enum(["design", "interact"]).describe("The mode the canvas is in now") }),
    {
      level: "info",
      sentBy,
      when: "The canvas switches between designing and Interact, where designs take the pointer."
    }
  ),
  defineEvent(
    "setting.changed",
    z.object({
      setting: z.string().describe("The setting's name, such as theme, snapping or telemetry"),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .describe("Its new value; a list, such as the export sizes, as JSON")
    }),
    { level: "info", sentBy, when: "A preference or the telemetry level is changed." }
  ),
  defineEvent(
    "start.action",
    z.object({
      page: z
        .enum(["home", "new"])
        .describe("The start page it came from: Home, or, before a window held one project, a new tab"),
      action: z
        .enum(["new-project", "open-folder", "open-file", "recent-project", "search", "star", "forget"])
        .describe(
          "What was done: start a project, open a folder or file, open a listed project, search, star or forget one"
        )
    }),
    { level: "info", sentBy, when: "A control on Home is used." }
  )
] as const
