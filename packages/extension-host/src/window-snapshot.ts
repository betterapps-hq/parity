import type { Capability } from "@parity-app/extension"
import type { HalfState } from "@parity-app/extension/internal"

/*
 * `extensions.json`: what each tab's extensions are doing, for an error from the editor window and for an agent asking
 * with `parity extensions` (docs/proposals/extensions-in-the-window.md, "Every error says which extension"). It holds
 * ids, versions, states, counts and the room's random lineage, never a document's bytes, people's names, an agent's
 * labels or what anyone typed. Failures' messages are scrubbed where it's sent.
 */

/** A failure core caught from a window module. */
export interface FailureFacts {
  /** What core called, as `selection.onChange` or `layer:multiplayer.pointers`. */
  api: string
  message: string
  /** When, in milliseconds since 1970. */
  at: number
}

/** The room, as the extension that brings it has it in a tab. */
export interface RoomFacts {
  /** `waiting` until the document opens, `attached` while shared, `detached` once open alone, `closed` with the tab. */
  state: "waiting" | "attached" | "detached" | "closed"
  /** The document's lineage, random, or empty before it opens. */
  lineage: string
  /** Whether this copy writes the project's files. */
  writesFiles: boolean
  /** Whether changes passed in wait for others this copy hasn't got. */
  pending: boolean
  /** How big this copy's version vector is, in bytes, while shared. */
  versionBytes?: number
  /** How many other copies the extension last said were in the room, when it has said. */
  peers?: number
}

/** One extension in one tab. */
export interface ExtensionFacts {
  id: string
  version: string
  displayName: string
  halves: {
    /** Its window module here: `stopped` once it failed too often or couldn't start in this tab. */
    window: "loading" | "active" | "inactive" | "stopped"
    /** Its Node half, as its window module sees it; absent without one. */
    node?: HalfState
  }
  capabilities: Capability[]
  /** Its layers' ids. */
  layers: string[]
  /** Drag previews it has open. */
  previews: number
  /** Holds it has on boards. */
  holds: number
  /** Its latest failures in this tab, oldest first, at most five. */
  failures: FailureFacts[]
  /** For the extension that brings the room. */
  room?: RoomFacts
}

/** One project tab's extensions. */
export interface TabFacts {
  tab: string
  extensions: ExtensionFacts[]
}

/** `extensions.json`. */
export interface ExtensionsSnapshot {
  tabs: TabFacts[]
}

/** What one surface knows of an extension, as `WindowSurface.describe` gives it. */
export interface SurfaceFacts {
  layers?: string[]
  previews?: number
  holds?: number
  room?: Omit<RoomFacts, "peers">
}

/**
 * `extensions.json` for the open tabs: each tab's extensions with window modules, their halves' states, capabilities,
 * what they have open on the canvas, their latest failures, and the room. An extension whose window module isn't
 * running or stopped in a tab is left out of it, and a tab with none is left out.
 */
export function extensionsSnapshot(tabs: Iterable<{ facts(): TabFacts }>): ExtensionsSnapshot {
  const listed: TabFacts[] = []

  for (const tab of tabs) {
    const facts = tab.facts()
    const started = facts.extensions.filter((extension) => extension.halves.window !== "inactive")

    if (started.length > 0) {
      listed.push({ tab: facts.tab, extensions: started })
    }
  }

  return { tabs: listed }
}
