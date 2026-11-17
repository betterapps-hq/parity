import type { PresenceEvent } from "../../shared/protocol.ts"

/**
 * Agents' activity in this window, as the agent API reports it, before the writes it describes are applied. Core only
 * passes it on: each tab's `parity.agents` tells window modules (`window-seams.ts`), and the agent presence extension
 * draws it. Steps another copy in a live room sent come in here too, told apart so they're never sent back.
 */
class AgentActivity {
  private readonly own = new Set<(events: PresenceEvent[]) => void>()
  private readonly passed = new Set<(events: PresenceEvent[], from: string) => void>()

  /** Listens to the events this copy's agents send, not those passed on from another copy. */
  onPush(listener: (events: PresenceEvent[]) => void): () => void {
    this.own.add(listener)

    return () => {
      this.own.delete(listener)
    }
  }

  /** Listens to the events other copies' agents sent, with the copy they came from. */
  onPassedOn(listener: (events: PresenceEvent[], from: string) => void): () => void {
    this.passed.add(listener)

    return () => {
      this.passed.delete(listener)
    }
  }

  /** Reports agents' events: this copy's, or with `passedOn` those another copy in a live room sent. */
  push(events: PresenceEvent[], passedOn: boolean | string = false): void {
    if (passedOn === false) {
      for (const listener of this.own) {
        listener(events)
      }

      return
    }

    // The development room doesn't say which copy sent them, so they're all one other copy's.
    const from = passedOn === true ? "room" : passedOn

    for (const listener of this.passed) {
      listener(events, from)
    }
  }
}

export const presence = new AgentActivity()
