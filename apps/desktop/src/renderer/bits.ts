/** The renderer's bit operations, each with the one lint disable it needs. */

/** Whether `flags` has every bit of `flag` set, as a DOM bit mask such as `compareDocumentPosition`'s is read. */
export function hasFlag(flags: number, flag: number): boolean {
  // oxlint-disable-next-line no-bitwise -- the DOM reports these as bit masks
  return (flags & flag) === flag
}

/** One step of the FNV-1a hash, as an unsigned 32-bit number. */
export function fnvStep(value: number, code: number): number {
  // oxlint-disable-next-line no-bitwise -- FNV-1a is defined by XOR and a 32-bit unsigned result
  return Math.imul(value ^ code, 16777619) >>> 0
}
