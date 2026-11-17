import type { AgentStep, Point } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import { AgentQueue, agentKey, movedBoard } from "./queue.ts"

const board = (key: string) => ({ owner: "design", type: "design", key })

/** A queue whose holds are written down as `hold card 0,0`, `update card 40,40` and `release card`. */
function queued() {
  const told: string[] = []

  const queue = new AgentQueue((design, at) => {
    told.push(`hold ${design} ${at.x},${at.y}`)

    return {
      update: (next: Point) => void told.push(`update ${design} ${next.x},${next.y}`),
      release: () => void told.push(`release ${design}`),
      dispose: () => void told.push(`dispose ${design}`)
    }
  })

  return { queue, told }
}

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
