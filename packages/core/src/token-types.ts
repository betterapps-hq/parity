// The token types core's own contracts name: the categories a guest files tokens under, and the tokens a `.lib.par`
// describes. Reading, editing and matching tokens is in @parity-app/tokens, which depends on core.

export type TokenCategory =
  | "color"
  | "spacing"
  | "radius"
  | "font-size"
  | "font"
  | "font-weight"
  | "tracking"
  | "leading"
  | "shadow"
  | "breakpoint"
  | "container"
  | "effect"
  | "motion"
  | "other"

/** A token as its file describes it, with its value in each context. */
export interface DescribedToken {
  /** Its path in the file, as in `color.primary`. */
  path: string
  type?: string
  description?: string
  /** Its value in each context, written as CSS: `default` for the resolver's defaults, else the context, as in `dark`. */
  values: Record<string, string>
  /**
   * What Parity's own extension says about it (`$extensions.parity`): the custom property it compiles to, without
   * `--`, the Tokens panel category it belongs in, and for a font size, the custom property of its line height.
   */
  parity?: TokenExtension
}

export interface TokenExtension {
  var?: string
  category?: string
  lineHeight?: string
}
