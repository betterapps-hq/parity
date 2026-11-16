// Compiled by the customer's build tool with the guest, so it imports nothing at runtime.
import type { ComponentRenderStatus } from "@parity-app/core"

/** What a component's boundaries tell the guest as they draw. */
export interface RenderReport {
  drawn(name: string): void
  failed(name: string, error: Error): void
  cleared(name: string): void
}

/** Each drawn component's status, kept from what its boundaries report. */
export interface RenderStatuses {
  report: RenderReport
  get: () => Record<string, ComponentRenderStatus>
  subscribe: (listener: () => void) => () => void
}

/**
 * Each drawn component's status: failing while any of its boundaries shows an error, with the latest, else drawn.
 * Listeners hear about changes once per task, as a canvas draws many frames at once. A component `waiting` says is
 * still loading doesn't count as drawn when its boundary draws, since it draws nothing until then.
 */
export function renderStatuses(waiting: (name: string) => boolean): RenderStatuses {
  const drawnOnce = new Set<string>()
  const failing = new Map<string, { count: number; error: string }>()
  const listeners = new Set<() => void>()
  let statuses: Record<string, ComponentRenderStatus> = {}
  let pending = false

  const changed = () => {
    if (pending) {
      return
    }

    pending = true
    queueMicrotask(() => {
      pending = false
      statuses = Object.fromEntries([
        ...[...drawnOnce].map((name) => [name, { drawn: true as const }]),
        ...[...failing].map(([name, { error }]) => [name, { error }])
      ])

      for (const listener of listeners) {
        listener()
      }
    })
  }

  return {
    report: {
      drawn(name) {
        if (drawnOnce.has(name) || waiting(name)) {
          return
        }

        drawnOnce.add(name)
        changed()
      },
      failed(name, error) {
        failing.set(name, { count: (failing.get(name)?.count ?? 0) + 1, error: error.message })
        changed()
      },
      cleared(name) {
        const now = failing.get(name)

        if (!now) {
          return
        }

        if (now.count > 1) {
          failing.set(name, { ...now, count: now.count - 1 })
        } else {
          failing.delete(name)
        }

        changed()
      }
    },
    get: () => statuses,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    }
  }
}
