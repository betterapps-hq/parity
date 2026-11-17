import type { Disposable } from "@parity-app/extension"
import type { Agents, AgentStep, CanvasSurface, LayerOptions, WindowParity } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import agentPresence from "./window.tsx"

/** A project tab's `WindowParity`, as far as agent presence reaches it, writing down what it's asked to do. */
function standIn() {
  const told: string[] = []
  const layers: LayerOptions[] = []
  let listener: ((steps: AgentStep[], from?: string) => void) | undefined

  /** What agent presence reaches of `WindowParity`. */
  interface Reached {
    subscriptions: Disposable[]
    agents: Pick<Agents, "onActivity" | "receive">
    canvas: Pick<CanvasSurface, "layer" | "hold">
  }

  const parity: Reached = {
    subscriptions: [],
    agents: {
      onActivity(heard) {
        listener = heard

        return { dispose: () => void (listener = undefined) }
      },
      receive: () => undefined
    },
    canvas: {
      layer(options) {
        layers.push(options)

        return { dispose: () => void told.push(`layer ${options.id} gone`) }
      },
      hold(design, at) {
        told.push(`hold ${design} ${at.x},${at.y}`)

        return {
          update: () => undefined,
          release: () => void told.push(`release ${design}`),
          dispose: () => undefined
        }
      }
    }
  }

  return {
    // SAFETY: agent presence reaches only what `Reached` names, all stood in above.
    parity: parity as WindowParity,
    told,
    layers,
    tell: (steps: AgentStep[], from?: string) => listener?.(steps, from),
    listening: () => listener !== undefined,
    stop: () => {
      for (const subscription of parity.subscriptions.toReversed()) {
        subscription.dispose()
      }
    }
  }
}

const move: AgentStep = {
  kind: "move",
  agentId: "claude",
  ref: { owner: "design", type: "design", key: "card" },
  from: { x: 0, y: 0 },
  to: { x: 40, y: 40 }
}

describe("agent presence's window module", () => {
  it("draws in one layer over the selection, and plays this copy's agents and other copies' alike", async () => {
    const tab = standIn()
    const { window } = await agentPresence.activateWindow(tab.parity)
    const queue = window!.queue

    tab.tell([{ kind: "read", agentId: "claude" }])
    tab.tell([{ kind: "read", agentId: "claude" }], "peer-2")

    expect(tab.layers).toEqual([{ id: "agentPresence.agents", space: "page", order: "overSelection" }])
    expect(queue.agents()).toEqual(["claude", "peer-2:claude"])
  })

  it("holds a moved board as the step is told, before its write lands, and lets it go as it stops", async () => {
    const tab = standIn()
    const { window } = await agentPresence.activateWindow(tab.parity)
    window!.queue.watch()

    tab.tell([move], "peer-2")
    expect(tab.told).toEqual(["hold card 0,0"])

    tab.stop()
    expect(tab.told).toEqual(["hold card 0,0", "release card", "layer agentPresence.agents gone"])
    expect(tab.listening()).toBe(false)
  })
})
