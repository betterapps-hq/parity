// The contract each styling framework's adapter implements: a layer's declarations as that framework's code, and its
// code back into declarations. CSS is what both sides agree on, so an adapter never sees a stored style.

/**
 * Where a declaration applies, in CSS's own terms, so every framework reads it the same way. Unset parts always apply.
 */
export interface Condition {
  /**
   * A state of the layer, as the selector that follows it: `:hover`, `:focus-visible`, `[data-state="open"]`,
   * `:nth-child(3)`.
   */
  state?: string
  /** The least width it applies from, as a CSS length (`48rem`, `900px`): code is written mobile-first. */
  viewport?: string
  /** The theme it applies in, by the theme's name (`dark`). */
  theme?: string
}

/** One CSS declaration, and where it applies. */
export interface CssDeclaration {
  /** As CSS spells it: `background-color`, `align-self`. */
  property: string
  /** As CSS reads it: `var(--primary)`, `calc(var(--spacing) * 4)`. */
  value: string
  /** The state, viewport or theme it applies in. Unset, it always applies. */
  when?: Condition
}

/** What a printer made of some declarations: its code, and the declarations it has no way to write. */
export interface Printed<Output> {
  output: Output
  /** Declarations the framework can't say, such as one for a theme the project's code has no selector for. */
  unwritten: CssDeclaration[]
}

/** What a printer read from some code: its declarations, and the code it couldn't read, kept as it was. */
export interface ReadBack<Output> {
  declarations: CssDeclaration[]
  unread: Output
}

/** One styling framework's way of writing declarations, both ways. `Output` is its code: classes, or CSS text. */
export interface StylePrinter<Output> {
  /** Declarations as this framework writes them. */
  print(declarations: readonly CssDeclaration[]): Printed<Output>
  /** This framework's code back into declarations. */
  read(output: Output): ReadBack<Output>
}

/** Whether two declarations apply in the same place. */
export function sameCondition(a: Condition | undefined, b: Condition | undefined): boolean {
  return a?.state === b?.state && a?.viewport === b?.viewport && a?.theme === b?.theme
}

/**
 * A value as it compares: CSS reads `span 2/span 2` and `span 2 / span 2` alike, and a framework may print either, so
 * whitespace that separates nothing is dropped and the rest is single spaces.
 */
export function comparableValue(value: string): string {
  return value
    .trim()
    .replaceAll(/\s+/g, " ")
    .replaceAll(/ ?([,/()]) ?/g, "$1")
}
