import { z } from "zod"
import { defineEvent } from "./events.ts"

/** Opening and closing projects, their builders and the servers they need (PAR-637). */

const name = z.string().describe("The project's name, from its package.json or its folder")
const root = z.string().describe("The project's folder")
const code = z.string().optional().describe("The `CodedError` code, when the failure has one")
const durationMs = z.number().nonnegative().describe("How long it took, in milliseconds")
const reopen = z
  .boolean()
  .describe("Whether it was reopened as Parity started, because it was open last time (PAR-179)")
const version = (tool: string) => z.string().optional().describe(`The ${tool} version installed, when it has one`)
const count = (what: string) => z.number().int().nonnegative().describe(what)
const builder = z.string().describe("The builder's name, as Vite")

const opening = {
  name,
  root,
  reopen,
  durationMs,
  detectionMs: z.number().nonnegative().optional().describe("How long detection took, when it finished"),
  builderMs: z.number().nonnegative().optional().describe("How long the builder took to answer, when it did"),
  framework: z.string().optional().describe("The renderer's ID, as `react`, once one was found"),
  builder: z.string().optional().describe("The builder's ID, as `vite`, once one was found")
}

export const projectDetected = defineEvent("project.detected", z.object({ root }), {
  level: "debug",
  sentBy: ["service"],
  when: "The service reads a project's package, tools, files and components as it opens, until it's done."
})

export const projectOpened = defineEvent(
  "project.opened",
  z.object({
    ...opening,
    cached: z.boolean().describe("Whether its components and props came from the last detection, as nothing changed"),
    react: version("React"),
    vite: version("Vite"),
    tailwind: version("Tailwind"),
    storybook: version("Storybook"),
    typescript: version("TypeScript"),
    components: count("The components it has"),
    designs: count("The designs in its project files"),
    tokens: count("The theme variables its styles have"),
    libraries: count("The component libraries it depends on")
  }),
  { level: "info", sentBy: ["service"], when: "A project opens, with its builder serving it." }
)

export const projectOpenFailed = defineEvent(
  "project.openFailed",
  z.object({
    ...opening,
    step: z.enum(["detection", "builder"]).describe("The step that failed"),
    message: z.string().describe("Why, as the tab says it"),
    code
  }),
  { level: "warn", sentBy: ["service"], when: "A project can't be opened." }
)

export const projectLoaded = defineEvent(
  "project.loaded",
  z.object({
    name,
    root,
    durationMs: z.number().nonnegative().describe("From asking to open it until its tab is ready, in milliseconds"),
    componentsMs: z.number().nonnegative().describe("How long its guest and components took to load in the window"),
    components: count("The components it has"),
    restored: z
      .boolean()
      .optional()
      .describe("Whether the window opened it as it started, as last time's tabs, rather than the person opening it")
  }),
  { level: "info", sentBy: ["renderer"], when: "A project's tab has its components loaded and is ready to draw." }
)

export const projectOpening = defineEvent(
  "project.opening",
  z.object({
    reload: z.boolean().describe("Whether the tab's project was opened again in place, as after adding a library"),
    root: root.optional(),
    name: name.optional(),
    code
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "A tab asks the service to open a project, until the tab is ready or the open fails."
  }
)

export const projectDrawn = defineEvent(
  "project.drawn",
  z.object({
    name,
    root,
    durationMs: z
      .number()
      .nonnegative()
      .describe("From asking to open it until its canvas first drew a frame, in milliseconds"),
    from: z.enum(["live", "bitmap"]).describe("Whether the frame drew its design, or showed a bitmap kept of it")
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "A newly opened project's canvas first draws a frame, in the trace of `project.opening`."
  }
)

export const projectClosed = defineEvent(
  "project.closed",
  z.object({ name, root, openMs: z.number().nonnegative().describe("How long it was open, in milliseconds") }),
  { level: "info", sentBy: ["service"], when: "An open project is closed." }
)

export const builderReady = defineEvent(
  "builder.ready",
  z.object({
    builder,
    durationMs,
    restart: z.boolean().describe("Whether it was started again, as after a crash")
  }),
  { level: "info", sentBy: ["service"], when: "A project's builder answers and serves the project." }
)

export const builderCrashed = defineEvent(
  "builder.crashed",
  z.object({
    builder,
    exitCode: z.number().int().optional().describe("The builder process's exit code, when it exited with one"),
    signal: z.string().optional().describe("The signal that ended it, when one did"),
    output: z.string().describe("The last of what it printed, up to 50 lines")
  }),
  { level: "warn", sentBy: ["service"], when: "A project's builder stops by itself while the project is open." }
)

export const builderRestarted = defineEvent(
  "builder.restarted",
  z.object({ builder, durationMs, outcome: z.enum(["ok", "error"]).describe("Whether it answered again"), code }),
  { level: "info", sentBy: ["service"], when: "A project's builder is started again from the processes list." }
)

const server = {
  kind: z.string().describe("The kind of server, as `storybook`"),
  name: z.string().describe("Its name, as the processes list shows it"),
  durationMs
}

export const serverStarted = defineEvent("server.started", z.object(server), {
  level: "info",
  sentBy: ["service"],
  when: "A server the process manager started answers at its address."
})

export const serverFailed = defineEvent(
  "server.failed",
  z.object({
    ...server,
    reason: z.enum(["exited", "timeout"]).describe("Whether it stopped before it answered, or didn't answer in time"),
    output: z.string().describe("The last of what it printed, up to 50 lines")
  }),
  { level: "warn", sentBy: ["service"], when: "A server the process manager started can't start." }
)

export const projectEvents = [
  projectDetected,
  projectOpened,
  projectOpenFailed,
  projectLoaded,
  projectOpening,
  projectDrawn,
  projectClosed,
  builderReady,
  builderCrashed,
  builderRestarted,
  serverStarted,
  serverFailed
] as const
