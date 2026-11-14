import type { JsonValue, PreferenceOverride, ProjectPreferenceKey } from "@parity-app/core"
import type { ExportSize } from "@parity-app/editor"
import { type CodeEditorChoice, codeEditors } from "@parity-app/processes"
import { z } from "zod"
import type { Preferences } from "../preferences.ts"
import type { Setting, Value } from "./definitions.ts"

/*
 * Settings' values as its controls give and take them, and the preferences and project values they stand for. The
 * editor window and Settings both read them: the window to make Settings' changes to the project undo steps, Settings
 * to show and save the person's.
 */

/** The person's preferences Settings shows, by setting id. */
const preferenceIds = [
  "theme",
  "autosave",
  "codeEditor",
  "componentsView",
  "snapping",
  "layoutGrid",
  "exportSizes",
  "performanceStats"
] as const satisfies readonly (keyof Preferences)[]

export type PreferenceId = (typeof preferenceIds)[number]

export function isPreference(id: string): id is PreferenceId {
  return preferenceIds.some((key) => key === id)
}

function isEditorChoice(value: Value): value is CodeEditorChoice {
  return value === "auto" || value === "system" || codeEditors.some((editor) => editor.id === value)
}

/** An export size as Settings' choices write it: `png 2x`. */
export function sizeText(size: ExportSize): string {
  return `${size.format} ${size.scale}x`
}

/** Every export size, by how Settings' choices write it. */
const sizeChoices = new Map(
  (["png", "jpg"] as const).flatMap((format) =>
    ([1, 2, 3] as const).map((scale): [string, ExportSize] => [sizeText({ format, scale }), { format, scale }])
  )
)

/** The export sizes Settings' choices name, in the order they're listed, leaving out any it can't read. */
function sizesOf(value: Value): ExportSize[] {
  return (Array.isArray(value) ? value : []).flatMap((text) => sizeChoices.get(text) ?? [])
}

/** A preference's value as Settings shows it. */
export function shownValue(preferences: Pick<Preferences, PreferenceId>, id: PreferenceId): Value {
  return id === "exportSizes" ? preferences.exportSizes.map(sizeText) : preferences[id]
}

const flag = z.boolean()

/** A value from one of Settings' controls for one of the person's preferences, as the preference takes it. */
const preferenceValue = z.discriminatedUnion("id", [
  z.object({ id: z.literal("theme"), value: z.enum(["light", "dark", "system"]) }),
  z.object({ id: z.literal("componentsView"), value: z.enum(["names", "list", "grid"]) }),
  z.object({ id: z.enum(["autosave", "snapping", "layoutGrid", "performanceStats"]), value: flag })
])

/** One of the person's preferences, from a value Settings' control gave. */
export function preferenceChange(id: PreferenceId, value: Value): Partial<Preferences> | undefined {
  if (id === "exportSizes") {
    const sizes = sizesOf(value)

    return sizes.length > 0 ? { exportSizes: sizes } : undefined
  }

  if (id === "codeEditor") {
    return isEditorChoice(value) ? { codeEditor: value } : undefined
  }

  const read = preferenceValue.safeParse({ id, value })

  if (!read.success) {
    return undefined
  }

  switch (read.data.id) {
    case "theme":
      return { theme: read.data.value }
    case "componentsView":
      return { componentsView: read.data.value }
    default:
      return { [read.data.id]: read.data.value }
  }
}

/** A project's own value for a preference, from a value Settings' control gave. */
export function overrideOf(key: ProjectPreferenceKey, value: Value): PreferenceOverride | undefined {
  if (key === "exportSizes") {
    const sizes = sizesOf(value)

    return sizes.length > 0 ? { key, value: sizes } : undefined
  }

  const read = flag.safeParse(value)

  return read.success ? { key, value: read.data } : undefined
}

/**
 * A value an extension keeps, in settings.json or the project's file, as its setting's control takes it: nothing when
 * it doesn't fit, so the setting shows its default.
 */
export function extensionValue(setting: Setting, value: JsonValue | undefined): Value | undefined {
  const { control } = setting

  switch (control.kind) {
    case "switch":
      return flag.safeParse(value).data
    case "number":
      return z.number().safeParse(value).data
    case "select": {
      const choice = z.string().safeParse(value).data

      return control.options.some((option) => option.value === choice) ? choice : undefined
    }

    case "text":
      return z.string().safeParse(value).data
    default:
      return undefined
  }
}
