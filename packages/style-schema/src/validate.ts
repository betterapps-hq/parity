// css-tree's one-file build: its main entry reads its data from disk through `node:module`, which neither a browser
// nor a bundled app can do.
import { fork } from "css-tree/dist/csstree.esm"
import { ledger, namedGrammars } from "./ledger.ts"

/**
 * Whether a property takes a value, and when it doesn't, which of the two is at fault. For a value, `syntax` is the
 * grammar it didn't match, in CSS's value definition syntax.
 */
export type Validity =
  | { valid: true }
  | { valid: false; problem: "property" }
  | { valid: false; problem: "value"; syntax: string }

interface Matcher {
  matches: (property: string, value: string) => boolean
  /** Properties whose grammar names a value type no spec gives a grammar for, so a value can't be checked. */
  unchecked: ReadonlySet<string>
}

let built: Matcher | undefined

/**
 * css-tree's matcher over the ledger's grammars, which are the specs' own: css-tree brings the matching and the basic
 * types every grammar ends in (`<length>`, `<ident>`), and its own dictionary, which is older, is never asked about a
 * property.
 */
function matcher(): Matcher {
  if (!built) {
    const grammars = [...ledger.values()].flatMap(({ property, syntax }) =>
      syntax === undefined ? [] : [[property, syntax] as const]
    )

    const { lexer } = fork({
      properties: { ...namedGrammars.properties, ...Object.fromEntries(grammars) },
      types: { ...namedGrammars.types }
    })

    const unchecked = new Set(lexer.validate()?.properties)

    built = { matches: (property, value) => lexer.matchProperty(property, value).error === null, unchecked }
  }

  return built
}

/** The ledger's properties whose values `validate` can't check, for the test that keeps the list known. */
export function uncheckedProperties(): string[] {
  const { unchecked } = matcher()

  return [...ledger.values()].flatMap(({ property, syntax }) =>
    syntax === undefined || unchecked.has(property) ? [property] : []
  )
}

/**
 * Checks a value against its property's grammar from the ledger, as a browser's parser would, without a browser: a
 * value typed in a field, read from code or typed in the CSS row is checked the same way. A browser can still refuse
 * what a grammar allows, so the panel also asks `CSS.supports`.
 *
 * A custom property (`--name`) takes any value. So does a value with `var()` in it, as in CSS, where it's checked only
 * once the variable is filled in: fill tokens in first to check what they come to.
 */
export function validate(property: string, value: string): Validity {
  const blank = value.trim() === ""

  if (property.startsWith("--")) {
    return blank ? { valid: false, problem: "value", syntax: "<declaration-value>" } : { valid: true }
  }

  const entry = ledger.get(property.toLowerCase())

  if (!entry || entry.syntax === undefined) {
    // `custom-property` is the ledger's name for every `--name`, not a property a declaration can name.
    return entry && entry.property !== "custom-property" ? { valid: true } : { valid: false, problem: "property" }
  }

  const { matches, unchecked } = matcher()

  if (blank) {
    return { valid: false, problem: "value", syntax: entry.syntax }
  }

  if (unchecked.has(entry.property) || /\bvar\(/i.test(value) || matches(entry.property, value)) {
    return { valid: true }
  }

  return { valid: false, problem: "value", syntax: entry.syntax }
}
