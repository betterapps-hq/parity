import { type AgentStep, type Held, holdLimitMs, type Point } from "@parity-app/extension/internal"
import { behindLimitMs, fastestPace, paceBehind, paceFor } from "./motion.ts"

/** A step as the queue keeps it: with the copy it came from, when another copy's agent took it. */
export interface QueuedStep extends AgentStep {
  /** The copy that passed it on, as `parity.agents.onActivity` gives it; absent for this copy's agents. */
  copy?: string
}

/** What the queue holds boards with: `parity.canvas.hold`. */
export type HoldBoard = (design: string, at: Point) => Held

/** About how long a visit takes at the fastest pace: travelling there and scanning it. */
const hurriedVisitMs = 1600

/** About how long a pointer takes to reach a board and grab it at the fastest pace. */
const grabMs = 1200

/** The shortest drag worth drawing: with less of its hold left, a board is let go where it landed. */
const shortestDragMs = 400

/** A move's hold, and when core lets go of it (`holdLimitMs` after it was taken). */
interface Hold {
  held: Held
  until: number
}

/**
 * What agents are doing in a project tab, as a queue per agent the canvas plays back at a readable pace, each with its
 * own pointer. Agents work in milliseconds; people need a second or two per step to follow along.
 *
 * An agent is known by its key: its id for this copy's agents, `${copy}:${agentId}` for another copy's, the same key
 * its color is claimed under. Steps from another copy play exactly as this copy's do.
 *
 * A pointer never falls far behind its agent: it plays faster the longer a step waited for its turn, and skips the
 * steps that waited longer than `behindLimitMs`, all but the latest, so a short call never plays for long after it.
 */
export class AgentQueue {
  /** The hold on each move's board, from when it's queued until its pointer has dragged the board there. */
  private readonly held = new WeakMap<QueuedStep, Hold>()
  /** Moves whose hold ran out before their pointer got to them: their boards landed, so nothing is dragged. */
  private readonly landed = new WeakSet<QueuedStep>()
  /** When each step was told. */
  private readonly told = new WeakMap<QueuedStep, number>()
  /** How long each step had waited when its turn came. */
  private readonly waited = new WeakMap<QueuedStep, number>()
  private readonly queues = new Map<string, QueuedStep[]>()
  private readonly listeners = new Set<() => void>()
  /** Agents with a pointer, in the order they arrived. */
  private present: string[] = []
  /** How many players are playing the queue: moves are held only while one is. */
  private players = 0
  private version = 0
  private readonly hold: HoldBoard
  private readonly now: () => number

  constructor(hold: HoldBoard, now: () => number = () => performance.now()) {
    this.hold = hold
    this.now = now
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

        this.held.set(queued, { held: this.hold(design, queued.from), until: this.now() + holdLimitMs })
      }

      this.told.set(queued, this.now())
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
    this.held.get(step)?.held.update(at)
  }

  /** A move has played, or been skipped: its board is let go at `to`. */
  letGo(step: QueuedStep, to: Point): void {
    const held = this.held.get(step)?.held
    this.held.delete(step)
    held?.update(to)
    held?.release()
  }

  /** How long a move's board stays held, in ms; `Infinity` for a move with nothing held. */
  heldFor(step: QueuedStep): number {
    const hold = this.held.get(step)

    return hold ? hold.until - this.now() : Infinity
  }

  /** Whether a move's pointer drags it: not once its board has landed, with its hold run out. */
  drags(step: QueuedStep): boolean {
    return step.kind === "move" && !this.landed.has(step)
  }

  /**
   * How fast an agent's pointer plays `playing`, the step it took, as a share of its own pace: faster as steps pile up
   * or the longer it waited for its turn, and as fast as it goes while a moved board waits for it, the one it's
   * dragging included.
   */
  pace(agent: string, playing?: QueuedStep): number {
    const queue = this.queues.get(agent) ?? []
    const held = (step: QueuedStep) => this.held.has(step)

    if ((playing && held(playing)) || queue.some(held)) {
      return fastestPace
    }

    return Math.min(paceFor(queue.length), paceBehind(playing ? (this.waited.get(playing) ?? 0) : 0))
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

  /**
   * The agent's next step. Visits that waited longer than `behindLimitMs` are skipped while a later one waits, and a
   * move skipped lands where the agent put it. Core lets go of a hold after `holdLimitMs`, so a moved board is held
   * only while its pointer can still drag it: visits ahead of the move that wouldn't leave time to are skipped, and a
   * move whose hold has all but run out lands where the agent put it, with its pointer visiting it there.
   */
  take(agent: string): QueuedStep | undefined {
    const queue = this.queues.get(agent)

    if (queue) {
      this.catchUp(queue)
      this.makeTime(queue)
    }

    const step = queue?.shift()

    if (!step) {
      return undefined
    }

    this.version += 1
    this.waited.set(step, this.now() - (this.told.get(step) ?? this.now()))

    if (this.heldFor(step) < grabMs + shortestDragMs && step.to) {
      this.letGo(step, step.to)
      this.landed.add(step)
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

  /** Skips the visits that have waited longer than `behindLimitMs`, all but the latest, letting go of skipped moves. */
  private catchUp(queue: QueuedStep[]) {
    const late = (step: QueuedStep) => visited(step) && this.now() - (this.told.get(step) ?? this.now()) > behindLimitMs

    for (let index = queue.findLastIndex(visited) - 1; index >= 0; index -= 1) {
      const step = queue[index]!

      if (!late(step)) {
        continue
      }

      queue.splice(index, 1)

      if (step.kind === "move" && step.to) {
        this.letGo(step, step.to)
      }
    }
  }

  /** Skips the oldest visits ahead of the first held move, until its pointer can reach it at the fastest pace. */
  private makeTime(queue: QueuedStep[]) {
    const move = queue.findIndex((step) => this.held.has(step))

    if (move <= 0) {
      return
    }

    const left = this.heldFor(queue[move]!)
    let visits = queue.slice(0, move).filter(visited).length

    while (visits > 0 && left < grabMs + visits * hurriedVisitMs) {
      queue.splice(queue.findIndex(visited), 1)
      visits -= 1
    }
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

/** Whether the pointer travels to a step, as it does for every step but a call's start and end. */
function visited(step: QueuedStep): boolean {
  return step.kind !== "start" && step.kind !== "end"
}
