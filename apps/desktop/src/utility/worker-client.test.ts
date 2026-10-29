import { Worker } from "node:worker_threads"
import { afterEach, describe, expect, it } from "vitest"
import { type WorkerClientOptions, workerClient } from "./worker-client.ts"

/**
 * Answers each request with the request, its thread and how many it has answered, after `wait` ms if asked to wait.
 * `fail` answers with an error, `crash` throws and `exit` stops the thread with that code.
 */
const echo = `
const { parentPort, threadId } = require("node:worker_threads")
let answered = 0
parentPort.on("message", (message) => {
  if (message.crash) throw new Error("the worker broke")
  if (message.exit) process.exit(message.exit)
  setTimeout(() => {
    if (message.fail) parentPort.postMessage({ id: message.id, error: message.fail })
    else parentPort.postMessage({ id: message.id, result: { ...message, answered: ++answered, thread: threadId } })
  }, message.wait ?? 0)
})
`

interface Answer {
  answered: number
  thread: number
}

const stops: Array<() => void> = []

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
})

function setup(options: Partial<WorkerClientOptions> = {}) {
  let stoppedIdle = 0
  const waiting: Array<() => void> = []
  const client = workerClient({
    start: () => new Worker(echo, { eval: true }),
    idleMs: 40,
    stopped: () => {
      stoppedIdle++
      for (const resolve of waiting.splice(0)) resolve()
    },
    ...options
  })
  stops.push(() => client.stop(new Error("The test ended")))
  const ask = (message: Record<string, unknown> = {}) => client.request(message) as Promise<Answer>
  return {
    client,
    ask,
    stoppedIdle: () => stoppedIdle,
    idleStop: () => new Promise<void>((resolve) => waiting.push(resolve))
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("workerClient", () => {
  it("keeps one worker between requests, stops it once it has sat idle, and starts another when asked", async () => {
    const { client, ask, idleStop, stoppedIdle } = setup()
    const first = await ask()
    const second = await ask()
    expect(second).toMatchObject({ answered: 2, thread: first.thread })
    expect(client.running).toBe(true)

    await idleStop()
    expect(client.running).toBe(false)
    const third = await ask()
    expect(third.answered).toBe(1)
    expect(third.thread).not.toBe(first.thread)
    expect(stoppedIdle()).toBe(1)
  })

  it("doesn't stop while a request waits, and waits again from the last answer", async () => {
    const { client, ask, stoppedIdle } = setup()
    const slow = ask({ wait: 200 })
    await pause(120)
    expect(client.running).toBe(true)
    await slow
    await pause(20)
    const next = await ask()
    expect(next.answered).toBe(2)
    expect(stoppedIdle()).toBe(0)
  })

  it("sends a request made while the old worker is stopping to a new one", async () => {
    // Asked for the moment the idle worker is told to stop, before it has.
    let send: (request: Promise<unknown>) => void = () => undefined
    const during = new Promise<unknown>((resolve) => (send = resolve))
    const { client, ask } = setup({ stopped: () => send(client.request({})) })
    const first = await ask()
    const answer = (await during) as Answer
    expect(answer.answered).toBe(1)
    expect(answer.thread).not.toBe(first.thread)
    expect(client.running).toBe(true)
  })

  it("fails one request the worker answered with an error, and keeps the worker", async () => {
    const { client, ask } = setup()
    await expect(ask({ fail: "That file doesn't exist" })).rejects.toThrow("That file doesn't exist")
    expect(client.running).toBe(true)
    expect((await ask()).answered).toBe(1)
  })

  it("fails what's waiting when stopped, and starts again on the next request", async () => {
    const { client, ask } = setup()
    const first = await ask()
    const waiting = ask({ wait: 5000 })
    client.stop(new Error("The project closed"))
    await expect(waiting).rejects.toThrow("The project closed")
    expect(client.running).toBe(false)
    const next = await ask()
    expect(next.thread).not.toBe(first.thread)
  })

  it("fails what's waiting with the reason given when the worker fails, and starts again", async () => {
    const { client, ask } = setup({ failed: (error) => new Error(`The type checker failed: ${error.message}`) })
    const waiting = ask({ wait: 5000 })
    await expect(ask({ crash: true })).rejects.toThrow("The type checker failed: the worker broke")
    await expect(waiting).rejects.toThrow("The type checker failed: the worker broke")
    expect(client.running).toBe(false)
    expect((await ask()).answered).toBe(1)
  })

  it("fails what's waiting when the worker stops by itself", async () => {
    const { ask } = setup()
    await expect(ask({ exit: 3 })).rejects.toThrow("The worker stopped with exit code 3")
    expect((await ask()).answered).toBe(1)
  })
})
