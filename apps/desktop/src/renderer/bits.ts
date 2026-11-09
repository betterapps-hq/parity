/** The renderer's bit operations, each with the one lint disable it needs. */

/** Whether `flags` has every bit of `flag` set, as a DOM bit mask such as `compareDocumentPosition`'s is read. */
export function hasFlag(flags: number, flag: number): boolean {
  // oxlint-disable-next-line no-bitwise -- the DOM reports these as bit masks
  return (flags & flag) === flag
}

/** The flags combined, as the DOM's APIs take a set of them (`NodeFilter.SHOW_ELEMENT`, `NodeFilter.SHOW_TEXT`). */
export function flagsOf(...flags: number[]): number {
  // oxlint-disable-next-line no-bitwise -- the DOM takes a set of flags as one bit mask
  return flags.reduce((all, flag) => all | flag, 0)
}

/** The 32-bit FNV-1a hash of `text`'s code points, as an unsigned number. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5

  for (const char of text) {
    // oxlint-disable-next-line no-bitwise -- FNV-1a is defined by XOR and a 32-bit unsigned result
    hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0
  }

  return hash
}
