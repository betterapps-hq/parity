/* oxlint-disable no-bitwise -- the DOM's flag sets and a 32-bit hash need bit operations; the canvas does them only here. */

/** The flags combined, as the DOM's APIs take a set of them (`NodeFilter.SHOW_ELEMENT`, `NodeFilter.SHOW_TEXT`). */
export function flagsOf(...flags: number[]): number {
  return flags.reduce((all, flag) => all | flag, 0)
}

/** FNV-1a, 32 bits. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}
