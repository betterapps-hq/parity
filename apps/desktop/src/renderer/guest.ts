import { type EnclosingAtRule, type Guest, prepareCanvasCss, type ThemeVariable } from "@parity-app/core"
import { extractTokens, themeFallbackCss, themeOfSelector, type Token, type TokenChange } from "@parity-app/tokens"

export interface LoadedGuest {
  guest: Guest
  /** Adopted by every rendered mode's shadow root. */
  sheet: CSSStyleSheet
  /** The project's design tokens: its compiled CSS's variables plus its styling framework's full theme. */
  tokens: Token[]
}

interface Loading {
  loaded: Promise<LoadedGuest>
  /** The stylesheet the document adopted for the guest's rules that can't go in a shadow root, once made. */
  global?: CSSStyleSheet
  released?: boolean
}

const guests = new Map<string, Loading>()

/**
 * Imports a project's guest module from its builder and prepares its styles for shadow roots. Theme variables the
 * compiled CSS left out are declared too, so designs can use any token. Each URL loads once per page until it's
 * released.
 */
export function loadGuest(url: string, theme: readonly ThemeVariable[]): Promise<LoadedGuest> {
  let loading = guests.get(url)
  if (!loading) {
    const entry = {} as Loading
    entry.loaded = load(url, theme, entry)
    entry.loaded.catch(() => {
      if (guests.get(url) === entry) guests.delete(url)
    })
    guests.set(url, entry)
    loading = entry
  }
  return loading.loaded
}

/**
 * Lets go of a guest the page no longer draws: its entry, and the stylesheet the document adopted for it. The page keeps
 * the guest's modules, which nothing can unload, so loading the same URL again only makes its stylesheets anew.
 */
export function releaseGuest(url: string): void {
  const entry = guests.get(url)
  if (!entry) return
  guests.delete(url)
  entry.released = true
  const { global } = entry
  if (global) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== global)
}

async function load(url: string, theme: readonly ThemeVariable[], entry: Loading): Promise<LoadedGuest> {
  const guest = await importWithRetry(url)
  const css = prepareCanvasCss(guest.css, { baseUrl: new URL(url).origin })
  // Packages' stylesheets draw first, as the app imports them first, and aren't tokens: see `GuestInit.packageCss`.
  const packages = prepareCanvasCss(guest.packageCss ?? "", { baseUrl: new URL(url).origin })
  const global = new CSSStyleSheet()
  global.replaceSync(packages.global + css.global)
  if (!entry.released) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, global]
    entry.global = global
  }
  const sheet = guestSheet(themeFallbackCss(css.scoped, theme) + packages.scoped + css.scoped)
  return { guest, sheet, tokens: extractTokens(css.scoped, theme, guest.tokenCategories) }
}

/** Each guest stylesheet's CSS as compiled, which a frame drawn offscreen starts from. */
const compiled = new WeakMap<CSSStyleSheet, string>()
/** The token overrides each guest stylesheet shows now, as `showTokenOverrides` last laid them over it. */
const shown = new WeakMap<CSSStyleSheet, string>()

/** A guest's stylesheet for shadow roots, which keeps its compiled CSS for `showTokenOverrides` to go back to. */
export function guestSheet(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  compiled.set(sheet, css)
  shown.set(sheet, "[]")
  return sheet
}

/**
 * Makes a guest stylesheet its compiled CSS with exactly these token values laid over it, whatever an earlier frame
 * showed: a frame drawn offscreen gets the complete set of values that differ from the compiled CSS, so what it draws
 * never depends on which frame came before. The sheet starts again from its compiled CSS only when the set changed.
 * The canvas's own sheet is edited in place instead, by `previewToken`.
 */
export function showTokenOverrides(sheet: CSSStyleSheet, overrides: readonly TokenChange[]): void {
  const key = JSON.stringify(overrides.map(({ name, theme, value }) => [name, theme, value]))
  if (shown.get(sheet) === key) return
  const css = compiled.get(sheet)
  if (css === undefined) throw new Error("Token overrides go on a guest's stylesheet, made by guestSheet")
  // Until every value is laid over it, the sheet shows no known set, so a value that throws can't leave one claimed.
  shown.delete(sheet)
  sheet.replaceSync(css)
  for (const { name, theme, value } of overrides) previewToken(sheet, name, theme, value)
  shown.set(sheet, key)
}

/**
 * Changes a token's value in every frame at once by editing the shared stylesheet, so edits show before the
 * project's builder recompiles. `theme` is `default` or a theme as `extractTokens` names it, such as `dark`: the rules
 * edited are the ones it read that theme's values from, `.dark` or `[data-theme="dark"]` alike.
 */
export function previewToken(sheet: CSSStyleSheet, name: string, theme: string, value: string): void {
  const property = `--${name}`
  const rules: CSSStyleRule[] = []
  const collect = (list: CSSRuleList, atRules: EnclosingAtRule[]) => {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) {
        if (themeOfSelector(rule.selectorText, atRules) === theme) rules.push(rule)
      } else if ("cssRules" in rule) {
        const atRule = /^@([\w-]+)\s*([^{]*)/.exec(rule.cssText)
        const inner = atRule ? [...atRules, { name: atRule[1]!.toLowerCase(), prelude: atRule[2]!.trim() }] : atRules
        collect((rule as CSSGroupingRule).cssRules, inner)
      }
    }
  }
  collect(sheet.cssRules, [])
  const declaring = rules.filter((rule) => rule.style.getPropertyValue(property) !== "")
  if (declaring.length > 0) for (const rule of declaring) rule.style.setProperty(property, value)
  else {
    // A rule of its own, with the selector the theme already uses, so `[data-theme="dark"]` stays an attribute.
    const selector = rules[0]?.selectorText ?? (theme === "default" ? ":host" : `.${theme}`)
    sheet.insertRule(`${selector} { ${property}: ${value}; }`, sheet.cssRules.length)
  }
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
