import type { JsonValue, StateKey } from "@parity-app/settings"
import type { CanvasHost } from "../shared/protocol.ts"

type Saved = ReturnType<CanvasHost["saved"]>

const nothingSaved: Saved = { values: {}, projects: { recent: [], notes: {} } }

/**
 * What main keeps for the window in `state.json` and `projects.json` (`docs/proposals/settings.md`), from its memory.
 * Tests and stories without a host have nothing saved.
 */
export function saved(): Saved {
  try {
    return (typeof window === "undefined" ? undefined : window.canvasHost?.saved?.()) ?? nothingSaved
  } catch {
    return nothingSaved
  }
}

/** Saves one value in `state.json`, for the next window to start with. Without a host it isn't kept. */
export function saveState(key: StateKey, value: JsonValue): void {
  if (typeof window !== "undefined") {
    window.canvasHost?.state?.set(key, value)
  }
}
