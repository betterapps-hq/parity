import type { JsonValue, StateKey } from "@parity-app/settings"
import { z } from "zod"
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

/** The lens layout `project` saved, by its root, as main has `state.json` now (PAR-1248). */
export function savedLensLayout(project: string): JsonValue | undefined {
  return lensLayouts.parse(saved().values.lensLayouts)[project]
}

/** Each project's lens layout by its root, or none when `state.json` holds something else. */
const lensLayouts = z.record(z.string(), z.json()).catch({})

/** Saves `project`'s lens layout, keeping the projects other copies saved. Without a host it isn't kept. */
export function saveLensLayout(project: string, layout: JsonValue): void {
  if (typeof window !== "undefined") {
    window.canvasHost?.state?.saveLensLayout?.(project, layout)
  }
}

/** Saves one value in `state.json`, for the next window to start with. Without a host it isn't kept. */
export function saveState(key: StateKey, value: JsonValue): void {
  if (typeof window !== "undefined") {
    window.canvasHost?.state?.set(key, value)
  }
}
