import type { JsonValue, SettingContribution, SettingValue } from "@parity-app/extension"
import { fits } from "@parity-app/extension/manifest"

/*
 * Extensions' settings as data (PAR-1090). A manifest declares each setting as a small JSON Schema with a `scope`: the
 * person's for every project (`app`, kept in settings.json), or the project's (`project`, kept in its main `.par`). Both
 * keep them by extension, as its prefix names it, then by the key after the prefix: `storybook` → `configDir` for
 * `storybook.configDir`. A value that doesn't fit its schema reads as the default, with a note the extension's page
 * shows.
 */

/** Settings as settings.json or a `.par` keeps them: by extension, as its prefix names it, then by key after it. */
export type StoredSettings = Record<string, Record<string, JsonValue>>

/** What an extension's settings read as: each one's value by its full key, and a note for each that didn't fit. */
export interface ReadExtensionSettings {
  values: Record<string, SettingValue>
  /** One sentence for each value that didn't fit its schema, and so reads as its default. */
  problems: string[]
}

/** A setting's key as settings.json and a `.par` keep it: without the prefix, as `configDir`. */
export function storedKey(prefix: string, key: string): string {
  return key.startsWith(`${prefix}.`) ? key.slice(prefix.length + 1) : key
}

/** What a setting is when nothing sets it: its default, else its first choice, else its type's empty value. */
export function defaultOf(setting: SettingContribution): SettingValue {
  if (setting.default !== undefined) {
    return setting.default
  }

  if (setting.enum?.[0] !== undefined) {
    return setting.enum[0]
  }

  switch (setting.type) {
    case "string":
      return ""
    case "number":
      return 0
    case "boolean":
      return false
  }
}

/**
 * An extension's settings: each `app` one from the person's values, each `project` one from the project's, and each
 * that's unset or doesn't fit at its default.
 */
export function readExtensionSettings(
  prefix: string,
  declared: Record<string, SettingContribution> | undefined,
  stored: { app?: Record<string, JsonValue>; project?: Record<string, JsonValue> }
): ReadExtensionSettings {
  const values: Record<string, SettingValue> = {}
  const problems: string[] = []

  for (const [key, setting] of Object.entries(declared ?? {})) {
    const value = stored[setting.scope]?.[storedKey(prefix, key)]

    if (value === undefined) {
      values[key] = defaultOf(setting)
    } else if (fits(setting, value)) {
      values[key] = value
    } else {
      values[key] = defaultOf(setting)
      problems.push(`${setting.title} is set to ${JSON.stringify(value)}, which it can't take, so it's at its default.`)
    }
  }

  return { values, problems }
}

/** The keys whose values differ between two reads, with their values after. */
export function changedValues(
  before: Record<string, SettingValue>,
  after: Record<string, SettingValue>
): Record<string, SettingValue> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key] !== value))
}
