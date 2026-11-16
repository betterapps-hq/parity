/**
 * Where the repository's scripts print what they're for: a result, progress, or a note for CI's log. Failures and
 * warnings go to stderr through `console.error` and `console.warn` as usual.
 */

/** Prints a line on stdout. */
export function print(text: string): void {
  // oxlint-disable-next-line no-console -- printing is what these scripts do; this is the one place they write stdout
  console.log(text)
}
