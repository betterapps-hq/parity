import { connect } from "node:net"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { roomRelay } from "./relay.ts"

const servers: { close(): void }[] = []
const crlf = String.fromCharCode(13, 10)

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close()
  }
})

async function relay(): Promise<string> {
  const server = roomRelay()
  servers.push({ close: () => server.close() })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

  const { port } = z.object({ port: z.number() }).parse(server.address())

  return `http://127.0.0.1:${port}`
}

/** A message as a copy is sent it. */
const message = z.looseObject({ kind: z.string() })

type Message = z.infer<typeof message>

/** A copy listening in a room: the messages it's sent, as they arrive. */
async function listen(base: string, peer: string) {
  const controller = new AbortController()
  const response = await fetch(`${base}/events?room=project&peer=${peer}`, { signal: controller.signal })
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  const messages: Message[] = []
  let buffer = ""

  const next = async (kind: string): Promise<Message> => {
    for (;;) {
      const found = messages.find((message) => message.kind === kind)

      if (found) {
        messages.splice(messages.indexOf(found), 1)

        return found
      }

      const { value } = await reader.read()
      buffer += value ?? ""
      const events = buffer.split("\n\n")
      buffer = events.pop() ?? ""

      for (const event of events) {
        if (event.startsWith("data: ")) {
          messages.push(message.parse(JSON.parse(event.slice(6))))
        }
      }
    }
  }

  servers.push({ close: () => controller.abort() })

  return { next, leave: () => controller.abort() }
}

const send = (base: string, peer: string, sent: { kind: string; to?: string; data?: unknown }) =>
  fetch(`${base}/send?room=project&peer=${peer}`, { method: "POST", body: JSON.stringify(sent) })

describe("the live room's relay", () => {
  it("makes the first copy in the host, and the next one when the host leaves", async () => {
    const base = await relay()
    const a = await listen(base, "a")
    expect(await a.next("welcome")).toMatchObject({ host: "a", peers: ["a"] })

    const b = await listen(base, "b")
    expect(await b.next("welcome")).toMatchObject({ host: "a", peers: ["a", "b"] })
    expect(await a.next("joined")).toMatchObject({ from: "b", host: "a" })

    a.leave()
    expect(await b.next("left")).toMatchObject({ from: "a", host: "b" })
  })

  it("passes a message to every other copy, or to the one it names, saying who sent it", async () => {
    const base = await relay()
    const a = await listen(base, "a")
    const b = await listen(base, "b")
    const c = await listen(base, "c")

    await send(base, "a", { kind: "updates", data: "AQI=" })
    expect(await b.next("updates")).toEqual({ kind: "updates", data: "AQI=", from: "a" })
    expect(await c.next("updates")).toEqual({ kind: "updates", data: "AQI=", from: "a" })

    await send(base, "c", { kind: "snapshot", to: "b", data: "Aw==" })
    await send(base, "c", { kind: "presence", data: { x: 1 } })
    expect(await b.next("snapshot")).toMatchObject({ from: "c", to: "b" })
    // `a` gets the presence sent after the snapshot without ever being sent the snapshot.
    expect(await a.next("presence")).toMatchObject({ from: "c" })
    expect(await a.next("welcome")).toMatchObject({ host: "a" })
  })

  it("keeps relaying after a copy aborts a message halfway, as a window that reloads does", async () => {
    const base = await relay()
    const a = await listen(base, "a")
    const { port } = new URL(base)
    const socket = connect(Number(port), "127.0.0.1")
    await new Promise<void>((resolve) => socket.once("connect", resolve))
    // A request that says more is coming, then hangs up.
    socket.write(["POST /send?room=project&peer=b HTTP/1.1", "Host: x", "Content-Length: 100", "", "{"].join(crlf))
    socket.destroy()

    await send(base, "c", { kind: "updates", data: "AQI=" })
    expect(await a.next("updates")).toMatchObject({ from: "c" })
  })

  it("refuses a message that isn't JSON", async () => {
    const base = await relay()
    const response = await fetch(`${base}/send?room=project&peer=a`, { method: "POST", body: "{" })
    expect(response.status).toBe(400)
  })
})
