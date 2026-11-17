/*
 * Agents in the room, for their colors (PAR-1277). Agent presence claims each agent's color under its own key: the
 * agent's id for this copy's agents, `${copy}:${agentId}` for another copy's. The room knows every agent by the second
 * form, so the host can number them all, as it numbers people, and each copy assigns the numbers under its own keys.
 */

/** Every agent seen in the room, by its room key, and the copy it works in. */
export class RoomAgents {
  readonly #copies = new Map<string, string>()

  /** An agent at work in `copy`. Says whether it's new to the room. */
  seen(copy: string, agentId: string): boolean {
    const key = roomAgentKey(copy, agentId)

    if (this.#copies.has(key)) {
      return false
    }

    this.#copies.set(key, copy)

    return true
  }

  /** An agent another host numbered, by its room key, so this copy keeps its number if it comes to host. */
  numbered(key: string): void {
    const at = key.indexOf(":")

    if (at > 0 && !this.#copies.has(key)) {
      this.#copies.set(key, key.slice(0, at))
    }
  }

  /** Forgets the agents of copies that aren't here any more. */
  keepOnly(peers: readonly string[]): void {
    for (const [key, copy] of this.#copies) {
      if (!peers.includes(copy)) {
        this.#copies.delete(key)
      }
    }
  }

  /** Every agent's room key, in the order they were first seen. */
  keys(): string[] {
    return [...this.#copies.keys()]
  }
}

/** An agent as the room knows it: its copy, then its id. */
export function roomAgentKey(copy: string, agentId: string): string {
  return `${copy}:${agentId}`
}

/** The key agent presence claims an agent's color under in copy `self`: its id when it's this copy's own. */
export function localAgentKey(key: string, self: string): string {
  const own = `${self}:`

  return key.startsWith(own) ? key.slice(own.length) : key
}
