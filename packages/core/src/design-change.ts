import type { ContainerSpec } from "./document.ts"
import type { ModeSettings } from "./modes.ts"

/**
 * One design an agent's call changed, with the design as the call read it, so the editor can apply it over whatever
 * else changed since: the person's edits, or another call's.
 */
export interface DesignChange {
  /** The project file the design is in. */
  path: string
  id: string
  /** The design as the call read it; null for one the call created. */
  base: ContainerSpec | null
  /** The design as the call left it; null for one the call deleted. */
  after: ContainerSpec | null
}

/** The modes as an agent's call read them and as it left them. */
export interface ModesChange {
  base: ModeSettings
  after: ModeSettings
}

/**
 * Something an agent's call changed that also changed in the editor after the call read it, so the call wasn't applied:
 * a design, by its file and name, or the modes (no `path` or `id`).
 */
export interface ChangeConflict {
  path?: string
  id?: string
  name: string
  /** What happened to it in the editor: changed, deleted, or (for a design the call created) added under its id. */
  reason: "changed" | "deleted" | "added"
}

/** Conflicts as a message for the agent: what was refused, naming each design, and how to go again. */
export function describeConflicts(conflicts: readonly ChangeConflict[]): string {
  const named = conflicts.map((conflict) =>
    conflict.path === undefined
      ? `the modes were ${conflict.reason}`
      : `"${conflict.name}" (${conflict.path}) was ${conflict.reason}`
  )
  const them = conflicts.length === 1 ? "it" : "them"
  return (
    `Not applied: since this call read the tab, ${named.join(", ")} in the editor, and this call changes ${them} ` +
    "too. Run the call again to work from what's there now."
  )
}
