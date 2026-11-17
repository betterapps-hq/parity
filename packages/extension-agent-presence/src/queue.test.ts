import { type AgentStep, holdLimitMs, type Point } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import { behindLimitMs, fastestPace, paceFor, travelMs } from "./motion.ts"
import { AgentQueue, agentKey, movedBoard, type QueuedStep } from "./queue.ts"
import { scanCoveredShare, scanMs } from "./scanner.ts"

const board = (key: string) => ({ owner: "design", type: "design", key })

/** A queue whose holds are written down as `hold card 0,0`, `update card 40,40` and `release card`, on a clock of its own. */
function queued() {
  const told: string[] = []
  const clock = { now: 0 }

  const queue = new AgentQueue(
    (design, at) => {
      told.push(`hold ${design} ${at.x},${at.y}`)

      return {
        update: (next: Point) => void told.push(`update ${design} ${next.x},${next.y}`),
        release: () => void told.push(`release ${design}`),
        dispose: () => void told.push(`dispose ${design}`)
      }
    },
    () => clock.now
  )

  return { queue, told, clock }
}

/** The longest a pointer takes over a visit at its own pace: the farthest travel, then the scan until it covers. */
const longestVisitMs = travelMs({ x: 0, y: 0 }, { x: 100_000, y: 0 }) + scanMs * scanCoveredShare

/**
 * Plays steps told at the times given as `AgentPresence` would, each visit taking its longest, and returns when the
 * last one has played, on the queue's clock.
 */
function play(told: { at: number; step: AgentStep }[]): number {
  const { queue, clock } = queued()
  queue.watch()
  const waiting = [...told]
  let now = 0

  for (;;) {
    while (waiting.length > 0 && waiting[0]!.at <= now) {
      const { at, step } = waiting.shift()!
      clock.now = at
      queue.push([step])
    }

    clock.now = now
    const step: QueuedStep | undefined = queue.take("claude")

    if (step) {
      const visited = step.kind !== "start" && step.kind !== "end"
      now += visited ? longestVisitMs * queue.pace("claude", step) : 60
    } else if (waiting.length > 0) {
      now = waiting[0]!.at
    } else {
      return now
    }
  }
}

const read: AgentStep = { kind: "read", agentId: "claude", ref: board("card") }

const move: AgentStep = {
  kind: "move",
  agentId: "claude",
  ref: board("card"),
  from: { x: 0, y: 0 },
  to: { x: 40, y: 40 }
}

describe("the agent queue", () => {
  it("queues each agent's steps in order, with a pointer from its first step until it retires", () => {
    const { queue } = queued()

    queue.push([
      { kind: "start", agentId: "claude" },
      { kind: "read", agentId: "cursor", ref: board("card") },
      { kind: "read", agentId: "claude", ref: board("card") }
    ])

    expect(queue.agents()).toEqual(["claude", "cursor"])
    expect(queue.waiting("claude")).toBe(2)
    expect(queue.take("claude")?.kind).toBe("start")

    queue.retire("claude")
    expect(queue.agents()).toEqual(["claude", "cursor"])

    queue.take("claude")
    queue.retire("claude")
    expect(queue.agents()).toEqual(["cursor"])
  })

  it("keeps another copy's agents apart from this copy's, under the key their colors are claimed by", () => {
    const { queue } = queued()

    queue.push([{ kind: "read", agentId: "claude" }])
    queue.push([{ kind: "read", agentId: "claude" }], "peer-2")

    expect(queue.agents()).toEqual(["claude", "peer-2:claude"])
    expect(queue.take("peer-2:claude")).toMatchObject({ kind: "read", copy: "peer-2" })
  })

  it("holds a moved board where it was while it's played, until its pointer has dragged it there", () => {
    const { queue, told } = queued()
    const unwatch = queue.watch()

    queue.push([move])
    const step = queue.take("claude")!
    queue.drawHeld(step, { x: 20, y: 20 })
    queue.letGo(step, { x: 40, y: 40 })
    unwatch()

    expect(told).toEqual(["hold card 0,0", "update card 20,20", "update card 40,40", "release card"])
  })

  it("leaves moves alone while nothing plays the queue, as in a hidden tab", () => {
    const { queue, told } = queued()

    queue.push([move])

    expect(told).toEqual([])
    expect(queue.waiting("claude")).toBe(0)
  })

  it("keeps a long call's start and its latest steps, letting go of the boards it skips", () => {
    const { queue, told } = queued()
    queue.watch()

    queue.push([{ kind: "start", agentId: "claude" }, move])
    queue.push(Array.from({ length: 24 }, (): AgentStep => ({ kind: "read", agentId: "claude" })))

    expect(queue.waiting("claude")).toBe(17)
    expect(queue.take("claude")?.kind).toBe("start")
    expect(told).toEqual(["hold card 0,0", "update card 40,40", "release card"])
  })

  it("plays a 1.8 s call that reads 60 layers within 11 s of its start", () => {
    // The call's start, a read every 30 ms, and its end: a call that touches many targets.
    const start: AgentStep = { kind: "start", agentId: "claude" }
    const end: AgentStep = { kind: "end", agentId: "claude" }

    const call = [
      { at: 0, step: start },
      ...Array.from({ length: 60 }, (_, index) => ({ at: index * 30, step: read })),
      { at: 1800, step: end }
    ]

    // 11 s is the call's 1.8 s, a pointer at most 6 s behind it, and its last visits hurried: about 1.5 s each.
    expect(play(call)).toBeLessThanOrEqual(11_000)
  })

  it("skips the visits that waited too long for the latest, letting a skipped board land where it was put", () => {
    const { queue, told, clock } = queued()
    queue.watch()

    queue.push([{ kind: "start", agentId: "claude" }, move, read, read])
    clock.now = behindLimitMs + 1
    queue.push([
      { ...read, label: "latest" },
      { kind: "end", agentId: "claude" }
    ])

    expect(queue.take("claude")?.kind).toBe("start")
    expect(queue.take("claude")?.label).toBe("latest")
    expect(queue.take("claude")?.kind).toBe("end")
    expect(told).toEqual(["hold card 0,0", "update card 40,40", "release card"])
  })

  it("lets skipped moves of one board go in the order they were told, leaving it where the last one put it", () => {
    const { queue, told, clock } = queued()
    queue.watch()
    const moved = (from: number, to: number): AgentStep => ({ ...move, from: { x: from, y: 0 }, to: { x: to, y: 0 } })

    queue.push([moved(0, 100), moved(100, 200)])
    clock.now = behindLimitMs + 1
    queue.push([moved(200, 300)])
    queue.take("claude")

    expect(told.filter((line) => line.startsWith("update"))).toEqual(["update card 100,0", "update card 200,0"])
  })

  it("keeps the latest visit however long it waited, played faster for it", () => {
    const { queue, clock } = queued()

    queue.push([read])
    clock.now = behindLimitMs + 1
    const step = queue.take("claude")!

    expect(step.kind).toBe("read")
    expect(queue.pace("claude", step)).toBe(fastestPace)
  })

  it("drags a moved board while it's held, playing as fast as it goes until the pointer has it", () => {
    const { queue, clock } = queued()
    queue.watch()

    queue.push([read, read, read, read])
    expect(queue.pace("claude")).toBe(paceFor(4))

    queue.push([move])
    expect(queue.pace("claude")).toBe(fastestPace)

    clock.now = 2000
    expect(queue.take("claude")?.kind).toBe("read")
    expect(queue.waiting("claude")).toBe(4)

    while (queue.waiting("claude") > 1) {
      queue.take("claude")
    }

    const step = queue.take("claude")!
    expect(queue.drags(step)).toBe(true)
    expect(queue.heldFor(step)).toBe(holdLimitMs - 2000)
    expect(queue.pace("claude", step)).toBe(fastestPace)
  })

  it("skips the visits ahead of a held move that would leave its pointer no time to drag it", () => {
    const { queue, clock } = queued()
    queue.watch()

    queue.push([{ kind: "start", agentId: "claude" }, read, read, read, read, read, read, move])
    clock.now = 4000

    // 6 s of the hold left: time to reach the board and grab it, and three visits on the way.
    expect(queue.take("claude")?.kind).toBe("start")
    expect(queue.waiting("claude")).toBe(4)
    expect(queue.take("claude")?.kind).toBe("read")
  })

  it("lets a board land where it was put once its hold has all but run out, and visits it there", () => {
    const { queue, told, clock } = queued()
    queue.watch()

    queue.push([move])
    clock.now = 9000
    const step = queue.take("claude")!

    expect(queue.drags(step)).toBe(false)
    expect(queue.heldFor(step)).toBe(Infinity)
    expect(told).toEqual(["hold card 0,0", "update card 40,40", "release card"])
  })

  it("lets go of every board still held as it stops", () => {
    const { queue, told } = queued()
    queue.watch()

    queue.push([move])
    queue.dispose()

    expect(told).toEqual(["hold card 0,0", "update card 40,40", "release card"])
    expect(queue.agents()).toEqual([])
  })

  it("tells listeners when agents come and go", () => {
    const { queue } = queued()
    let changes = 0
    const stop = queue.subscribe(() => void (changes += 1))

    queue.push([{ kind: "read", agentId: "claude" }])
    queue.take("claude")
    queue.retire("claude")
    stop()
    queue.push([{ kind: "read", agentId: "claude" }])

    expect(changes).toBe(2)
  })
})

describe("what a step names", () => {
  it("finds the board a move drags, even with a slash in its key", () => {
    expect(movedBoard({ ref: board("pages/app.par#card") })).toBe("pages/app.par#card")
    expect(movedBoard({ ref: { owner: "design", type: "frame", key: "app.par#card/row" } })).toBeUndefined()
    expect(movedBoard({})).toBeUndefined()
    expect(agentKey({ kind: "read", agentId: "a", copy: "peer" })).toBe("peer:a")
  })
})
