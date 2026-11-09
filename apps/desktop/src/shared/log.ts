/**
 * Where main and the utility process note what they're doing on stdout, such as a project opening, a preview being
 * rendered or the dev runner restarting the service. Warnings and failures go to `console.warn` and `console.error`
 * instead.
 */
export function logNote(text: string): void {
  // oxlint-disable-next-line no-console -- progress notes go to stdout, and this is the one place that writes them
  console.log(text)
}
