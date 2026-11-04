/** The most of an example's text a sample keeps, so library files stay small. */
export const sampleTextLength = 60

/** A sentence that ends this far in is kept whole, rather than its words cut down to the length. */
const shortestSentence = 20

/**
 * An example's text as a sample keeps it: whole when it's short, else shortened (see `shortenedText`), so a preview
 * reads "Manage how you receive notifications." rather than "…You can enable email a".
 */
export function sampleText(text: string): string {
  return text.length <= sampleTextLength ? text : shortenedText(text.slice(0, sampleTextLength))
}

/**
 * Text cut at `sampleTextLength`, ended where its last sentence in it ends, else after its last whole word with an
 * ellipsis. It reads only what was kept, so text earlier versions cut there mid-word is shortened as it would be now.
 */
export function shortenedText(head: string): string {
  const end = [...head.matchAll(/[.!?](?=\s|$)/g)].findLast((match) => match.index >= shortestSentence)
  if (end) return head.slice(0, end.index + 1)
  const space = head.lastIndexOf(" ")
  const words = space > 0 ? head.slice(0, space) : head.slice(0, -1)
  return `${words.replace(/[\s,;:–—-]+$/, "")}…`
}
