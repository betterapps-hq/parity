import { useSyncExternalStore } from "react"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { heldBoards } from "./held-boards.ts"

/**
 * What agents are doing in each tab, as a queue per agent the canvas plays back at a readable pace, each with its
 * own cursor. Agents work in milliseconds; people need a second or two per step to follow along.
 */
class PresenceQueue {
  private readonly queues = new Map<string, PresenceEvent[]>()
  private readonly listeners = new Set<() => void>()
  /** Agents with a cursor in each tab, in the order they arrived. */
  private readonly present = new Map<string, string[]>()
  /** Tabs whose canvas is playing their queue, by how many players. */
  private readonly watched = new Map<string, number>()
  private version = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = () => this.version

  /** Marks a tab's queue as played, so its moves wait for the cursor to drag them. */
  watch(tab: string): () => void {
    this.watched.set(tab, (this.watched.get(tab) ?? 0) + 1)
    return () => {
      const count = (this.watched.get(tab) ?? 1) - 1
      if (count > 0) this.watched.set(tab, count)
      else this.watched.delete(tab)
    }
  }

  push(events: PresenceEvent[]): void {
    for (const event of events) {
      const id = queueId(event.tab, agentOf(event))
      const queue = this.queues.get(id) ?? []
      // A long call shouldn't take minutes to replay: keep the start, the latest steps and the end.
      if (queue.length > 24) {
        for (const dropped of queue.splice(1, queue.length - 16)) {
          if (dropped.kind === "move" && dropped.design && dropped.to)
            heldBoards.finish(dropped.tab, dropped.design, dropped.to)
        }
      }
      // A move lands on the canvas before the cursor gets to it; hold the board back until it does.
      if (event.kind === "move" && event.design && event.from && event.to) {
        if (!this.watched.has(event.tab)) continue
        heldBoards.hold(event.tab, event.design, event.from)
      }
      queue.push(event)
      this.queues.set(id, queue)
      const present = this.present.get(event.tab) ?? []
      if (!present.includes(agentOf(event))) this.present.set(event.tab, [...present, agentOf(event)])
    }
    this.version++
    for (const listener of this.listeners) listener()
  }

  /** The agents with a cursor in a tab: from their first step until they retire. */
  agents(tab: string): string[] {
    return this.present.get(tab) ?? noAgents
  }

  /** Takes an idle agent's cursor away, unless it has steps waiting again. */
  retire(tab: string, agent: string): void {
    if (this.waiting(tab, agent) > 0) return
    const present = this.present.get(tab)?.filter((id) => id !== agent) ?? []
    if (present.length > 0) this.present.set(tab, present)
    else this.present.delete(tab)
    this.version++
    for (const listener of this.listeners) listener()
  }

  /** How many of an agent's steps are waiting to play in a tab. */
  waiting(tab: string, agent: string): number {
    return this.queues.get(queueId(tab, agent))?.length ?? 0
  }

  take(tab: string, agent: string): PresenceEvent | undefined {
    const event = this.queues.get(queueId(tab, agent))?.shift()
    if (event) this.version++
    return event
  }
}

const noAgents: string[] = []

/** Which agent an event is from; calls that don't say share one cursor. */
export function agentOf(event: PresenceEvent): string {
  return event.agentId ?? event.agent ?? "agent"
}

function queueId(tab: string, agent: string): string {
  return `${tab}\n${agent}`
}

export const presence = new PresenceQueue()

export function usePresenceVersion(): number {
  return useSyncExternalStore(presence.subscribe, presence.getVersion)
}
