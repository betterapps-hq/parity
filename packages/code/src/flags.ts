/**
 * Whether a set of TypeScript's flags (`ts.SymbolFlags`, `ts.TypeFlags`) has any of these. The compiler API reports
 * what a symbol or type is as bits, and has no public helper that reads most of them, so this is where they're read.
 */
export function hasFlag<Flags extends number>(flags: Flags, ...wanted: Flags[]): boolean {
  // oxlint-disable-next-line no-bitwise -- TypeScript's compiler API reports kinds as bit flags; this is the one place code reads them
  return wanted.some((flag) => (flags & flag) !== 0)
}
