import type { ChangeDetector } from "@parity-app/change-detection"

/** A project's detector, once it's picked, and what stops its watching. */
interface Picked {
  detector: Promise<ChangeDetector | undefined>
  stop?: Promise<(() => void) | undefined>
}

/**
 * Each open project's change detector (PAR-1074): the first of `detectors` that says it can count the project, picked
 * once when the project's frames first ask. It watches for its baseline moving, and calls `moved` with the project's id
 * when it does. A project none can count has no detector, and its frames count from their first trace.
 */
export class ProjectChangeDetectors {
  readonly #detectors: readonly ChangeDetector[]
  readonly #moved: (projectId: string) => void
  readonly #picked = new Map<string, Picked>()

  constructor(detectors: readonly ChangeDetector[], moved: (projectId: string) => void) {
    this.#detectors = detectors
    this.#moved = moved
  }

  /**
   * The project's files that differ from its detector's baseline, or undefined when no detector counts it or it can't
   * say. The first ask picks the detector and starts it watching.
   */
  async changedFiles(projectId: string, root: string): Promise<ReadonlySet<string> | undefined> {
    const detector = await this.#pick(projectId, root)

    return detector?.changedFiles(root)
  }

  /** Stops watching a project and forgets its detector, as when it closes, done once it's let go. */
  async forget(projectId: string): Promise<void> {
    const picked = this.#picked.get(projectId)
    this.#picked.delete(projectId)
    ;(await picked?.stop)?.()
  }

  #pick(projectId: string, root: string): Promise<ChangeDetector | undefined> {
    const known = this.#picked.get(projectId)

    if (known) {
      return known.detector
    }

    const picked: Picked = { detector: this.#first(root) }

    picked.stop = picked.detector.then((detector) =>
      detector?.watch(root, () => this.#moved(projectId)).catch(() => undefined)
    )

    this.#picked.set(projectId, picked)

    return picked.detector
  }

  async #first(root: string): Promise<ChangeDetector | undefined> {
    for (const detector of this.#detectors) {
      if (await detector.detect(root).catch(() => false)) {
        return detector
      }
    }

    return undefined
  }
}
