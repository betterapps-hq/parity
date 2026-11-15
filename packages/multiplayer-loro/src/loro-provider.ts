import type { DocProvider } from "@parity-app/multiplayer"
import type { ReplicaPair } from "@parity-app/multiplayer/testing"
import { openLoro } from "./backend.ts"

/** The project document on Loro, which merges others' changes: `name` is `loro`, `sync` is true. */
export const loroProvider: DocProvider = {
  name: "loro",
  sync: true,
  open: (options) => openLoro(options)
}

/**
 * Two replicas of one project, the second loaded from the first's snapshot as a second person would, that exchange
 * their updates: for the concurrent shared tests and the benchmark's exchange.
 */
export const loroReplicas: ReplicaPair = {
  open: (options) => {
    const a = openLoro(options)
    const b = openLoro(options, a.doc.export({ mode: "snapshot" }))

    return {
      a,
      b,
      exchange: () => {
        const fromA = a.updates(b.versionVector())
        const fromB = b.updates(a.versionVector())
        b.receive(fromA)
        a.receive(fromB)
        // Repairs each side made after taking the other's changes reach the other too, and merge to one result.
        const repairsA = a.updates(b.versionVector())
        const repairsB = b.updates(a.versionVector())
        b.receive(repairsA)
        a.receive(repairsB)
      }
    }
  }
}
