import type { ClassPrinter } from "@parity-app/core"
import {
  comparableValue,
  type Condition,
  type CssDeclaration,
  type Printed,
  type ReadBack,
  sameCondition
} from "@parity-app/style-schema"
import type { CssNode, DesignSystem } from "./design-system.ts"

// Declarations as Tailwind classes, and classes back into declarations, by the rules in
// docs/proposals/design-options-code.md. It keeps no table of utilities. Every class starts as an arbitrary property
// (`[padding:calc(var(--spacing)*4)]`), which Tailwind always takes; the project's own Tailwind then spells it as its
// tools would (`p-4`), and a class is only written once reading it back gives the declaration it came from, in the
// same text or in text Tailwind takes for the same value.

/** What the printer needs to know about a project beyond its Tailwind. */
export interface PrinterOptions {
  /** The themes whose variants a class may carry, by name. A theme is read back only when it's listed. */
  themes?: readonly string[]
}

/**
 * The types Tailwind's variable shorthand can name, which it needs where a utility takes more than one
 * (`text-(length:--font-size-body)`), since it otherwise reads the variable as a color.
 */
const typeHints = ["length", "color", "family-name", "image", "number", "percentage", "position", "bg-size", "angle"]

/** Values that show which utility writes a property: a color, a length and a name. */
const probes = ["red", "1px", "x"]

/** A value as an arbitrary value holds it: spaces as underscores, and its own underscores escaped. */
function arbitrary(value: string): string {
  return value
    .trim()
    .replaceAll("_", String.raw`\_`)
    .replaceAll(/\s+/g, "_")
}

/**
 * The part of a rule's selector after the class itself, which is what its variants add (`:hover`,
 * `[data-state="open"]`), or undefined when the selector doesn't start with the class.
 */
function selectorSuffix(selector: string, name: string): string | undefined {
  if (!selector.startsWith(".")) {
    return undefined
  }

  let read = ""
  let at = 1

  while (at < selector.length && read.length < name.length) {
    if (selector[at] !== "\\") {
      read += selector[at]
      at += 1
      continue
    }

    // An escape is a backslash before the character, or before its code point in hex with a space after.
    const hex = /^[\da-f]{1,6} ?/i.exec(selector.slice(at + 1))

    if (hex) {
      read += String.fromCodePoint(Number.parseInt(hex[0], 16))
      at += 1 + hex[0].length
    } else {
      read += selector[at + 1] ?? ""
      at += 2
    }
  }

  return read === name ? selector.slice(at) : undefined
}

interface CompiledClass {
  declarations: { property: string; value: string }[]
  /** The `@media` queries around the rule, outermost first. */
  media: string[]
  suffix: string
}

/**
 * A project's Tailwind, loaded twice. Asking a design system for a canonical spelling changes what it compiles
 * afterwards: with `@theme inline`, `bg-primary` compiles to `var(--primary)` before and `var(--color-primary)` after
 * (Tailwind 4.3.3). So one copy only ever spells, and the other compiles, reads and sorts.
 */
export interface DesignSystems {
  compiles: DesignSystem
  spells: DesignSystem
}

/**
 * A project's Tailwind as a printer: declarations to classes, sorted as Prettier's Tailwind plugin sorts them, classes
 * back to declarations, and classes as the CSS the project's build would make of them.
 */
export function tailwindPrinter(systems: DesignSystems, options: PrinterOptions = {}): ClassPrinter {
  const system = systems.compiles

  const breakpoints = new Map<string, string>()

  for (const [name, { value }] of system.theme.entries()) {
    if (name.startsWith("--breakpoint-")) {
      breakpoints.set(name.slice("--breakpoint-".length), value)
    }
  }

  const themes = (options.themes ?? ["dark"]).filter((theme) => system.parseVariant(theme) !== null)

  /** What one class compiles to here, when it's one rule of plain declarations. */
  function compiled(name: string): CompiledClass | undefined {
    const media: string[] = []
    let nodes = (system.candidatesToAst([name])[0] ?? []).filter(notRegistration)

    for (let [only] = nodes; nodes.length === 1 && only?.kind === "at-rule" && only.name === "@media"; [only] = nodes) {
      media.push(only.params)
      nodes = only.nodes.filter(notRegistration)
    }

    const [rule] = nodes
    const suffix = rule?.kind === "rule" ? selectorSuffix(rule.selector, name) : undefined

    if (nodes.length !== 1 || rule?.kind !== "rule" || suffix === undefined) {
      return undefined
    }

    const declarations: CompiledClass["declarations"] = []

    for (const node of rule.nodes) {
      if (node.kind !== "declaration" || node.value === undefined || node.important) {
        return undefined
      }

      // Tailwind notes some values in variables of its own (`--tw-tracking`) for its other utilities to read; they
      // draw nothing. A utility that draws from them (`box-shadow: var(--tw-shadow)`) doesn't say what it draws.
      if (node.property.startsWith("--tw-")) {
        continue
      }

      if (node.value.includes("--tw-")) {
        return undefined
      }

      declarations.push({ property: node.property, value: node.value })
    }

    return declarations.length > 0 ? { declarations, media, suffix } : undefined
  }

  /** What each theme's variant adds to a selector, by theme. */
  const themeSuffixes = new Map(
    themes.flatMap((theme) => {
      const suffix = compiled(`${theme}:flex`)?.suffix

      return suffix ? [[theme, suffix] as const] : []
    })
  )

  /** Where a compiled class applies, or undefined when it's somewhere a `Condition` can't say. */
  function conditionOf({ media, suffix }: CompiledClass): Condition | undefined {
    const when: Condition = {}
    let state = suffix

    for (const [theme, added] of themeSuffixes) {
      if (state.includes(added)) {
        when.theme = theme
        state = state.replace(added, "")
      }
    }

    for (const query of media) {
      const width = /^\(width >= ([^)]+)\)$/.exec(query)?.[1]

      // Tailwind keeps hover styles from touch screens; that's how it writes `:hover`, not a condition of its own.
      if (query === "(hover: hover)" && state.includes(":hover")) {
        continue
      }

      if (width === undefined || when.viewport !== undefined) {
        return undefined
      }

      when.viewport = width
    }

    if (state !== "") {
      when.state = state
    }

    return when
  }

  /** The declarations one class comes to, or undefined when it can't be read. */
  function readClass(name: string): CssDeclaration[] | undefined {
    const rule = system.parseCandidate(name).length > 0 ? compiled(name) : undefined
    const when = rule && conditionOf(rule)

    if (!rule || !when) {
      return undefined
    }

    return rule.declarations.map((declaration) =>
      Object.keys(when).length > 0 ? { ...declaration, when } : declaration
    )
  }

  /**
   * Whether two values of a property are the same value. Tailwind writes some values another way than they're declared
   * (`m-0` is `0px`, `gap-1` is `var(--spacing)`, `font-medium` is `var(--font-weight-medium)`), so where the text
   * differs it's Tailwind that's asked: they're the same when it spells both as one class.
   */
  function sameValue(property: string, a: string, b: string): boolean {
    return (
      comparableValue(a) === comparableValue(b) ||
      canonical(`[${property}:${arbitrary(a)}]`) === canonical(`[${property}:${arbitrary(b)}]`)
    )
  }

  /** Whether a class reads back as the declaration it's written for, and nothing else. */
  function writes(name: string, declaration: CssDeclaration): boolean {
    const read = readClass(name)
    const [only] = read ?? []

    return (
      read?.length === 1 &&
      only?.property === declaration.property &&
      sameValue(declaration.property, only.value, declaration.value) &&
      sameCondition(only.when, declaration.when)
    )
  }

  /** The variants that put a class where a declaration applies, outermost first, or undefined when there's no way. */
  function variantsFor(when: Condition | undefined): string[] | undefined {
    const variants: string[] = []

    if (when?.viewport !== undefined) {
      const named = [...breakpoints].find(([, width]) => width === when.viewport)?.[0]
      variants.push(named ?? `min-[${arbitrary(when.viewport)}]`)
    }

    if (when?.theme !== undefined) {
      if (!themeSuffixes.has(when.theme)) {
        return undefined
      }

      variants.push(when.theme)
    }

    if (when?.state !== undefined) {
      // A pseudo-class Tailwind has a variant for is written as that variant (`hover:`), whatever it adds around it.
      const named = /^:([a-z-]+)$/.exec(when.state)?.[1]
      const known = named !== undefined && compiled(`${named}:flex`)?.suffix === when.state

      variants.push(known ? named : `[&${arbitrary(when.state)}]`)
    }

    return variants
  }

  /** The utility that writes a property, by its name before the value (`bg`), or undefined when it has none. */
  function utilityRoot(property: string, spelled: string): string | undefined {
    for (const name of [spelled, ...probes.map((probe) => canonical(`[${property}:${probe}]`))]) {
      const root = system.parseCandidate(name).find((candidate) => candidate.kind === "functional")?.root

      if (root !== undefined) {
        return root
      }
    }

    return undefined
  }

  const spellings = new Map<string, string>()

  function canonical(name: string): string {
    const spelling = spellings.get(name) ?? systems.spells.canonicalizeCandidates([name])[0] ?? name
    spellings.set(name, spelling)

    return spelling
  }

  /**
   * The ways to write a token's variable with a property's utility, most readable first: the token as the utility's
   * own value (`bg-primary` for `--primary`, `rounded-md` for `--radius-md`), then the variable shorthand, bare and
   * with each type it can name.
   */
  function tokenSpellings(property: string, value: string, spelled: string): string[] {
    const token = /^var\(--([\w-]+)\)$/.exec(value.trim())?.[1]
    const root = token === undefined ? undefined : utilityRoot(property, spelled)

    if (token === undefined || root === undefined) {
      return []
    }

    const parts = token.split("-")
    const names = parts.map((_part, index) => parts.slice(index).join("-"))

    return [
      ...names.map((name) => `${root}-${name}`),
      `${root}-(--${token})`,
      ...typeHints.map((hint) => `${root}-(${hint}:--${token})`)
    ]
  }

  /** The class for one declaration, or undefined when nothing Tailwind compiles says it. */
  function classFor(declaration: CssDeclaration): string | undefined {
    const variants = variantsFor(declaration.when)

    if (!variants) {
      return undefined
    }

    const within = (utility: string) => [...variants, utility].join(":")
    const plain = `[${declaration.property}:${arbitrary(declaration.value)}]`
    const spelled = canonical(plain)
    const tokens = tokenSpellings(declaration.property, declaration.value, spelled)
    const root = utilityRoot(declaration.property, spelled)
    // Where Tailwind's own spelling is another value here (`rounded-lg` for `0.25rem`), the value as written.
    const valued = root === undefined ? [] : [`${root}-[${arbitrary(declaration.value)}]`]

    for (const utility of [...tokens, spelled, ...valued, plain]) {
      const name = canonical(within(utility))

      for (const candidate of new Set([name, within(utility)])) {
        if (writes(candidate, declaration)) {
          return candidate
        }
      }
    }

    return undefined
  }

  /** Classes in the order Prettier's Tailwind plugin gives them: ones Tailwind doesn't know first, as it leaves them. */
  function sorted(classes: readonly string[]): string[] {
    const order = new Map(system.getClassOrder([...classes]))
    const rank = (name: string) => order.get(name) ?? -1n

    return classes.toSorted((a, b) => (rank(a) < rank(b) ? -1 : Number(rank(a) > rank(b))))
  }

  return {
    print(declarations): Printed<string[]> {
      const classes = new Set<string>()
      const unwritten: CssDeclaration[] = []

      for (const declaration of declarations) {
        const name = classFor(declaration)

        if (name === undefined) {
          unwritten.push(declaration)
        } else {
          classes.add(name)
        }
      }

      return { output: sorted([...classes]), unwritten }
    },
    read(classes): ReadBack<string[]> {
      const declarations: CssDeclaration[] = []
      const unread: string[] = []

      for (const name of classes) {
        const read = readClass(name)

        if (read) {
          declarations.push(...read)
        } else {
          unread.push(name)
        }
      }

      return { declarations, unread }
    },
    css(classes): string {
      // The classes' own order is the order their rules have in a build, which decides between two of the same weight.
      const rules = system
        .candidatesToCss(sorted([...new Set(classes)]))
        .filter((rule) => rule !== null)
        .join("")

      return rules === "" ? "" : `@layer utilities {\n${rules}}\n`
    }
  }
}

/** Whether a node is one of the `@property` registrations Tailwind writes beside a utility, which draw nothing. */
function notRegistration(node: CssNode): boolean {
  return !(node.kind === "at-rule" && node.name === "@property")
}
