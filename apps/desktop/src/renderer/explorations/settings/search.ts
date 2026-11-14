import { keymap } from "../../chrome/keymap.ts"
import { type Extension, type Page, pages, type Setting, settings } from "./data.ts"
import type { Mark } from "./marks.tsx"

export type Hit =
  | { kind: "page"; page: Page }
  | { kind: "extension"; extension: Extension }
  /** `keyword` is the word it matched by when its own text didn't match, to say why it's listed. */
  | { kind: "setting"; setting: Setting; keyword?: string }
  /** A command in the keymap, whose keys can be changed where it's found. */
  | { kind: "shortcut"; command: string; label: string }

/**
 * What a search finds, best first: pages and extensions by name, then settings by label, then by another word for
 * them, then by their description or where they are, then shortcuts by their command's name.
 */
export function search(query: string, installed: readonly Extension[]): Hit[] {
  if (!query.trim()) {
    return []
  }

  const places: Hit[] = [
    ...pages.flatMap((page): Hit[] => (matches(page.label, query) ? [{ kind: "page", page }] : [])),
    ...installed.flatMap((extension): Hit[] =>
      matches(extension.name, query) ? [{ kind: "extension", extension }] : []
    )
  ]

  const ranked = settings
    .flatMap((setting) => {
      const installedHere = !setting.page.startsWith("ext:") || installed.some((e) => `ext:${e.id}` === setting.page)
      const found = installedHere ? rank(setting, query, installed) : undefined

      return found ? [{ setting, ...found }] : []
    })
    .sort((a, b) => b.score - a.score)
    .map(({ setting, keyword }): Hit => ({ kind: "setting", setting, keyword }))

  const shortcuts = Object.entries(keymap).flatMap(([command, binding]): Hit[] =>
    matches(binding.label, query) ? [{ kind: "shortcut", command, label: binding.label }] : []
  )

  return [...places, ...ranked, ...shortcuts]
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

  const page = pages.find((entry) => entry.id === setting.page) ?? pages[0]!

  return { id: page.id, label: page.label, icon: page.icon }
}

/** How well a setting matches: higher is better. `keyword` is set when only another word for it matched. */
interface Rank {
  score: number
  keyword?: string
}

/** How well a setting matches what's typed, or nothing when it doesn't. */
function rank(setting: Setting, query: string, installed: readonly Extension[]): Rank | undefined {
  if (matches(setting.label, query)) {
    return { score: setting.label.toLowerCase().startsWith(query.trim().toLowerCase()) ? 4 : 3 }
  }

  const keyword = setting.keywords?.find((word) => matches(word, query))

  if (keyword) {
    return { score: 2, keyword }
  }

  // Where it is counts for more than its description: "story" finds Storybook's settings before a flag that names it.
  if (matches(placeOf(setting, installed).label, query)) {
    return { score: 1.5 }
  }

  return matches(setting.detail ?? "", query) ? { score: 1 } : undefined
}

/** Whether every typed word starts a word in the text, as Search actions matches. */
function matches(text: string, query: string): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9.]+/)
  const typed = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return typed.length > 0 && typed.every((part) => words.some((word) => word.startsWith(part)))
}
