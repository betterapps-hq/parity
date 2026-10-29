import {
  extractTokens,
  type Guest,
  prepareCanvasCss,
  themeFallbackCss,
  type ThemeVariable,
  type Token
} from "@parity/core"

export interface LoadedGuest {
  guest: Guest
  /** Adopted by every rendered mode's shadow root. */
  sheet: CSSStyleSheet
  /** The project's design tokens: its compiled CSS's variables plus its styling framework's full theme. */
  tokens: Token[]
}

const guests = new Map<string, Promise<LoadedGuest>>()

/**
 * Imports a project's guest module from its builder and prepares its styles for shadow roots. Theme variables the
 * compiled CSS left out are declared too, so designs can use any token. Each URL loads once per page.
 */
export function loadGuest(url: string, theme: readonly ThemeVariable[]): Promise<LoadedGuest> {
  let loading = guests.get(url)
  if (!loading) {
    loading = load(url, theme)
    loading.catch(() => guests.delete(url))
    guests.set(url, loading)
  }
  return loading
}

async function load(url: string, theme: readonly ThemeVariable[]): Promise<LoadedGuest> {
  const guest = await importWithRetry(url)
  const css = prepareCanvasCss(guest.css, { baseUrl: new URL(url).origin })
  // Packages' stylesheets draw first, as the app imports them first, and aren't tokens: see `GuestInit.packageCss`.
  const packages = prepareCanvasCss(guest.packageCss ?? "", { baseUrl: new URL(url).origin })
  const global = new CSSStyleSheet()
  global.replaceSync(packages.global + css.global)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, global]
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(themeFallbackCss(css.scoped, theme) + packages.scoped + css.scoped)
  return { guest, sheet, tokens: extractTokens(css.scoped, theme, guest.tokenCategories) }
}

/**
 * Changes a token's value in every frame at once by editing the shared stylesheet, so edits show before the
 * project's builder recompiles. `theme` is `default` or a theme class such as `dark`.
 */
export function previewToken(sheet: CSSStyleSheet, name: string, theme: string, value: string): void {
  const property = `--${name}`
  const wanted = theme === "default" ? [":host", ":root"] : [`.${theme}`]
  const rules: CSSStyleRule[] = []
  const collect = (list: CSSRuleList) => {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) {
        const parts = rule.selectorText.split(",").map((part) => part.trim())
        if (parts.some((part) => wanted.includes(part))) rules.push(rule)
      } else if ("cssRules" in rule) collect((rule as CSSGroupingRule).cssRules)
    }
  }
  collect(sheet.cssRules)
  const declaring = rules.filter((rule) => rule.style.getPropertyValue(property) !== "")
  if (declaring.length > 0) for (const rule of declaring) rule.style.setProperty(property, value)
  else
    sheet.insertRule(`${theme === "default" ? ":host" : `.${theme}`} { ${property}: ${value}; }`, sheet.cssRules.length)
}

// A builder may still be preparing dependencies on the first request, and a failed module import is cached by URL.
async function importWithRetry(url: string, attempts = 3): Promise<Guest> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const target = attempt === 0 ? url : `${url}?attempt=${attempt}`
      const module = (await import(/* @vite-ignore */ target)) as { default: Guest }
      return module.default
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  throw lastError
}
