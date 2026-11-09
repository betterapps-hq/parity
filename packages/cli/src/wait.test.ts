import { createServer, type Server } from "node:http"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { waitLimit } from "./wait.ts"

/** A listening server's address. */
const listening = z.looseObject({ port: z.number() })

let server: Server | undefined

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined))
  server = undefined
})

/** A copy at a local address that answers `{}`, or never answers when `answers` is false. */
async function copy(answers = true): Promise<string> {
  server = createServer((request, reply) => {
    request.resume()

    if (answers) {
      request.on("end", () => reply.end("{}"))
    }
  })

  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve))
  // A server listening on a port has an address with one, never a pipe's name.
  const { port } = listening.parse(server.address())

  return `http://127.0.0.1:${port}`
}

/** Keeps this process busy, as a starved runner or its own module loading does. */
function busy(ms: number): void {
  const end = performance.now() + ms

  while (performance.now() < end) {
    // Spin.
  }
}

describe("waitLimit", () => {
  it("reads an answer that came while this process was too busy to read it for longer than the limit", async () => {
    const url = await copy()
    const limit = waitLimit(200)
    const answer = fetch(url, { method: "POST", body: "{}", signal: limit.signal })
    busy(500)

    const response = await answer
    limit.stop()
    expect(await response.text()).toBe("{}")
  })

  it("gives up on a copy that doesn't answer once the limit has gone by free", async () => {
    const url = await copy(false)
    const started = performance.now()
    const error = await fetch(url, { method: "POST", body: "{}", signal: waitLimit(200).signal }).catch((e) => e)

    expect(error).toMatchObject({ name: "TimeoutError" })
    expect(performance.now() - started).toBeGreaterThanOrEqual(190)
  })
})
