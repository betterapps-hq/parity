import { defineWindowModule } from "@parity-app/extension/internal"
import { AgentPresence } from "./AgentPresence.tsx"
import { AgentQueue } from "./queue.ts"

/*
 * Agent presence's window module (docs/proposals/extensions-in-the-window.md, "Agent presence"). In each project tab it
 * listens to every agent step core reports, this copy's and those another copy passed in, queues them per agent, holds
 * each moved board where it was until the agent's pointer has dragged it, and plays the queue in a layer over the
 * selection. Turned off, agents still work; nothing draws them.
 */

/** What it offers other window modules in the tab: the queue it plays, for tests and stories to drive. */
export interface AgentPresenceApi {
  queue: AgentQueue
}

export default defineWindowModule<AgentPresenceApi>({
  activateWindow(parity) {
    const queue = new AgentQueue((design, at) => parity.canvas.hold(design, at))

    parity.subscriptions.push(
      // Steps are told before the writes they describe are applied, so a moved board is held before it can jump.
      parity.agents.onActivity((steps, from) => queue.push(steps, from)),
      parity.canvas.layer(
        { id: "agentPresence.agents", space: "page", order: "overSelection" },
        <AgentPresence queue={queue} />
      ),
      { dispose: () => queue.dispose() }
    )

    return { window: { queue } }
  }
})
