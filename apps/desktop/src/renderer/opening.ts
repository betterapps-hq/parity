import { type EventAttributes, errorCode, type registeredEvents } from "@parity-app/telemetry"
import type { ProjectInfo } from "../shared/protocol.ts"
import { track } from "./report-error.ts"
import { startStep } from "./tracing.ts"

type Events = typeof registeredEvents

/** How a project's canvas first drew a frame: its design, or a bitmap kept of it. */
export type FirstFrame = "live" | "bitmap"

/**
 * One project a tab asks to open, from asking until its canvas first draws a frame (PAR-711). It's recorded as the
 * `project.opening` span, which the service's work for it joins, until the tab is ready or the open fails, and then as
 * `project.drawn` in the same trace.
 */
export interface Opening {
  /** When it was asked for, by `performance.now()`. */
  readonly began: number
  /** Asks the service, in the open's trace. */
  ask<T>(work: () => T): T
  /** Records `project.loaded` in the open's trace, once the tab's guest and components have loaded. */
  loaded(attributes: EventAttributes<Events, "project.loaded">): void
  /** The tab is ready. Gives back what records the canvas's first frame, which only its first call does. */
  ready(info: ProjectInfo): (from: FirstFrame) => void
  /** The open failed. */
  failed(error: unknown): void
  /** The tab was closed, or the project was already open in another. */
  dropped(): void
}

export function startOpening(root: string | undefined, reload: boolean, now = () => performance.now()): Opening {
  const began = now()
  const step = startStep("project.opening", { reload, ...(root === undefined ? {} : { root }) })
  const span = step.context
  const inOpen = span ? { span } : undefined

  return {
    began,
    ask: (work) => step.within(work),
    loaded: (attributes) => track("project.loaded", attributes, inOpen),
    ready(info) {
      step.end("ok", { root: info.root, name: info.name })
      let drawn = false

      return (from) => {
        if (drawn) {
          return
        }

        drawn = true
        const attributes = { name: info.name, root: info.root, durationMs: Math.round(now() - began), from }
        track("project.drawn", attributes, inOpen)
      }
    },
    failed(error) {
      const code = errorCode(error)
      step.end("error", code === undefined ? undefined : { code })
    },
    dropped: () => step.end("cancelled")
  }
}
