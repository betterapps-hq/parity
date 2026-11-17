import type { Disposable, NodeRef } from "@parity-app/extension"
import type { Agents, AgentStep, Point } from "@parity-app/extension/internal"
import type { RecordSeamEvent } from "./events.ts"
import type { WindowSurface } from "./window-modules.ts"

/*
 * `parity.agents` for one project tab (docs/proposals/extensions-in-the-window.md, "parity.agents"): every step of this
 * copy's agents, told before the write it describes is applied, and other copies' steps an extension passes in, told
 * with the copy they came from. A step is told with `from` only when it came from another copy, so an extension that
 * sends only steps without one never sends a step back to the room.
 */

/** An agent's step as the agent API reports it to the window today (`@parity-app/agent`'s `PresenceEvent`). */
export interface AgentEventLike {
  kind: AgentStep["kind"]
  label?: string
  design?: string
  node?: string
  state?: string
  mode?: string
  error?: string
  from?: Point
  to?: Point
  agent?: string
  agentId?: string
}

/**
 * A step as window modules see it, from what the agent API reported: `design` and `node` become `ref`, and `agentId` is
 * always there, falling back to the agent's name as the canvas's own cursors do. `layerType` names a layer's type in
 * its design, as `parity.selection` does.
 */
export function agentStepOf(
  event: AgentEventLike,
  layerType: (design: string, node: string) => string | undefined = () => undefined
): AgentStep {
  const step: AgentStep = { kind: event.kind, agentId: event.agentId ?? event.agent ?? "agent" }

  if (event.agent !== undefined) {
    step.agent = event.agent
  }

  if (event.design !== undefined) {
    step.ref =
      event.node === undefined
        ? { owner: "design", type: "design", key: event.design }
        : {
            owner: "design",
            type: layerType(event.design, event.node) ?? "layer",
            key: `${event.design}/${event.node}`
          }
  }

  for (const key of ["label", "state", "mode", "error"] as const) {
    const value = event[key]

    if (value !== undefined) {
      step[key] = value
    }
  }

  if (event.from) {
    step.from = event.from
  }

  if (event.to) {
    step.to = event.to
  }

  return step
}

/** What a step names, as the agent API's events do. */
export function agentEventOf(step: AgentStep): AgentEventLike {
  const event: AgentEventLike = { kind: step.kind, agentId: step.agentId }
  const slash = step.ref?.key.indexOf("/") ?? -1

  if (step.ref && step.ref.type !== "design" && slash > 0) {
    event.design = step.ref.key.slice(0, slash)
    event.node = step.ref.key.slice(slash + 1)
  } else if (step.ref) {
    event.design = step.ref.key
  }

  for (const key of ["agent", "label", "state", "mode", "error"] as const) {
    const value = step[key]

    if (value !== undefined) {
      event[key] = value
    }
  }

  if (step.from) {
    event.from = step.from
  }

  if (step.to) {
    event.to = step.to
  }

  return event
}

/** What the tab's window tells of agents, and does with other copies' steps. */
export interface AgentsPort {
  /** This copy's agents' steps in this tab, before the writes they describe are applied. Returns what stops it. */
  onSteps(listener: (steps: AgentStep[]) => void): () => void
  /**
   * Other copies' steps that reached the window without an extension passing them in, as the development room's do,
   * with the copy they came from. Returns what stops it.
   */
  onPassedOn?(listener: (steps: AgentStep[], from: string) => void): () => void
  /** Whether what a step names is in the document. */
  exists?(ref: NodeRef): boolean
  record?: RecordSeamEvent
  /** Timers, for `agents.activity` once a minute. The window's unless given. */
  timers?: { set(callback: () => void, ms: number): number; clear(handle: number): void }
  now?: () => number
}

const minuteMs = 60_000

/** The tab's `parity.agents`, for `windowModules`'s `surfaces`, and what stops it as the tab closes. */
export function windowAgents(port: AgentsPort): WindowSurface & Disposable {
  const listeners = new Set<(steps: AgentStep[], from?: string) => void>()

  const timers = port.timers ?? {
    set: (callback: () => void, ms: number) => Number(setTimeout(callback, ms)),
    clear: (handle: number) => clearTimeout(handle)
  }

  const now = port.now ?? (() => Date.now())
  let counts = { here: 0, received: 0, copies: new Set<string>() }
  let timer: number | undefined
  let dropped = { since: Number.NEGATIVE_INFINITY, count: 0 }

  const report = () => {
    timer = undefined

    if (counts.here === 0 && counts.received === 0) {
      return
    }

    port.record?.("agents.activity", {
      stepsHere: counts.here,
      stepsReceived: counts.received,
      copies: counts.copies.size,
      listeners: listeners.size
    })
    counts = { here: 0, received: 0, copies: new Set() }
    // Agents still working are reported again a minute on; idle, it rests.
    timer = timers.set(report, minuteMs)
  }

  const counted = () => {
    timer ??= timers.set(report, minuteMs)
  }

  const tell = (steps: AgentStep[], from?: string) => {
    for (const listener of listeners) {
      if (from === undefined) {
        listener(steps)
      } else {
        listener(steps, from)
      }
    }
  }

  const stopSteps = port.onSteps((steps) => {
    counts.here += steps.length
    counted()
    tell(steps)
  })

  /** The steps that name what's here; the rest are dropped, and recorded at most once a minute. */
  const kept = (steps: AgentStep[], from: string) =>
    steps.filter((step) => {
      if (!step.ref || !port.exists || port.exists(step.ref)) {
        return true
      }

      dropped.count += 1

      if (now() - dropped.since >= minuteMs) {
        port.record?.("agents.stepDropped", { kind: step.kind, from, dropped: dropped.count })
        dropped = { since: now(), count: 0 }
      }

      return false
    })

  /** Another copy's steps: counted, and told with the copy they came from once what they name is found here. */
  const passedOn = (steps: AgentStep[], from: string) => {
    if (steps.length === 0) {
      return
    }

    counts.received += steps.length
    counts.copies.add(from)
    counted()
    const here = kept(steps, from)

    if (here.length > 0) {
      tell(here, from)
    }
  }

  const stopPassedOn = port.onPassedOn?.(passedOn)

  return {
    capability: "agents",
    make(context) {
      const agents: Agents = {
        onActivity(listener) {
          const heard = context.listener("agents.onActivity", listener)
          listeners.add(heard)

          const handle = once(() => listeners.delete(heard))
          context.onEnd(() => handle.dispose())

          return handle
        },
        receive(steps, { from }) {
          passedOn(steps, from)
        }
      }

      return agents
    },
    dispose() {
      stopSteps()
      stopPassedOn?.()
      listeners.clear()

      if (timer !== undefined) {
        timers.clear(timer)
      }
    }
  }
}

function once(dispose: () => void): Disposable {
  let done = false

  return {
    dispose() {
      if (!done) {
        done = true
        dispose()
      }
    }
  }
}
