import type { AccessibilityFinding } from "@parity-app/agent"
import type { ContainerSpec, ModeSettings } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import type { ContainerEntry } from "../design-store.ts"
import { projectPart } from "../project-part.ts"
import { request } from "../service.ts"
import { signal } from "../store.ts"
import type { ProjectSession } from "../workspace.ts"

/** A check of one design, kept with what it checked so a later change shows it's out of date. */
export type Check = { container: ContainerSpec; modes: ModeSettings } &
  /** Checking again keeps the last check's findings, to show faded until this one's arrive. */
  (
    | { status: "checking"; previous?: DoneCheck }
    | { status: "done"; findings: AccessibilityFinding[]; frames: number; warnings: string[] }
    | { status: "failed"; error: string }
  )

export type DoneCheck = Extract<Check, { status: "done" }>

/** The findings to show for a check: its own, or while it checks again, the last check's. */
export function findingsOf(check: Check | undefined): DoneCheck | undefined {
  if (check?.status === "done") {
    return check
  }

  if (check?.status === "checking") {
    return check.previous
  }

  return undefined
}

type CheckedSession = Pick<ProjectSession, "id" | "store" | "untilClosed">

/** One open project's accessibility checks, by design, while its tab is open. */
class Checks {
  private readonly checks = new Map<string, Check>()
  /** Each design's newest check, which is the only one whose reply is shown. */
  private readonly newest = new Map<string, number>()
  private asked = 0
  private readonly changed = signal()
  private disposed = false

  constructor(private readonly session: CheckedSession) {}

  get(design: string): Check | undefined {
    return this.checks.get(design)
  }

  readonly subscribe = this.changed.subscribe

  /**
   * Renders the design offscreen in every state and shown mode, and checks each frame with axe-core. Checking a design
   * again while it's being checked shows only the newest check's reply, whichever lands first (PAR-979).
   */
  async run(entry: ContainerEntry): Promise<void> {
    if (this.disposed) {
      return
    }

    const asked = ++this.asked
    this.newest.set(entry.key, asked)
    const checked = { container: entry.container, modes: this.session.store.getModes() }
    const checking: Check = { ...checked, status: "checking" }
    const previous = findingsOf(this.checks.get(entry.key))

    if (previous) {
      checking.previous = previous
    }

    this.set(entry.key, checking)

    const answer = (check: Check) => {
      if (this.newest.get(entry.key) === asked) {
        this.set(entry.key, check)
      }
    }

    try {
      const result = await request("accessibility.check", { projectId: this.session.id, design: entry.key })
      answer({ ...checked, status: "done", ...result })
    } catch (error) {
      answer({
        ...checked,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /** Forgets every check, and keeps none that's under way. */
  dispose(): void {
    this.disposed = true
    this.checks.clear()
    this.newest.clear()
    this.changed.dispose()
  }

  private set(design: string, check: Check): void {
    if (this.disposed) {
      return
    }

    this.checks.set(design, check)
    this.changed.notify()
  }
}

/** An open project's accessibility checks, made the first time they're asked for and dropped when its tab closes. */
export const checksOf = projectPart((session: CheckedSession) => new Checks(session))

/** A design's check as it is now, if it's been checked. */
export function useCheck(session: CheckedSession, design: string): Check | undefined {
  const checks = checksOf(session)

  return useSyncExternalStore(checks.subscribe, () => checks.get(design))
}
