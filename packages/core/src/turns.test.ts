import { describe, expect, it } from "vite-plus/test"
import { distanceFromView, turns } from "./turns.ts"

/** A task that records when it starts and finishes only when `release` is called. */
function held(log: string[], name: string) {
  let release!: () => void
  let fail!: (error: Error) => void

  const done = new Promise<void>((resolve, reject) => {
    release = resolve
    fail = reject
  })

  return {
    task: async () => {
      log.push(name)
      await done

      return name
    },
    release: () => release(),
    fail: (error: Error) => fail(error)
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("turns", () => {
  it("runs no more than the limit at once, the earliest waiting next", async () => {
    const queue = turns(2)
    const log: string[] = []
    const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => held(log, name))
    const done = [a, b, c, d].map((task) => queue.run(task!.task))
    await tick()
    expect(log).toEqual(["a", "b"])
    b!.release()
    await tick()
    expect(log).toEqual(["a", "b", "c"])
    a!.release()
    c!.release()
    d!.release()
    expect(await Promise.all(done)).toEqual(["a", "b", "c", "d"])
  })

  it("frees a failed task's turn and gives its failure to whoever gave it", async () => {
    const queue = turns(1)
    const log: string[] = []
    const failing = held(log, "failing")
    const failed = queue.run(failing.task)
    const next = queue.run(async () => "next")
    failing.fail(new Error("The capture failed"))
    await expect(failed).rejects.toThrow("The capture failed")
    expect(await next).toBe("next")
  })

  it("takes the lowest ranked waiting task next, read when the turn frees up, then the unranked in order", async () => {
    const log: string[] = []
    const queue = turns(1)
    const first = held(log, "first")
    const ranks = { far: 50, near: 10, middle: 20 }

    const tasks = Object.fromEntries(
      ["far", "near", "middle", "unranked", "later"].map((name) => [name, held(log, name)])
    )

    void queue.run(first.task)
    void queue.run(tasks.far!.task, () => ranks.far)
    void queue.run(tasks.unranked!.task)
    void queue.run(tasks.near!.task, () => ranks.near)
    void queue.run(tasks.middle!.task, () => ranks.middle)
    void queue.run(tasks.later!.task)
    // The camera moved while they waited: what was far is now nearest.
    ranks.far = 0

    for (const done of [first, tasks.far!, tasks.near!, tasks.middle!, tasks.unranked!]) {
      done.release()
      await tick()
    }

    expect(log).toEqual(["first", "far", "near", "middle", "unranked", "later"])
  })
})

describe("distanceFromView", () => {
  const view = { left: 0, top: 0, width: 1000, height: 800 }

  it("ranks what's in the middle first, then the rest of the view, then what's around it", () => {
    const at = (left: number, top: number) => distanceFromView({ left, top, width: 100, height: 100 }, view)
    const middle = at(450, 350)
    const corner = at(0, 0)
    const outside = at(1200, 350)

    expect(middle).toBe(0)
    expect(corner).toBeGreaterThan(middle)
    expect(outside).toBeGreaterThan(corner)
  })
})
