import type { Point } from "./motion.ts"

interface Held {
  at: Point
  /** Moves of this board still waiting to play. */
  moves: number
  timer: ReturnType<typeof setTimeout>
}

/** However backed up playback gets, a held board lands where it belongs within this long. */
const holdLimitMs = 90_000

/**
 * Boards an agent moved, shown where they were until its cursor drags them there. The design store already has the
 * new position, and undo has the move; this only holds back where the canvas draws them.
 */
class HeldBoards {
  private readonly held = new Map<string, Held>()
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Where the canvas should draw a board instead of its stored position, while it's held. */
  at(tab: string, design: string): Point | undefined {
    return this.held.get(id(tab, design))?.at
  }

  /** Holds a board where it is for a move that hasn't played yet. A board already held stays where it's drawn. */
  hold(tab: string, design: string, from: Point): void {
    const key = id(tab, design)
    const current = this.held.get(key)
    if (current) clearTimeout(current.timer)
    this.held.set(key, {
      at: current?.at ?? from,
      moves: (current?.moves ?? 0) + 1,
      timer: setTimeout(() => this.release(key), holdLimitMs)
    })
    this.notify()
  }

  /** Draws a held board somewhere along its drag. */
  set(tab: string, design: string, at: Point): void {
    const held = this.held.get(id(tab, design))
    if (!held) return
    held.at = at
    this.notify()
  }

  /** One of a board's moves has played, or been skipped: it lets go after its last. */
  finish(tab: string, design: string, to: Point): void {
    const key = id(tab, design)
    const held = this.held.get(key)
    if (!held) return
    if (--held.moves > 0) {
      held.at = to
      this.notify()
    } else this.release(key)
  }

  private release(key: string): void {
    const held = this.held.get(key)
    if (!held) return
    clearTimeout(held.timer)
    this.held.delete(key)
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function id(tab: string, design: string): string {
  return `${tab}\n${design}`
}

export const heldBoards = new HeldBoards()
