import { describe, expect, it } from "vite-plus/test"
import { turns } from "./turns.ts"

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
})
