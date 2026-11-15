import { z } from "zod"
import {
  type AppSettings,
  defaultSettings,
  type ExtensionSettings,
  type ExtensionSettingsChange,
  type SettingKey,
  type SettingsChange,
  settingKeys,
  settingValues
} from "./app-settings.ts"
import { type SystemChange, type SystemSettings, systemOf, withSystemChange } from "./system-settings.ts"

/** What `settings.json` gives: every setting, and the problems with what it holds, for Settings to show. */
export interface ReadSettings {
  values: AppSettings
  /** Settings whose saved value didn't read, and so are at their default. */
  badValues: SettingKey[]
  /** Extensions' `app` settings, by extension and then key, unchecked: each extension's schema checks its own. */
  extensions: ExtensionSettings
  /** What main alone keeps: the diagnostics level, Get beta updates and the install ID. */
  system: SystemSettings
  /** Why the file couldn't be read at all, when it couldn't. Its values are then the defaults. */
  problem?: string
}

const jsonObject = z.record(z.string(), z.json())

type FileObject = z.infer<typeof jsonObject>

/** The file's text as an object of its keys, or why it isn't one. No text, as for a missing file, is an empty one. */
function parse(text: string | undefined): { object: FileObject } | { problem: string } {
  if (text === undefined || text.trim() === "") {
    return { object: {} }
  }

  let json: unknown

  try {
    json = JSON.parse(text)
  } catch (error) {
    return { problem: `settings.json isn't JSON: ${error instanceof Error ? error.message : String(error)}` }
  }

  const object = jsonObject.safeParse(json)

  return object.success ? { object: object.data } : { problem: "settings.json isn't an object of settings." }
}

/** One extension's settings, by key. */
const oneExtension = z.record(z.string(), z.json())

/** Extensions' settings as `object` holds them under `extensions`, leaving out an entry that isn't an object of them. */
function extensionsOf(object: FileObject): ExtensionSettings {
  const read = jsonObject.safeParse(object.extensions)

  if (!read.success) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(read.data).flatMap(([id, settings]) => {
      const each = oneExtension.safeParse(settings)

      return each.success ? [[id, each.data]] : []
    })
  )
}

/** Each setting `object` holds, each that's missing or doesn't read at its default. */
function valuesOf(object: FileObject): Pick<ReadSettings, "values" | "badValues" | "extensions" | "system"> {
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
  return {
    values: Object.fromEntries(entries) as AppSettings,
    badValues,
    extensions: extensionsOf(object),
    system: systemOf(object)
  }
}

/**
 * The settings `text` holds, from `settings.json`, or none when there's no file. One value that doesn't read is put at
 * its default without resetting the rest, and keys this version doesn't know are passed over.
 */
export function readSettings(text: string | undefined): ReadSettings {
  const parsed = parse(text)

  if ("problem" in parsed) {
    return {
      values: { ...defaultSettings },
      badValues: [],
      extensions: {},
      system: systemOf({}),
      problem: parsed.problem
    }
  }

  return valuesOf(parsed.object)
}

/** One change to `settings.json`: some of Parity's own settings, and some of extensions'. */
export type FileChange = SettingsChange & { extensions?: ExtensionSettingsChange; system?: SystemChange }

/**
 * Extensions' settings after a change: each key it names set, or taken out to put it back to its default, and an
 * extension left with none taken out.
 */
export function withExtensionChange(
  settings: ExtensionSettings,
  change: ExtensionSettingsChange | undefined
): ExtensionSettings {
  if (!change) {
    return settings
  }

  const next: ExtensionSettings = { ...settings }

  for (const [id, keys] of Object.entries(change)) {
    const own = { ...next[id] }

    for (const [key, value] of Object.entries(keys)) {
      if (value === null) {
        delete own[key]
      } else {
        own[key] = value
      }
    }

    if (Object.keys(own).length > 0) {
      next[id] = own
    } else {
      delete next[id]
    }
  }

  return next
}

/**
 * `settings.json`'s text after one change: each setting in it set, or taken out to put it back to its default, and every
 * other key as it was. Throws for text that doesn't parse, which must never be written over.
 */
export function changeSettings(text: string | undefined, change: FileChange): string {
  const parsed = parse(text)

  if ("problem" in parsed) {
    throw new Error(parsed.problem)
  }

  const next: FileObject = { ...parsed.object }

  const { extensions, system, ...own } = change

  // Only what the change names is written, and a new install ID only when the file has none that reads.
  if (system) {
    const after = withSystemChange(systemOf(parsed.object), system)

    if (system.diagnostics !== undefined) {
      next.diagnostics = after.diagnostics
    }

    if (system.betaUpdates !== undefined) {
      next.betaUpdates = after.betaUpdates
    }

    if ((system.installId !== undefined || system.newInstallId !== undefined) && after.installId !== undefined) {
      next.installId = after.installId
    }
  }

  if (extensions) {
    const after = withExtensionChange(extensionsOf(parsed.object), extensions)

    if (Object.keys(after).length > 0) {
      next.extensions = after
    } else {
      delete next.extensions
    }
  }

  for (const [key, value] of Object.entries(own)) {
    if (value === undefined) {
      continue
    }

    if (value === null) {
      delete next[key]
    } else {
      next[key] = value
    }
  }

  return `${JSON.stringify(next, null, 2)}\n`
}

/** The settings whose values differ between `before` and `after`, with their values after. */
export function changedSettings(before: AppSettings, after: AppSettings): Partial<AppSettings> {
  return Object.fromEntries(
    settingKeys
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => [key, after[key]])
  )
}
