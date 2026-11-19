import type { DesignKey, DocChange } from "./types.ts"

/**
 * The designs, notes and references a change may have added, removed, moved or locked: what a canvas's boards follow.
 * Notes and references are keyed by their file and id, as `designKey` joins them. Changes inside a design's layers
 * aren't here, since boards don't follow them.
 */
export interface ChangedBoards {
  designs: ReadonlySet<DesignKey>
  notes: ReadonlySet<string>
  references: ReadonlySet<string>
}

/**
 * Which boards a change touched, or undefined when it can't say and every board is checked: a file added, removed or
 * replaced whole.
 */
export function changedBoards(change: DocChange): ChangedBoards | undefined {
  if (change.kind === "replaceFile" || change.filesAdded.length > 0 || change.filesRemoved.length > 0) {
    return undefined
  }

  const { added, removed, renamed, changed } = change.designs

  return {
    designs: new Set([
      ...added,
      ...removed,
      ...renamed.flatMap(({ from, to }) => [from, to]),
      ...changed.map(({ design }) => design)
    ]),
    notes: new Set(change.items.notes),
    references: new Set(change.items.references)
  }
}
