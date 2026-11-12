import type { Track } from "@parity-app/core"

/**
 * A grid's columns or rows for a count typed in the Tracks row, which counts the tracks: that many Fill tracks
 * (`{ fr: 1 }`), or the tracks there already with Fill tracks added or dropped at the end, so a track given a length
 * of its own keeps it. Nothing for no count, which unsets them.
 */
export function tracksOfCount(count: number | undefined, tracks: readonly Track[] | undefined): Track[] | undefined {
  if (count === undefined || count < 1) {
    return undefined
  }

  const kept = (tracks ?? []).slice(0, count)

  return [...kept, ...Array.from({ length: count - kept.length }, (): Track => ({ fr: 1 }))]
}
