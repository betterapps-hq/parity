import type { Colors, Palette } from "@parity-app/extension/internal"

/**
 * Each person's palette, claimed once as they're first drawn and held while they're here (PAR-1327), so layers read it
 * as they draw without claiming. The room's numbers can move what a key holds, its own or, by taking its number,
 * another's, so after each assignment every palette held is read again.
 */
export class HeldPalettes {
  readonly #colors: Pick<Colors, "claim" | "release">
  readonly #held = new Map<string, Palette>()

  constructor(colors: Pick<Colors, "claim" | "release">) {
    this.#colors = colors
  }

  /** `key`'s palette, claimed the first time it's asked for. */
  of = (key: string): Palette => {
    const held = this.#held.get(key)

    if (held) {
      return held
    }

    const claimed = this.#colors.claim(key)
    this.#held.set(key, claimed)

    return claimed
  }

  /** Reads every palette held again, after the room assigned numbers, keeping one claim on each. */
  reread(): void {
    for (const key of this.#held.keys()) {
      this.#held.set(key, this.#colors.claim(key))
      this.#colors.release(key)
    }
  }

  /** Gives back `key`'s claim, when they've left. */
  release(key: string): void {
    if (this.#held.delete(key)) {
      this.#colors.release(key)
    }
  }
}
