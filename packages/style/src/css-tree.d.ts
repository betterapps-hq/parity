// css-tree ships no types. These are the parts `validate.ts` and `css.ts` use, from its one-file build.
declare module "css-tree/dist/csstree.esm" {
  /** A dictionary of value grammars, by property and by value type, in CSS's value definition syntax. */
  interface Grammars {
    properties?: Record<string, string>
    types?: Record<string, string>
  }

  interface Lexer {
    /** Matches a value against its property's grammar. `error` is null when it matches. */
    matchProperty(property: string, value: string): { error: Error | null }
    /** The properties and types whose grammars name a type nothing defines, or null when every one resolves. */
    validate(): { properties: string[]; types: string[] } | null
  }

  /** css-tree with `grammars` laid over its own. */
  export function fork(grammars: Grammars): { lexer: Lexer }

  /** css-tree's list of a node's children. */
  interface NodeList {
    toArray(): StyleNode[]
  }

  /** Text the parser was told to leave as it is, or couldn't read. */
  interface Raw {
    type: "Raw"
    value: string
  }

  /**
   * A node of a stylesheet, parsed without reading into selectors, at-rule preludes or values, which are left as
   * `Raw` text.
   */
  export type StyleNode =
    | { type: "Rule"; prelude: Raw; block: { children: NodeList } }
    | { type: "Atrule"; name: string; prelude: Raw | null; block: { children: NodeList } | null }
    | { type: "Declaration"; property: string; value: Raw; important: boolean | string }
    | Raw
    | { type: "Comment" | "CDO" | "CDC" }

  /** What to leave as `Raw` text. With all three false, a stylesheet's nodes are `StyleNode`s. */
  interface ParseOptions {
    parseValue: false
    parseRulePrelude: false
    parseAtrulePrelude: false
  }

  /** A stylesheet's top-level rules and at-rules. Text that isn't CSS parses to `Raw` nodes, never an error. */
  export function parse(css: string, options: ParseOptions): { type: "StyleSheet"; children: NodeList }

  /** A node as CSS text, without the whitespace that separates nothing. */
  export function generate(node: StyleNode): string
}
