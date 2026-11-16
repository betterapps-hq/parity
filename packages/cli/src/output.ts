/**
 * Where the CLI prints. A command's result goes to stdout, so it can be piped or read as JSON; progress, notes and
 * failures go to stderr, so they never mix into that result. Every command prints through these two.
 */

/** Prints a command's result on stdout, followed by a newline. */
export function stdout(text: string): void {
  // oxlint-disable-next-line no-console -- printing results is what a CLI does; this is the one place it writes stdout
  console.log(text)
}

/** Prints progress, a note or a failure on stderr, followed by a newline. */
export function stderr(text: string): void {
  console.error(text)
}
