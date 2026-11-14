import { matchesWords, rankSettings } from "@parity-app/editor"
import { keymap } from "../keymap.ts"
import { type Extension, type Page, pagesFor, type Setting, settings } from "./definitions.ts"
import type { Mark } from "./marks.tsx"
import type { SettingsData } from "./store.ts"

export type Hit =
  | { kind: "page"; page: Page }
  | { kind: "extension"; extension: Extension }
  /** `keyword` is the word it matched by when its own text didn't match, to say why it's listed. */
  | { kind: "setting"; setting: Setting; keyword?: string }
  /** A command in the keymap, whose keys can be changed where it's found. */
  | { kind: "shortcut"; command: string; label: string }

/**
 * What a search finds, best first: pages and extensions by name, then settings as the editor ranks them, then
 * shortcuts by their command's name. A project's own settings are found only while it's open and its extension runs.
 */
export function search(query: string, data: Pick<SettingsData, "project" | "extensions">): Hit[] {
  if (!query.trim()) {
    return []
  }

  const places: Hit[] = [
    ...pagesFor(data.project).flatMap((page): Hit[] =>
      matchesWords(page.label, query) ? [{ kind: "page", page }] : []
    ),
    ...data.extensions.flatMap((extension): Hit[] =>
      matchesWords(extension.name, query) ? [{ kind: "extension", extension }] : []
    )
  ]

  const searchable = settings.filter((setting) => shown(setting, data))
  const byId = new Map(searchable.map((setting) => [setting.id, setting]))

  const ranked = rankSettings(
    searchable.map((setting) => ({ ...setting, place: placeOf(setting, data.extensions).label })),
    query
  ).flatMap((match): Hit[] => {
    const setting = byId.get(match.id)

    return setting ? [{ kind: "setting", setting, keyword: match.keyword }] : []
  })

  const shortcuts = Object.entries(keymap).flatMap(([command, binding]): Hit[] =>
    matchesWords(binding.label, query) ? [{ kind: "shortcut", command, label: binding.label }] : []
  )

  return [...places, ...ranked, ...shortcuts]
}

/** Whether Settings shows a setting: a project's own only while the project is open and its extension runs there. */
function shown(setting: Setting, data: Pick<SettingsData, "project" | "extensions">): boolean {
  if (setting.scope !== "project") {
    return true
  }

  return !!data.project && data.extensions.some((entry) => entry.running && `ext:${entry.id}` === setting.page)
}

/** Where a setting is: its page, or its extension's page for an extension's. */
export interface Place {
  id: string
  label: string
  icon: Mark
}

export function placeOf(setting: Setting, installed: readonly Extension[]): Place {
  const extension = installed.find((entry) => `ext:${entry.id}` === setting.page)

  if (extension) {
    return { id: setting.page, label: extension.name, icon: extension.icon }
  }

  const page = pagesFor(undefined).find((entry) => entry.id === setting.page) ?? pagesFor(undefined)[0]!

  return { id: page.id, label: page.label, icon: page.icon }
}
