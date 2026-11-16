import type { Palette } from "./palettes.ts"

/** Whose color something is: a person's peer id, or `${peer}:${agentId}` for an agent. Unique across a room's copies. */
export type ColorKey = string

/** Who holds a claim: an extension by its id, or `core`. Its claims are given back together when it stops. */
export type ColorOwner = string

/**
 * Colors for one tab, handed out by key so nothing ever names a color. A key keeps its palette while any owner claims
 * it; the room's numbers win over claims; and there's always a free number, so a claim never fails.
 */
export interface Colors {
  /** The palette for `key`: its assigned one, the one it holds, or the lowest-numbered one no other key holds. */
  claim(key: ColorKey, owner?: ColorOwner): Palette
  /** Gives back `owner`'s claim on `key`. Its number is free again once no owner claims it and none is assigned. */
  release(key: ColorKey, owner?: ColorOwner): void
  /** Gives back every claim `owner` holds, when it stops. */
  releaseAll(owner: ColorOwner): void
  /** Sets `key`'s palette by number, as the room decided. It wins over a claim, which moves to a free number. */
  assign(key: ColorKey, n: number): void
  /** Forgets the room's number for `key`, when the room goes away. */
  unassign(key: ColorKey): void
  /** Palette `n`: hand-tuned below `tuned`, generated from `n` above it. The same in every copy. */
  palette(n: number): Palette
  /** How many palettes are hand-tuned. */
  readonly tuned: number
  /** How many keys hold a color now. */
  readonly size: number
  /** How many claims `owner` holds. */
  claims(owner: ColorOwner): number
}

export interface ColorsOptions {
  /** Palette `n` of the list these colors come from: `palette` for people, `agentPalette` for agents. */
  palette: (n: number) => Palette
  tuned: number
  /**
   * Told the first time a claim or assignment in this tab needs generated palette `n`, with how many keys then hold a
   * color. For `colors.generated`.
   */
  onGenerated?: (n: number, keys: number) => void
}

export const coreOwner: ColorOwner = "core"

/** A tab's colors, from one list of palettes. */
export function createColors({ palette, tuned, onGenerated }: ColorsOptions): Colors {
  /** Each key's number, and which owners claim it. A key assigned but not claimed has no owners. */
  const held = new Map<ColorKey, { n: number; owners: Set<ColorOwner> }>()
  const assigned = new Map<ColorKey, number>()
  const generated = new Set<number>()

  const taken = (except?: ColorKey) => {
    const numbers = new Set<number>(assigned.values())

    for (const [key, { n }] of held) {
      if (key !== except) {
        numbers.add(n)
      }
    }

    return numbers
  }

  const lowestFree = (except?: ColorKey) => {
    const numbers = taken(except)
    let n = 0

    while (numbers.has(n)) {
      n += 1
    }

    return n
  }

  const note = (n: number) => {
    if (n >= tuned && !generated.has(n)) {
      generated.add(n)
      onGenerated?.(n, held.size)
    }
  }

  /** Moves claimed keys off a number the room just gave someone else. */
  const settle = () => {
    for (const [key, entry] of held) {
      const room = assigned.get(key)

      if (room !== undefined) {
        entry.n = room
        continue
      }

      const clash = [...assigned.values()].includes(entry.n)

      if (clash) {
        entry.n = lowestFree(key)
        note(entry.n)
      }
    }
  }

  return {
    claim(key, owner = coreOwner) {
      let entry = held.get(key)

      if (!entry) {
        entry = { n: assigned.get(key) ?? lowestFree(key), owners: new Set() }
        held.set(key, entry)
        note(entry.n)
      }

      entry.owners.add(owner)

      return palette(entry.n)
    },
    release(key, owner = coreOwner) {
      const entry = held.get(key)

      if (!entry) {
        return
      }

      entry.owners.delete(owner)

      if (entry.owners.size === 0) {
        held.delete(key)
      }
    },
    releaseAll(owner) {
      // Deleting from a Map while iterating it visits every key still to come.
      for (const key of held.keys()) {
        this.release(key, owner)
      }
    },
    assign(key, n) {
      palette(n)
      assigned.set(key, n)
      note(n)
      settle()
    },
    unassign(key) {
      assigned.delete(key)
    },
    palette,
    tuned,
    get size() {
      return held.size
    },
    claims(owner) {
      let count = 0

      for (const { owners } of held.values()) {
        count += owners.has(owner) ? 1 : 0
      }

      return count
    }
  }
}
