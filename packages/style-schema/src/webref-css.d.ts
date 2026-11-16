// @webref/css ships no types. These are the parts of its data spec.test.ts reads.
declare module "@webref/css" {
  /** Something a spec defines, with its grammar in CSS's value definition syntax where the spec gives one. */
  interface Defined {
    name: string
    syntax?: string
  }

  /** Everything the W3C's CSS specs define, as `css.json` holds it. */
  export function listAll(): Promise<{ properties: Defined[]; types: Defined[]; functions: Defined[] }>
}
