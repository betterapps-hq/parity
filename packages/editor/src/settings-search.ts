/** A setting as Settings' search reads it: what it's called, other words for it, its description and where it is. */
export interface SearchableSetting {
  id: string
  label: string
  /** Other words people search for it by. */
  keywords?: readonly string[]
  detail?: string
  /** The page or extension it's on, by name. */
  place: string
}

/** A setting a search found, best first. `keyword` is the other word it matched by, when its own text didn't. */
export interface SettingMatch {
  id: string
  score: number
  keyword?: string
}

/** Whether every typed word starts a word in the text, as Search actions matches. */
export function matchesWords(text: string, query: string): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9.]+/)
  const typed = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return typed.length > 0 && typed.every((part) => words.some((word) => word.startsWith(part)))
}

/**
 * The settings a search finds, best first: by label (its start first), then by another word for it, then by where it
 * is, then by its description. Ties keep the order the settings were given in.
 */
export function rankSettings(settings: readonly SearchableSetting[], query: string): SettingMatch[] {
  if (!query.trim()) {
    return []
  }

  return settings
    .flatMap((setting): SettingMatch[] => {
      const found = scoreOf(setting, query)

      return found ? [{ id: setting.id, ...found }] : []
    })
    .sort((a, b) => b.score - a.score)
}

function scoreOf(setting: SearchableSetting, query: string): Omit<SettingMatch, "id"> | undefined {
  if (matchesWords(setting.label, query)) {
    return { score: setting.label.toLowerCase().startsWith(query.trim().toLowerCase()) ? 4 : 3 }
  }

  const keyword = setting.keywords?.find((word) => matchesWords(word, query))

  if (keyword) {
    return { score: 2, keyword }
  }

  // Where it is counts for more than its description: "story" finds Storybook's settings before one that names it.
  if (matchesWords(setting.place, query)) {
    return { score: 1.5 }
  }

  return matchesWords(setting.detail ?? "", query) ? { score: 1 } : undefined
}

/** Values as a sentence lists them: `PNG 1x`, `PNG 1x and PNG 2x`, `A, B and C`. */
export function listInWords(values: readonly string[]): string {
  if (values.length < 2) {
    return values[0] ?? ""
  }

  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`
}
