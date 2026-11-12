import { generate, parse, type StyleNode } from "css-tree/dist/csstree.esm"
import type { Condition, CssDeclaration, Printed, ReadBack, StylePrinter } from "./adapter.ts"

// Declarations as plain CSS, and plain CSS back into declarations: what a project without a styling framework writes,
// and the rules a frame draws a layer from. One rule set for each place the declarations apply, with a state as the end
// of the selector, a viewport as `@media` around it and a theme as an ancestor.

/** What plain CSS is written for. */
export interface CssPrinterOptions {
  /** The selector the rules are for: a class in the project's code (`.card`), or a layer on the canvas. */
  selector: string
  /**
   * Each theme's selector on the element that turns it on, by the theme's name: `{ dark: ".dark" }`. A declaration
   * for a theme that isn't here can't be written.
   */
  themes?: Readonly<Record<string, string>>
}

/** A rule set: where it applies, and its declarations in order. */
interface RuleSet {
  when: Condition
  declarations: CssDeclaration[]
}

/**
 * A printer for one selector. It prints rule sets in the order their places first appear, so the plain rule comes
 * first when a layer's own declarations do, and it reads back the rules it would have written; any other rule, and any
 * with `!important` or something besides declarations in it, is kept as it was.
 */
export function cssPrinter({ selector, themes = {} }: CssPrinterOptions): StylePrinter<string> {
  /** A theme's part of a selector: the layer inside the element that turns the theme on, or that element itself. */
  const themed = (theme: string) => `:where(${theme}, ${theme} *)`

  function selectorFor(when: Condition): string | undefined {
    const theme = when.theme === undefined ? "" : themes[when.theme]

    return theme === undefined ? undefined : `${selector}${when.state ?? ""}${theme && themed(theme)}`
  }

  /** Where a rule with this selector applies, apart from its viewport, or undefined when it isn't one of this layer's. */
  function conditionOf(written: string): Condition | undefined {
    if (!written.startsWith(selector)) {
      return undefined
    }

    const when: Condition = {}
    let state = written.slice(selector.length)

    for (const [name, theme] of Object.entries(themes)) {
      if (state.endsWith(themed(theme))) {
        when.theme = name
        state = state.slice(0, -themed(theme).length)
      }
    }

    // What's left follows the selector as a state does (`:hover`, `[open]`). Anything else is another selector that
    // happens to start the same way (`.card-title`, `.card > p`).
    if (state !== "" && !/^[:[]\S*$/.test(state)) {
      return undefined
    }

    if (state !== "") {
      when.state = state
    }

    return when
  }

  return {
    print(declarations): Printed<string> {
      const sets = new Map<string, RuleSet>()
      const unwritten: CssDeclaration[] = []

      for (const declaration of declarations) {
        const when = declaration.when ?? {}
        const written = selectorFor(when)

        if (written === undefined) {
          unwritten.push(declaration)
          continue
        }

        const place = `${when.viewport ?? ""}\n${written}`
        const set = sets.get(place) ?? { when, declarations: [] }
        set.declarations.push(declaration)
        sets.set(place, set)
      }

      const rules = [...sets.values()].map(({ when, declarations: own }) => {
        const indent = when.viewport === undefined ? "" : "  "
        const lines = own.map(({ property, value }) => `${indent}  ${property}: ${value};`)
        const rule = `${indent}${selectorFor(when)} {\n${lines.join("\n")}\n${indent}}`

        return when.viewport === undefined ? rule : `@media (width >= ${when.viewport}) {\n${rule}\n}`
      })

      return { output: rules.length > 0 ? `${rules.join("\n\n")}\n` : "", unwritten }
    },

    read(css): ReadBack<string> {
      const declarations: CssDeclaration[] = []
      const unread: string[] = []

      /** Reads one rule into `declarations`, or says it couldn't. `viewport` is the width of the `@media` around it. */
      const readRule = (node: StyleNode, viewport?: string): boolean => {
        const when = node.type === "Rule" ? conditionOf(node.prelude.value.trim()) : undefined

        if (node.type !== "Rule" || !when) {
          return false
        }

        const own: CssDeclaration[] = []
        const place = viewport === undefined ? when : { ...when, viewport }

        for (const child of node.block.children.toArray()) {
          if (child.type !== "Declaration" || child.important !== false) {
            return false
          }

          const declaration = { property: child.property, value: child.value.value.trim() }
          own.push(Object.keys(place).length > 0 ? { ...declaration, when: place } : declaration)
        }

        declarations.push(...own)

        return true
      }

      for (const node of parse(css, {
        parseValue: false,
        parseRulePrelude: false,
        parseAtrulePrelude: false
      }).children.toArray()) {
        const media = node.type === "Atrule" && node.name === "media" ? node : undefined
        const query = media?.prelude?.value.trim()
        const viewport = viewportOf(query)
        const inside = media?.block?.children.toArray() ?? []

        if (query === undefined || viewport === undefined || inside.length === 0) {
          if (!readRule(node)) {
            unread.push(generate(node))
          }

          continue
        }

        // A width's rules are read one by one, so a rule that isn't this layer's stays, inside the same `@media`.
        const kept = inside.filter((rule) => !readRule(rule, viewport))

        if (kept.length > 0) {
          unread.push(`@media ${query}{${kept.map((rule) => generate(rule)).join("")}}`)
        }
      }

      return { declarations, unread: unread.join("\n") }
    }
  }
}

/** The least width a media query asks for, when that's all it asks: `(width >= 48rem)` or `(min-width: 48rem)`. */
function viewportOf(query: string | undefined): string | undefined {
  const [, range, least] =
    /^\(\s*(?:width\s*>=\s*([^)]+?)|min-width\s*:\s*([^)]+?))\s*\)$/.exec(query?.trim() ?? "") ?? []

  return range ?? least
}
