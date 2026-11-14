import { pageOf, pages, settings } from "./data.ts"

export interface Hit {
  page: string
  setting?: string
}

/** What a search finds: pages by name, then settings by label, description, page or extension. */
export function search(query: string): Hit[] {
  const pageHits = pages.filter((page) => matchWords(page.label, query) > 0).map((page) => ({ page: page.id }))

  const settingHits = settings
    .filter((setting) => setting.control.kind !== "jump")
    .filter((setting) =>
      [setting.label, setting.detail ?? "", pageOf(setting.page).label].some((text) => matchWords(text, query) > 0)
    )
    .map((setting) => ({ page: setting.page, setting: setting.id }))

  return [...settingHits, ...pageHits]
}

/** Whether every typed word starts a word in the text, as Search actions matches. */
function matchWords(text: string, query: string): number {
  const words = text.toLowerCase().split(/[^a-z0-9.]+/)
  const typed = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return typed.length > 0 && typed.every((part) => words.some((word) => word.startsWith(part))) ? 1 : 0
}
