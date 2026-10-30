import { Worker } from "node:worker_threads"
import type { CheckResult } from "@parity/code"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { typeChecker } from "./props.ts"
import { workerClient } from "./worker-client.ts"

// Answers each request with the request itself, a moment later for a check of `slow.tsx`.
const echo = `
const { parentPort } = require("node:worker_threads")
parentPort.on("message", (message) => {
  const answer = () => parentPort.postMessage({ id: message.id, result: message })
  if (message.files?.includes("src/slow.tsx")) setTimeout(answer, 5000)
  else answer()
})
`

const shop = "D:/projects/shop"
const blog = "D:/projects/blog"
let stop: () => void = () => undefined

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  stop()
  vi.restoreAllMocks()
})

function setup() {
  const waiting: Array<() => void> = []
  const client = workerClient({
    start: () => new Worker(echo, { eval: true }),
    idleMs: 30,
    stopped: () => {
      for (const resolve of waiting.splice(0)) resolve()
    }
  })
  stop = () => client.stop(new Error("The test ended"))
  const checker = typeChecker(client)
  /** What the worker was sent for a check. */
  const check = async (root: string, files: string[]) =>
    (await checker.checkComponents(root, files)) as CheckResult & { known?: string[] }
  return { client, checker, check, idleStop: () => new Promise<void>((resolve) => waiting.push(resolve)) }
}

describe("typeChecker", () => {
  it("gives a worker started again the files its project's program had read", async () => {
    const { checker, check, idleStop } = setup()
    await checker.inferComponents(shop, {}, ["src/button.tsx", "src/card.tsx"])
    expect((await check(shop, ["src/card.tsx", "src/menu.tsx"])).known).toBeUndefined()
    await idleStop()

    expect((await check(shop, ["src/card.tsx"])).known).toEqual(["src/button.tsx", "src/card.tsx", "src/menu.tsx"])
    expect((await check(shop, ["src/card.tsx"])).known).toBeUndefined()
  })

  it("gives each project its own files, once each worker", async () => {
    const { checker, check, idleStop } = setup()
    await checker.inferComponents(shop, {}, ["src/button.tsx"])
    await checker.inferComponents(blog, {}, ["src/post.tsx"])
    await idleStop()

    expect((await check(blog, ["src/post.tsx"])).known).toEqual(["src/post.tsx"])
    expect((await check(shop, ["src/button.tsx"])).known).toEqual(["src/button.tsx"])
    expect((await check(blog, ["src/post.tsx"])).known).toBeUndefined()
  })

  it("forgets a closed project's files", async () => {
    const { client, checker, check, idleStop } = setup()
    await checker.inferComponents(shop, {}, ["src/button.tsx"])
    await checker.inferComponents(blog, {}, ["src/post.tsx"])
    checker.closeChecker(blog, false)
    expect(client.running).toBe(true)
    await idleStop()

    expect((await check(blog, ["src/post.tsx"])).known).toBeUndefined()
  })

  it("stops the worker when the last project closes, failing what it hasn't answered", async () => {
    const { client, checker, check } = setup()
    await checker.inferComponents(shop, {}, ["src/button.tsx"])
    const waiting = check(shop, ["src/slow.tsx"])
    checker.closeChecker(shop, true)
    await expect(waiting).rejects.toThrow("The project closed")
    expect(client.running).toBe(false)

    expect((await check(shop, ["src/button.tsx"])).known).toBeUndefined()
  })
})
