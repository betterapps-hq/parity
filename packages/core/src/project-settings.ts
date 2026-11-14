import { z } from "zod"
import type { CanvasDocument } from "./document.ts"
import { fileObject, type JsonValue, jsonValue } from "./schema.ts"

// What a project's `.par` keeps of its settings: its own values for some of the person's preferences, and extensions'
// project settings. Both go in the project's main file and are saved with it, as any other change to it is.

/** The person's preferences a project can set for itself, its value winning while that project is open. */
const projectPreferenceKeys = ["autosave", "snapping", "layoutGrid", "exportSizes"] as const

export type ProjectPreferenceKey = (typeof projectPreferenceKeys)[number]

const exportSize = fileObject({
  format: z.enum(["png", "jpg"]),
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)])
})

/** One preference the project sets, and its value there. */
const preferenceOverride = z.discriminatedUnion("key", [
  z.object({ key: z.literal("autosave"), value: z.boolean() }),
  z.object({ key: z.literal("snapping"), value: z.boolean() }),
  z.object({ key: z.literal("layoutGrid"), value: z.boolean() }),
  z.object({ key: z.literal("exportSizes"), value: z.array(exportSize).min(1) })
])

export type PreferenceOverride = z.infer<typeof preferenceOverride>

/**
 * The preferences a project sets, keyed by preference, in the order they were set. A record keeps its keys in the order
 * the file has them, where an object schema would put them in its own order.
 */
export const projectPreferences = z
  .partialRecord(z.enum(projectPreferenceKeys), jsonValue)
  .superRefine((preferences, context) => {
    for (const [key, value] of Object.entries(preferences)) {
      const checked = preferenceOverride.safeParse({ key, value })

      if (!checked.success) {
        // The issue is about `{ key, value }`, so its path starts at `value`, which is the key's own value here.
        for (const issue of checked.error.issues) {
          context.addIssue({ code: "custom", message: issue.message, path: [key, ...issue.path.slice(1)] })
        }
      }
    }
  })

/**
 * Extensions' project settings, by extension id and then setting key, as `storybook` → `configDir`. Each extension
 * reads its own values and treats one it can't read as its default.
 */
export const projectExtensions = z.record(z.string().min(1), z.record(z.string().min(1), jsonValue))

export type ProjectExtensions = z.infer<typeof projectExtensions>

/** What a project's main file sets, as the Settings dialog lists it: its preferences in the order they were set. */
export function preferenceOverrides(document: Pick<CanvasDocument, "preferences"> | undefined): PreferenceOverride[] {
  return Object.entries(document?.preferences ?? {}).flatMap(([key, value]) => {
    const read = preferenceOverride.safeParse({ key, value })

    return read.success ? [read.data] : []
  })
}

/** Each preference a project can set, with the type of its value. */
type ProjectPreferenceValues = { [Override in PreferenceOverride as Override["key"]]: Override["value"] }

/** The person's preferences with the project's values over them: the same object when the project sets none. */
export function withProjectPreferences<T extends ProjectPreferenceValues>(
  preferences: T,
  document: Pick<CanvasDocument, "preferences"> | undefined
): T {
  const overrides = preferenceOverrides(document)

  if (overrides.length === 0) {
    return preferences
  }

  const values: Partial<ProjectPreferenceValues> = {}

  for (const override of overrides) {
    if (override.key === "exportSizes") {
      values.exportSizes = override.value
    } else {
      values[override.key] = override.value
    }
  }

  return { ...preferences, ...values }
}

/**
 * The document with the project setting this preference. One it already sets keeps its place in the order; a new one
 * goes last.
 */
export function setPreferenceOverride(document: CanvasDocument, override: PreferenceOverride): CanvasDocument {
  return { ...document, preferences: { ...document.preferences, [override.key]: override.value } }
}

/** The document without the project's value for this preference, and without `preferences` when none is left. */
export function clearPreferenceOverride(document: CanvasDocument, key: ProjectPreferenceKey): CanvasDocument {
  const { preferences, ...rest } = document
  const { [key]: _cleared, ...kept } = preferences ?? {}

  return Object.keys(kept).length > 0 ? { ...rest, preferences: kept } : rest
}

/** The document with an extension's project setting at `value`. */
export function setExtensionSetting(
  document: CanvasDocument,
  extension: string,
  key: string,
  value: JsonValue
): CanvasDocument {
  const extensions = document.extensions ?? {}

  return { ...document, extensions: { ...extensions, [extension]: { ...extensions[extension], [key]: value } } }
}

/**
 * The document without an extension's project setting, so it reads as the extension's default again. An extension left
 * with none goes, and `extensions` with it when it's the last.
 */
export function clearExtensionSetting(document: CanvasDocument, extension: string, key: string): CanvasDocument {
  const { extensions, ...rest } = document

  // Each extension keeps its place, as the dialog lists them in the file's order.
  const left = Object.entries(extensions ?? {}).flatMap(([id, settings]): [string, typeof settings][] => {
    if (id !== extension) {
      return [[id, settings]]
    }

    const { [key]: _cleared, ...kept } = settings

    return Object.keys(kept).length > 0 ? [[id, kept]] : []
  })

  return left.length > 0 ? { ...rest, extensions: Object.fromEntries(left) } : rest
}

/** Storybook's id among the extensions whose project settings a `.par` keeps. */
const storybookExtension = "storybook"

/** Where Storybook's config folder is when the project doesn't say: `.storybook`, at the root. */
export const defaultStorybookConfigDir = ".storybook"

/**
 * The Storybook config folder the project sets, relative to its root, or nothing when it leaves Storybook to be found
 * as usual. A value that isn't a folder name reads as unset.
 */
export function storybookConfigDir(document: Pick<CanvasDocument, "extensions"> | undefined): string | undefined {
  const read = z.string().trim().min(1).safeParse(document?.extensions?.[storybookExtension]?.configDir)

  return read.success ? read.data : undefined
}
