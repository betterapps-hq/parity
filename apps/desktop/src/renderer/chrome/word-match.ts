/**
 * How Search actions matches what's typed (PAR-546): by the start of words, not letters scattered through a name, so
 * "new" finds New screen and New component and not Interact with previews. Each typed word must start a word of
 * `value`, in any order; a name that starts with everything typed ranks first. Returns the rank, 0 for no match, as
 * the kit's `Command` filter takes it.
 */
export function matchWords(value: string, search: string): number {
  const typed = search.trim().toLowerCase()
  if (!typed) return 1
  const text = value.toLowerCase()
  if (text.startsWith(typed)) return 1
  const words = text.split(/\s+/)
  return typed.split(/\s+/).every((part) => words.some((word) => word.startsWith(part))) ? 0.5 : 0
}
