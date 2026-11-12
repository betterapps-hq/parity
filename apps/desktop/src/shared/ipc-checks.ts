import { isAbsolute } from "node:path"
import type { CodeEditorChoice } from "@parity-app/core"
import { nonBlankString } from "@parity-app/core"
import { z } from "zod"

/**
 * The schemas of what the window sends main over IPC (PAR-592), which `hostMethods` gives each method. The project's own
 * code runs in the window's page beside `window.canvasHost`, so it can send any of these with anything: main's
 * registration checks each argument before its handler runs, and refuses a bad one with `TypeError` and the field at
 * fault. Only main imports this at run time; the window's types come from it.
 */

/** An absolute path, which is never read as a command's option, as `-x` would be. */
const absolutePath = nonBlankString.refine((path) => isAbsolute(path), "expected an absolute path")

export const themeSource = z.enum(["light", "dark", "system"])

export type ThemeSource = z.infer<typeof themeSource>

const codeEditorChoice = z.enum([
  "auto",
  "system",
  "vscode",
  "cursor",
  "windsurf",
  "zed"
]) satisfies z.ZodType<CodeEditorChoice>

/** A file to open in the person's editor (PAR-527). */
export const openInEditorRequest = z.strictObject({
  /** Its absolute path. */
  file: absolutePath,
  /** The export to open it at, as a component's source names it. */
  export: z.string().optional(),
  /** The line to open it at, from 1, as an element's source gives it (PAR-167). Wins over `export`. */
  line: z.number().int().positive().optional(),
  /** What Settings says to open it with. */
  editor: codeEditorChoice
})

export const saveDialogOptions = z.strictObject({
  title: z.string(),
  defaultPath: z.string().optional(),
  filters: z.array(z.strictObject({ name: z.string(), extensions: z.array(z.string()) })).optional()
})

/** The folder picker's title, when it isn't to open a project. */
export const folderPickerTitle = z.string().optional()

/** A file or folder to show in the system's file manager. */
export const shownItem = absolutePath

export const betaSetting = z.boolean("The beta setting must be true or false.")

/** The level chosen in Settings > Telemetry (PAR-626). */
export const telemetrySetting = z.enum(["all", "off"], "The telemetry level must be all or off.")

/** Which frame the console message about to be written comes from, at what level (PAR-147). */
export const consoleAnnouncement = z.strictObject({
  level: z.enum(["info", "warning", "error", "debug"]),
  design: nonBlankString,
  state: z.string().optional(),
  mode: z.string().optional(),
  source: z.url().optional(),
  line: z.number().int().nonnegative().optional()
})

/** A project's builder, by its address, whose console messages to read or forget. */
export const consoleOrigin = z.url()

/** A Sentry ID: a replay's, a trace's or an event's, 32 lowercase hex digits. */
const sentryId = z.string().regex(/^[0-9a-f]{32}$/)

/**
 * A report from Help > Report a problem (PAR-635): what happened, and the IDs that tie it to the window's replay and
 * trace, and to the error a part of the window caught when it's sent from that part's fallback (PAR-704).
 */
export const problemReport = z.strictObject({
  message: nonBlankString,
  screenshot: z.boolean(),
  afterCrash: z.boolean(),
  replayId: sentryId.optional(),
  traceId: sentryId.optional(),
  eventId: sentryId.optional()
})

export type ProblemReport = z.infer<typeof problemReport>
