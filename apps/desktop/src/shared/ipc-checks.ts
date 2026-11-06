import { isAbsolute } from "node:path"
import type { CodeEditorChoice } from "@parity-app/core"
import { nonBlankString, parseData } from "@parity-app/core"
import { z } from "zod"

/**
 * What the window sends main over `ipcMain.handle` (PAR-592). The project's own code runs in the window's page beside
 * `window.canvasHost`, so it can invoke any of these with anything: each argument is checked before its handler runs,
 * and a bad one is refused with `TypeError` and the field at fault. Only main imports this at run time; the window's
 * types come from it.
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

/** `handler` with its argument checked by `schema` first, so a bad one never reaches it. */
export function checked<Event, Schema extends z.ZodType, Result>(
  schema: Schema,
  handler: (event: Event, argument: z.output<Schema>) => Result
): (event: Event, argument: unknown) => Result {
  return (event, argument) => handler(event, parseData(schema, argument))
}
