import type { RenderNode } from "@parity-app/core"
import { committedChange, type FrameChange, frameChange } from "./status.ts"
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
 * Each frame's baseline, which statuses are counted from. In a git repository it's the last commit (PAR-1074), so a
 * frame changed once a file it reads differs from what's committed. Elsewhere it's the first trace taken of the frame
 * (PAR-997), so a frame changed once a file it read differs from when it was first looked at. Either way it's
 * unchanged again once the file is back as it was.
 */
export class ChangeBaselines {
  readonly #traces = new Map<string, { project: string; trace: FrameTrace }>()

  /**
   * The frame's change since its baseline: the last commit when `committed` lists the project's files that differ from
   * it, else the first trace, `current` becoming it when the frame has none yet.
   */
  compare(
    id: FrameId,
    tree: readonly RenderNode[],
    current: FrameTrace | undefined,
    committed?: ReadonlySet<string>
  ): FrameChange {
    if (committed) {
      return committedChange(tree, current, committed)
    }

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
