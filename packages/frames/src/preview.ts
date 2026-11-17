/*
 * Style previews on route boards (docs/proposals/route-frames.md, "Code changes and previews"): token values edited and
 * not yet saved, as CSS every copy of a project's routes and their live pages show over the page's own stylesheets, and
 * which pages keep themselves up to date after a code change.
 */

/** What a custom property's name may be. */
const customProperty = /^--[\w-]+$/

/** What would end a declaration's value, or the rule, early. */
const unsafeValue = /[;{}<>\\]|\/\*/

/** Elements a snapshot leaves out, which draw nothing or whose sheets are collected apart, so copies' ids don't count them. */
export const skippedTags: ReadonlySet<string> = new Set([
  "script",
  "style",
  "link",
  "meta",
  "template",
  "noscript",
  "base"
])

/** A token's value previewed in one of its themes: `default`, or a theme the page turns on with a class on its root. */
export interface TokenPreview {
  name: string
  theme: string
  value: string
}

/** What a theme's name may be, as a class on the page's root. */
const themeName = /^[\w-]+$/

/**
 * Previewed token values as CSS custom properties, for a copy (`"copy"`), where the page's root rules are on the copy's
 * host and its body stand-in, and a theme's class is on the host, the element around the body and the body stand-in, or
 * for the live page (`"page"`), on its root. A default value leaves out roots with one of `themes`' classes, so a theme's
 * own value still wins there; a theme's value is declared where the theme's class is. Values that would end their
 * declaration early, and themes that aren't a class's name, are left out.
 */
export function tokenPreviewCss(
  tokens: readonly TokenPreview[],
  themes: readonly string[],
  scope: "copy" | "page"
): string {
  const classes = themes.flatMap((theme) => (theme !== "default" && themeName.test(theme) ? [`.${theme}`] : []))
  const others = classes.length > 0 ? `:not(${classes.join(", ")})` : ""

  const selectorOf = (theme: string): string | undefined => {
    if (theme === "default") {
      return scope === "page"
        ? `:root${others}`
        : `:host${classes.length > 0 ? `(${others})` : ""}, [data-copy-root]${others}, [data-canvas-body]${others}`
    }

    if (!themeName.test(theme)) {
      return undefined
    }

    return scope === "page"
      ? `:root.${theme}`
      : `:host(.${theme}), [data-copy-root].${theme}, [data-canvas-body].${theme}`
  }

  const byTheme = new Map<string, string[]>()

  for (const { name, theme, value } of tokens) {
    if (customProperty.test(`--${name}`) && !unsafeValue.test(value)) {
      byTheme.set(theme, [...(byTheme.get(theme) ?? []), `--${name}: ${value.trim()};`])
    }
  }

  return [...byTheme]
    .flatMap(([theme, declarations]) => {
      const selector = selectorOf(theme)

      return selector ? [`${selector} { ${declarations.join(" ")} }`] : []
    })
    .join("\n")
}

/** The page routers whose pages take the builder's hot updates in place, so a code change needn't start them again. */
const updatingRouters = new Set(["nextjs"])

/**
 * Whether a page keeps itself up to date after a code change, from the page router it said it has (`page.ready`):
 * Next's pages take its hot updates. Under Vite, with hot updates off, and the webpack-compatible builders, a page keeps
 * the modules it loaded, so Parity starts it again.
 */
export function updatesItself(router: string | null | undefined): boolean {
  return router !== null && router !== undefined && updatingRouters.has(router)
}
