import {
  type AppSettings,
  defaultSettings,
  type SettingKey,
  type SettingsChange,
  settingKeys,
  settingValues
} from "./app-settings.ts"
import { type FileObject, fileText, objectToChange, parseObject } from "./json-object.ts"

/** What `settings.json` gives: every setting, and the problems with what it holds, for Settings to show. */
export interface ReadSettings {
  values: AppSettings
  /** Settings whose saved value didn't read, and so are at their default. */
  badValues: SettingKey[]
  /** Why the file couldn't be read at all, when it couldn't. Its values are then the defaults. */
  problem?: string
}

/** Each setting `object` holds, each that's missing or doesn't read at its default. */
function valuesOf(object: FileObject): Pick<ReadSettings, "values" | "badValues"> {
  const badValues: SettingKey[] = []

  const entries = settingKeys.map((key) => {
    if (!(key in object)) {
      return [key, defaultSettings[key]]
    }

    const read = settingValues[key].safeParse(object[key])

    if (!read.success) {
      badValues.push(key)

      return [key, defaultSettings[key]]
    }

    return [key, read.data]
  })

  // SAFETY: each setting's value is its default or a value its own schema read.
  return { values: Object.fromEntries(entries) as AppSettings, badValues }
}

/**
 * The settings `text` holds, from `settings.json`, or none when there's no file. One value that doesn't read is put at
 * its default without resetting the rest, and keys this version doesn't know are passed over.
 */
export function readSettings(text: string | undefined): ReadSettings {
  const parsed = parseObject("settings.json", text)

  if ("problem" in parsed) {
    return { values: { ...defaultSettings }, badValues: [], problem: parsed.problem }
  }

  return valuesOf(parsed.object)
}

/**
 * `settings.json`'s text after one change: each setting in it set, or taken out to put it back to its default, and every
 * other key as it was. Throws for text that doesn't parse, which must never be written over.
 */
export function changeSettings(text: string | undefined, change: SettingsChange): string {
  const next = objectToChange("settings.json", text)

  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) {
      continue
    }

    if (value === null) {
      delete next[key]
    } else {
      next[key] = value
    }
  }

  return fileText(next)
}

/** The settings whose values differ between `before` and `after`, with their values after. */
export function changedSettings(before: AppSettings, after: AppSettings): Partial<AppSettings> {
  return Object.fromEntries(
    settingKeys
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => [key, after[key]])
  )
}
