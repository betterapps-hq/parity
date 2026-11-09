/**
 * Where the utility process notes what it's doing on stdout, such as a project opening or a preview being rendered.
 * Warnings and failures go to `console.warn` and `console.error` instead.
 */
export function logNote(text: string): void {
  // oxlint-disable-next-line no-console -- progress notes go to stdout, and this is the one place that writes them
  console.log(text)
}
