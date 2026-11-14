import { type Extension, type Page, pages, type Setting, settings } from "./data.ts"

export type Hit =
  | { kind: "page"; page: Page }
  | { kind: "extension"; extension: Extension }
  /** `keyword` is the word it matched by when its own text didn't match, to say why it's listed. */
  | { kind: "setting"; setting: Setting; keyword?: string }

/**
 * What a search finds, best first: pages and extensions by name, then settings by label, then by another word for
 * them, then by their description or where they are.
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

  return [...places, ...ranked]
}

/** Where a setting is, as the results show it: its page, and its extension's for an extension's. */
export function placeOf(setting: Setting, installed: readonly Extension[]): string[] {
  if (setting.page.startsWith("ext:")) {
    const extension = installed.find((entry) => `ext:${entry.id}` === setting.page)

    return ["Extensions", extension?.name ?? ""]
  }

  return [pages.find((page) => page.id === setting.page)?.label ?? ""]
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

  const around = [setting.detail ?? "", ...placeOf(setting, installed)]

  return around.some((text) => matches(text, query)) ? { score: 1 } : undefined
}

/** Whether every typed word starts a word in the text, as Search actions matches. */
export function matches(text: string, query: string): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9.]+/)
  const typed = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return typed.length > 0 && typed.every((part) => words.some((word) => word.startsWith(part)))
}
