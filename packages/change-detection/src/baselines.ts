import type { RenderNode } from "@parity-app/core"
import { type FrameChange, frameChange } from "./status.ts"
import type { FrameTrace } from "./trace.ts"

/**
 * Which frame a status is for, as a person names it: the project, the design, the state and the mode. Never what it's
 * drawn with, which a render key or a bitmap's name also holds, so the code changing doesn't make it another frame.
 */
export interface FrameId {
  project: string
  design: string
  state: string
  mode: string
}

/**
 * Each frame's baseline, which statuses are counted from (PAR-997): the first trace taken of it, so a frame changed
 * once a file it read differs from when it was first looked at, and is unchanged again once the file is back as it was.
 */
export class ChangeBaselines {
  readonly #traces = new Map<string, { project: string; trace: FrameTrace }>()

  /** The frame's change since its baseline, `current` becoming its baseline when it has none yet. */
  compare(id: FrameId, tree: readonly RenderNode[], current: FrameTrace | undefined): FrameChange {
    const key = frameKey(id)
    let baseline = this.#traces.get(key)?.trace

    if (!baseline && current) {
      baseline = current
      this.#traces.set(key, { project: id.project, trace: current })
    }

    return frameChange(tree, baseline, current)
  }

  /** Drops a project's baselines, as when it closes, so the next look at each frame starts again. */
  forget(project: string): void {
    for (const [key, kept] of this.#traces) {
      if (kept.project === project) {
        this.#traces.delete(key)
      }
    }
  }
}

/** A frame's id as one string, for keying maps. */
export function frameKey(id: FrameId): string {
  return JSON.stringify([id.project, id.design, id.state, id.mode])
}
