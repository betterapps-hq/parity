import { z } from "zod"

/**
 * The choices a person makes for the whole app, in Settings and the menus, as `settings.json` keeps them (see
 * `docs/proposals/settings.md`). Each copy of Parity reads the same file, so a choice made in one is every copy's.
 */

const exportScale = z.union([z.literal(1), z.literal(2), z.literal(3)])

/** Each setting as a change to it must be: a value that doesn't read is refused, never put at its default. */
export const settingValues = {
  /** The app's own theme. Designs show whichever theme their mode picks. */
  theme: z.enum(["light", "dark", "system"]),
  /** Designs lock to the edges and centers of the designs around them while dragged. */
  snapping: z.boolean(),
  /**
   * The sizes the Export section writes each layer at, and File > Export all each design: PNGs or JPGs, at 1x to 3x
   * (PAR-185).
   */
  exportSizes: z.array(z.object({ format: z.enum(["png", "jpg"]), scale: exportScale })).min(1),
  /** How the Components tab shows components: names only, a list with a picture each, or a grid (PAR-208). */
  componentsView: z.enum(["names", "list", "grid"]),
  /** Column grids over every frame, sized for its viewport. */
  layoutGrid: z.boolean(),
  /** Each change saves itself a moment after it's made, instead of waiting for Save. */
  autosave: z.boolean(),
  /** Frame rate, memory and CPU in the status bar, for spotting what slows the app down. */
  performanceStats: z.boolean(),
  /**
   * A dot on each route board for its route frame's tier: grey frozen, orange while a spare warms on its route, green
   * once one is ready there or the board is live (PAR-1301).
   */
  routeFrameTiers: z.boolean(),
  /** The editor View code opens a component's file in: one, the first installed, or the system's default app. */
  codeEditor: z.enum(["vscode", "cursor", "windsurf", "zed", "auto", "system"])
} as const

export type SettingKey = keyof typeof settingValues

export type AppSettings = { [Key in SettingKey]: z.infer<(typeof settingValues)[Key]> }

/** What every setting is until the person changes it. A key that's absent from the file means this. */
export const defaultSettings: AppSettings = {
  theme: "dark",
  snapping: true,
  exportSizes: [{ format: "png", scale: 2 }],
  componentsView: "list",
  layoutGrid: false,
  autosave: false,
  performanceStats: false,
  routeFrameTiers: false,
  codeEditor: "auto"
}

// SAFETY: `settingValues` and `defaultSettings` have the same keys, which `AppSettings` checks.
export const settingKeys = Object.keys(defaultSettings) as SettingKey[]

/**
 * A change from a window: some settings, each to a value that reads, or `null` to put it back to its default. Keys it
 * doesn't know are refused, since a window and main ship together.
 */
export const settingsChange = z
  .object(
    // SAFETY: each key is a setting's, given its own schema, made optional and nullable.
    Object.fromEntries(settingKeys.map((key) => [key, settingValues[key].nullable().optional()])) as {
      [Key in SettingKey]: z.ZodOptional<z.ZodNullable<(typeof settingValues)[Key]>>
    }
  )
  .strict()

export type SettingsChange = z.infer<typeof settingsChange>

/** A value an extension's setting takes: its manifest types each as a string, a number or a true or false. */
export const extensionSettingValue = z.union([z.string(), z.number(), z.boolean()])

export type ExtensionSettingValue = z.infer<typeof extensionSettingValue>

/**
 * Extensions' `app` settings, as `settings.json` keeps them under `extensions`: by extension, as its prefix names it,
 * then by setting key, as `storybook` → `openIn`. Each extension's own schema checks its values when it reads them, so
 * the values of one that isn't installed are kept as they are.
 */
export type ExtensionSettings = Record<string, Record<string, JsonValue>>

/** A value as JSON writes it. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * A change to extensions' `app` settings: by extension, then key, each to a value, or `null` to put it back to its
 * default. Only the Settings view sends one, since the editor window runs the project's code.
 */
export const extensionSettingsChange = z.record(
  z.string().min(1).max(100),
  z.record(z.string().min(1).max(200), extensionSettingValue.nullable())
)

export type ExtensionSettingsChange = z.infer<typeof extensionSettingsChange>
