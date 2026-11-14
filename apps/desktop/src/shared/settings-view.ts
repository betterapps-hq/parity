import { z } from "zod"

/*
 * What passes between the editor window and the Settings view, through main (PAR-1090). Settings is its own web
 * contents inside the window, owned by main, which loads no project code, so it can change what the project's code
 * mustn't: the person's settings for every project, extensions' among them. The project's page lives in the editor
 * window, though: the window sends main what Settings shows of the open project, and Settings sends main each change to
 * the project, which the window makes an undo step. Only main imports this at run time; the rest take its types.
 */

const text = z.string().max(2000)
const shortText = z.string().max(200)

/** A value one of Settings' controls takes: a string, a number, a true or false, or several choices. */
const value = z.union([z.string().max(20_000), z.number(), z.boolean(), z.array(shortText).max(50)])

const jsonValue = z.json()

const pathIcon = z.strictObject({
  viewBox: shortText,
  path: z.string().max(20_000),
  fillRule: z.enum(["nonzero", "evenodd"]).optional()
})

/** A setting as an extension's manifest declares it, which Settings draws with the kit's controls. */
const settingContribution = z.strictObject({
  type: z.enum(["string", "number", "boolean"]),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  scope: z.enum(["app", "project"]),
  title: shortText,
  enum: z.array(shortText).max(100).optional(),
  enumTitles: z.array(shortText).max(100).optional()
})

/** An extension as Settings lists it, from what the window knows of it in the open project. */
const settingsExtension = z.strictObject({
  /** Settings' own id for it, as `storybook`. */
  id: shortText,
  name: shortText,
  /** Whether it runs in the open project. */
  running: z.boolean(),
  /** What detection found, or why it isn't running. */
  found: text,
  adds: z.array(shortText).max(100),
  /** Its logo as path data, from its manifest; built-in tools without one use Settings' own. */
  icon: pathIcon.optional(),
  /** What keys its settings in settings.json and the project's file. */
  prefix: shortText.optional(),
  settings: z.record(shortText, settingContribution).optional(),
  permissions: z
    .strictObject({
      read: z.array(shortText).max(100).optional(),
      write: z.array(shortText).max(100).optional(),
      network: z.array(shortText).max(100).optional(),
      processes: z.array(shortText).max(100).optional(),
      edits: z.boolean().optional()
    })
    .optional(),
  /** Where its host is: waiting for its code to be needed, starting, running, stuck or crashed. */
  state: z.enum(["waiting", "starting", "running", "stuck", "crashed"]).optional(),
  /** Why it's stuck or crashed. */
  reason: text.optional(),
  /** How long its code took to activate, in milliseconds. */
  activatedIn: z.number().nonnegative().optional(),
  /** The memory its host held at its last ping, in bytes. */
  memory: z.number().nonnegative().optional(),
  /** Whether its code starts as soon as its tool is detected, which the Extensions page notes. */
  onStartup: z.boolean().optional(),
  /** Its settings whose values didn't fit, one sentence each. */
  problems: z.array(text).max(100).optional()
})

export type SettingsExtension = z.infer<typeof settingsExtension>

/** What Settings shows of the editor window's open project, sent each time it changes. */
export const settingsProject = z.strictObject({
  /** The open project's name and main file; none on Home, which has no project page. */
  project: z.strictObject({ name: shortText, file: z.string().max(4000) }).optional(),
  /** The person's settings the project changes for itself, by setting id, in the order it began to. */
  overrides: z.array(z.strictObject({ id: shortText, value })).max(50),
  /** Its extensions' settings, as its main file keeps them: by extension, then key. */
  extensions: z.record(shortText, z.record(shortText, jsonValue)),
  /** Whether the project has changes Save hasn't written yet. */
  unsaved: z.boolean(),
  /** Whether the project saves each change itself. */
  savesItself: z.boolean(),
  /** The extensions as Settings lists them. */
  list: z.array(settingsExtension).max(200),
  /**
   * The keys of the project's extensions, under each one's name (PAR-1092); one that doesn't work says which command
   * has its keys.
   */
  shortcuts: z
    .array(
      z.strictObject({
        extension: shortText,
        shortcuts: z
          .array(z.strictObject({ command: shortText, title: shortText, keys: shortText, clash: shortText.optional() }))
          .max(200)
      })
    )
    .max(200)
    .optional()
})

export type SettingsProject = z.infer<typeof settingsProject>

/** Where Settings opens: a page, and a setting on it to mark. */
export const settingsOpening = z.strictObject({ page: shortText.optional(), setting: shortText.optional() })

export type SettingsOpening = z.infer<typeof settingsOpening>

/**
 * A change Settings makes to the open project, which main passes to the editor window: one of its settings set, or put
 * back to every project's value or its default, or the project saved.
 */
export const settingsProjectChange = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("set"), id: shortText, value }),
  z.strictObject({ kind: z.literal("reset"), id: shortText }),
  z.strictObject({ kind: z.literal("save") })
])

export type SettingsProjectChange = z.infer<typeof settingsProjectChange>

/** A page Parity opens in a window of its own, as "Open stories in: Parity's browser" asks: a dev server or a web page. */
export const parityWindowUrl = z
  .url({ protocol: /^https?$/ })
  .refine(
    (url) => url.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url),
    "expected a web page or a server on this computer"
  )
