// css-tree ships no types. These are the parts `validate.ts` uses.
declare module "css-tree" {
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
}
