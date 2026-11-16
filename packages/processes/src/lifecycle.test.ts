import { describe, expect, it, vi } from "vite-plus/test"
import { type ChildEnd, type ChildHandle, endedByItself, lifecycle, tailLength } from "./lifecycle.ts"

/** A child that prints and ends when the test says, and ends with SIGTERM when killed, as a real one would. */
function fakeChild(pid: number | undefined = 42) {
  let print: (text: string) => void = () => undefined
  let finish: (end: ChildEnd) => void = () => undefined
  const kill = vi.fn<() => void>(() => setTimeout(() => finish({ signal: "SIGTERM" }), 0))

  const child: ChildHandle = {
    pid,
    onOutput: (listener) => (print = listener),
    onEnd: (listener) => (finish = listener),
    kill
  }

  return { child, kill, print: (text: string) => print(text), end: (end: ChildEnd) => finish(end) }
}

describe("lifecycle", () => {
  it("settles once with how the child ended by itself, and the end of what it printed", async () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    fake.print("starting\n")
    fake.print("Port 6006 is in use\n")
    fake.end({ code: 2 })
    fake.end({ code: 3 })

    expect(await life.exited).toEqual({
      code: 2,
      how: "exit code 2",
      stopped: false,
      timedOut: false,
      output: "starting\nPort 6006 is in use\n"
    })
    expect(life.running).toBe(false)
    expect(life.pid).toBe(42)
  })

  it("keeps only the last characters of what the child printed", () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    fake.print("a".repeat(tailLength))
    fake.print("end")

    expect(life.tail()).toHaveLength(tailLength)
    expect(life.tail().endsWith("aend")).toBe(true)
  })

  it("counts a child it stopped as stopped, not crashed", async () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    life.stop()

    expect(life.stopping).toBe(true)
    expect(await life.exited).toMatchObject({ how: "signal SIGTERM", stopped: true, timedOut: false })
    expect(fake.kill).toHaveBeenCalledTimes(1)
  })

  it("ends a child whose deadline passes, and says so before it has ended", async () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    const passed = vi.fn<() => void>(() => expect(life.running).toBe(true))
    life.deadline(5, passed)

    expect(await life.exited).toMatchObject({ stopped: false, timedOut: true })
    expect(passed).toHaveBeenCalledTimes(1)
    expect(fake.kill).toHaveBeenCalledTimes(1)
  })

  it("leaves a child alone once its deadline is called off, or once it has ended", async () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    const cancel = life.deadline(5)
    cancel()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fake.kill).not.toHaveBeenCalled()

    life.deadline(5)
    fake.end({ code: 0 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fake.kill).not.toHaveBeenCalled()
    expect(await life.exited).toMatchObject({ code: 0, timedOut: false })
  })

  it("doesn't kill a child twice, or one that has ended", async () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    life.stop()
    await life.exited
    life.stop()

    expect(fake.kill).toHaveBeenCalledTimes(1)
  })

  it("says why a child couldn't start", async () => {
    const fake = fakeChild(undefined)
    const life = lifecycle(fake.child)
    fake.end({ error: new Error("spawn storybook ENOENT") })

    const exit = await life.exited
    expect(exit.how).toBe("spawn storybook ENOENT")
    expect(endedByItself("Storybook", exit)).toBe("Storybook couldn't start: spawn storybook ENOENT")
  })
})

describe("endedByItself", () => {
  it("says how the child ended, then the end of what it printed", async () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    fake.print("Error: Cannot find module 'vite'\n")
    fake.end({ code: 1 })

    expect(endedByItself("Vite", await life.exited)).toBe(
      "Vite stopped by itself, with exit code 1:\nError: Cannot find module 'vite'"
    )
  })

  it("leaves out the output of a child that printed nothing", async () => {
    const fake = fakeChild()
    const life = lifecycle(fake.child)
    fake.end({ signal: "SIGKILL" })

    expect(endedByItself("Vite", await life.exited)).toBe("Vite stopped by itself, with signal SIGKILL")
  })
})
