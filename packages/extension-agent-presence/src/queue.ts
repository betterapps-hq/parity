import type { AgentStep, Held, Point } from "@parity-app/extension/internal"

/** A step as the queue keeps it: with the copy it came from, when another copy's agent took it. */
export interface QueuedStep extends AgentStep {
  /** The copy that passed it on, as `parity.agents.onActivity` gives it; absent for this copy's agents. */
  copy?: string
}

/** What the queue holds boards with: `parity.canvas.hold`. */
export type HoldBoard = (design: string, at: Point) => Held

/**
 * What agents are doing in a project tab, as a queue per agent the canvas plays back at a readable pace, each with its
 * own pointer. Agents work in milliseconds; people need a second or two per step to follow along.
 *
 * An agent is known by its key: its id for this copy's agents, `${copy}:${agentId}` for another copy's, the same key
 * its color is claimed under. Steps from another copy play exactly as this copy's do.
 */
export class AgentQueue {
  /** The hold on each move's board, from when it's queued until its pointer has dragged the board there. */
  private readonly held = new WeakMap<QueuedStep, Held>()
  private readonly queues = new Map<string, QueuedStep[]>()
  private readonly listeners = new Set<() => void>()
  /** Agents with a pointer, in the order they arrived. */
  private present: string[] = []
  /** How many players are playing the queue: moves are held only while one is. */
  private players = 0
  private version = 0
  private readonly hold: HoldBoard

  constructor(hold: HoldBoard) {
    this.hold = hold
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  /** Marks the queue as played, so its moves wait for the pointer to drag them. Returns what unmarks it. */
  watch(): () => void {
    this.players += 1
    let done = false

    return () => {
      if (!done) {
        done = true
        this.players -= 1
      }
    }
  }

  /**
   * Queues agents' steps, from `copy` when another copy's agents took them. It's called before the writes the steps
   * describe are applied, so a moved board is held where it was before it can show where it went.
   */
  push(steps: readonly AgentStep[], copy?: string): void {
    for (const step of steps) {
      const queued: QueuedStep = copy === undefined ? { ...step } : { ...step, copy }
      const agent = agentKey(queued)
      const queue = this.queues.get(agent) ?? []

      // A long call shouldn't take minutes to replay: keep the start, the latest steps and the end.
      if (queue.length > 24) {
        for (const dropped of queue.splice(1, queue.length - 16)) {
          if (dropped.kind === "move" && dropped.to) {
            this.letGo(dropped, dropped.to)
          }
        }
      }

      const design = movedBoard(queued)

      // A move lands on the canvas before the pointer gets to it; hold the board back until it does.
      if (queued.kind === "move" && design && queued.from && queued.to) {
        if (this.players === 0) {
          continue
        }

        this.held.set(queued, this.hold(design, queued.from))
      }

      queue.push(queued)
      this.queues.set(agent, queue)

      if (!this.present.includes(agent)) {
        this.present = [...this.present, agent]
      }
    }

    this.changed()
  }

  /** Draws a move's board somewhere along its drag. */
  drawHeld(step: QueuedStep, at: Point): void {
    this.held.get(step)?.update(at)
  }

  /** A move has played, or been skipped: its board is let go at `to`. */
  letGo(step: QueuedStep, to: Point): void {
    const held = this.held.get(step)
    this.held.delete(step)
    held?.update(to)
    held?.release()
  }

  /** The agents with a pointer: from their first step until they retire. */
  agents(): readonly string[] {
    return this.present
  }

  /** Takes an idle agent's pointer away, unless it has steps waiting again. */
  retire(agent: string): void {
    if (this.waiting(agent) > 0) {
      return
    }

    this.present = this.present.filter((each) => each !== agent)
    this.changed()
  }

  /** How many of an agent's steps are waiting to play. */
  waiting(agent: string): number {
    return this.queues.get(agent)?.length ?? 0
  }

  take(agent: string): QueuedStep | undefined {
    const step = this.queues.get(agent)?.shift()

    if (step) {
      this.version += 1
    }

    return step
  }

  /** Lets go of every board still held, as the extension stops in the tab. */
  dispose(): void {
    for (const queue of this.queues.values()) {
      for (const step of queue) {
        if (step.kind === "move" && step.to) {
          this.letGo(step, step.to)
        }
      }
    }

    this.queues.clear()
    this.present = []
    this.changed()
  }

  private changed() {
    this.version += 1

    for (const listener of this.listeners) {
      listener()
    }
  }
}

/** Which agent a step is from, unique across a room's copies, and the key its color is claimed under. */
export function agentKey(step: QueuedStep): string {
  return step.copy === undefined ? step.agentId : `${step.copy}:${step.agentId}`
}

/** The board a move drags: a move names its design itself, never a layer in it. */
export function movedBoard(step: Pick<AgentStep, "ref">): string | undefined {
  const { ref } = step

  return ref?.owner === "design" && ref.type === "design" ? ref.key : undefined
}
