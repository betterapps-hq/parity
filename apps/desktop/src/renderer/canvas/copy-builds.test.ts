import { describe, expect, it } from "vite-plus/test"
import { copyBuilds } from "./copy-builds.ts"

/** A queue on a clock the test moves: each step takes `stepMs`, and frames run when the test says. */
function queue(stepMs = 1, budget = 4) {
  let time = 0
  const frames: (() => void)[] = []

  const builds = copyBuilds(
    (run) => frames.push(run),
    () => time,
    budget
  )

  /** Steps that take `stepMs` each, noting each one in `log` under `name`. */
  function* steps(name: string, count: number, log: string[]): Generator<void, string> {
    for (let index = 0; index < count; index++) {
      time += stepMs
      log.push(name)
      yield
    }

    return name
  }

  const frame = () => {
    const pending = frames.splice(0)
    pending.forEach((run) => run())

    return pending.length
  }

  return { builds, steps, frame }
}

describe("copyBuilds", () => {
  it("runs a build over frames, a budget's worth each, and gives what it returns once it's whole", () => {
    const { builds, steps, frame } = queue()
    const log: string[] = []
    const done: string[] = []
    builds.build(
      steps("a", 10, log),
      () => 0,
      (value) => done.push(value)
    )

    frame()

    expect(log).toHaveLength(4)
    expect(done).toEqual([])

    frame()
    frame()

    expect(log).toHaveLength(10)
    expect(done).toEqual(["a"])
    expect(frame()).toBe(0)
  })

  it("builds the most urgent first", () => {
    const { builds, steps, frame } = queue()
    const log: string[] = []
    const done: string[] = []
    builds.build(
      steps("far", 2, log),
      () => 5,
      (value) => done.push(value)
    )
    builds.build(
      steps("near", 2, log),
      () => 1,
      (value) => done.push(value)
    )

    frame()

    expect(log).toEqual(["near", "near"])

    frame()

    expect(log).toEqual(["near", "near", "far", "far"])
    expect(done).toEqual(["near", "far"])
  })

  it("finishes one build a frame, so boards that come near together swap in a frame apart", () => {
    const { builds, steps, frame } = queue(0.1)
    const done: string[] = []
    builds.build(
      steps("a", 2, []),
      () => 0,
      (value) => done.push(value)
    )
    builds.build(
      steps("b", 2, []),
      () => 1,
      (value) => done.push(value)
    )

    frame()

    expect(done).toEqual(["a"])

    frame()

    expect(done).toEqual(["a", "b"])
  })

  it("drops a cancelled build", () => {
    const { builds, steps, frame } = queue()
    const log: string[] = []
    const done: string[] = []

    const cancel = builds.build(
      steps("a", 10, log),
      () => 0,
      (value) => done.push(value)
    )

    frame()
    cancel()
    frame()

    expect(log).toHaveLength(4)
    expect(done).toEqual([])
  })
})
