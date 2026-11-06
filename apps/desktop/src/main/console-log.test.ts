import { describe, expect, it, vi } from "vite-plus/test"
import type { ConsoleChange } from "../shared/protocol.ts"
import { announcedContexts, batchedChanges, createConsoleLog, type WrittenMessage } from "./console-log.ts"

const guest = "http://127.0.0.1:5173"
const written = (message: Partial<WrittenMessage> = {}): WrittenMessage => ({
  level: "error",
  text: "Cannot read properties of undefined (reading 'price')",
  source: `${guest}/src/components/plan-price.tsx`,
  line: 12,
  where: "canvas",
  ...message
})

describe("the console log", () => {
  it("keeps each message with an id, and counts a repeat in the same frame on it", () => {
    let now = 1000
    const log = createConsoleLog({ now: () => now })
    const pricing = { design: "app.par#pricing", state: "default", mode: "desktop" }
    const first = log.write(written(pricing))
    now = 2000
    log.write(written(pricing))
    // The same message from another frame is its own, so the panel can say which frames wrote it.
    log.write(written({ ...pricing, mode: "mobile" }))
    expect(log.read(guest)).toEqual([
      { ...written(pricing), id: first!.id, count: 2, first: 1000, last: 2000 },
      { ...written({ ...pricing, mode: "mobile" }), id: first!.id + 1, count: 1, first: 2000, last: 2000 }
    ])
  })

  it("keeps a message no frame is known for without a design", () => {
    const log = createConsoleLog()
    log.write(written({ design: "", where: "offscreen" }))
    expect(log.read(guest)[0]).not.toHaveProperty("design")
  })

  it("drops chatter every dev build writes, and the oldest past its limit", () => {
    const log = createConsoleLog({ limit: 2 })
    expect(log.write(written({ text: "[vite] hot updated: /src/App.tsx" }))).toBeUndefined()
    for (const line of [1, 2, 3]) log.write(written({ line }))
    expect(log.read(guest).map((entry) => entry.line)).toEqual([2, 3])
  })

  it("reads and clears one builder's messages, and tells who's listening", () => {
    const log = createConsoleLog()
    const heard: ConsoleChange[] = []
    log.subscribe((change) => heard.push(change))
    log.write(written())
    log.write(written({ source: "http://127.0.0.1:5174/src/other.tsx" }))
    expect(log.read(`${guest}/src/guest.ts`, true)).toHaveLength(1)
    expect(log.read(guest)).toEqual([])
    expect(log.read("http://127.0.0.1:5174/")).toHaveLength(1)
    expect(heard.map((change) => ("cleared" in change ? change.cleared : change.entries.length))).toEqual([1, 1, guest])
  })
})

describe("where a window's next message comes from", () => {
  it("is what the window announced, for the next message of that level only", () => {
    let now = 0
    const contexts = announcedContexts(() => now)
    const pricing = { design: "app.par#pricing", state: "default", mode: "desktop" }
    contexts.announce(1, "error", pricing)
    expect(contexts.take(2, "error")).toBeUndefined()
    expect(contexts.take(1, "error")).toEqual(pricing)
    expect(contexts.take(1, "error")).toBeUndefined()
    // A message of another level isn't the one announced, and an announcement doesn't hold for long.
    contexts.announce(1, "warning", pricing)
    expect(contexts.take(1, "error")).toBeUndefined()
    contexts.announce(1, "info", pricing)
    now = 5000
    expect(contexts.take(1, "info")).toBeUndefined()
  })
})

describe("the log's changes, sent on", () => {
  it("go in one batch a while after the first, each message once as it is then", () => {
    const sent: ConsoleChange[] = []
    const later: (() => void)[] = []
    const send = batchedChanges(
      (change) => sent.push(change),
      100,
      (run) => later.push(run)
    )
    const entry = { ...written(), id: 1, count: 1, first: 0, last: 0 }
    send({ entries: [entry] })
    entry.count = 2
    send({ entries: [entry] })
    expect(sent).toEqual([])
    expect(later).toHaveLength(1)
    later[0]!()
    expect(sent).toEqual([{ entries: [{ ...entry, count: 2 }] }])
  })

  it("send what's waiting before a clear, and the clear at once", () => {
    const sent: ConsoleChange[] = []
    const send = batchedChanges((change) => sent.push(change), 100, vi.fn())
    send({ entries: [{ ...written(), id: 1, count: 1, first: 0, last: 0 }] })
    send({ cleared: guest })
    expect(sent.map((change) => ("cleared" in change ? "cleared" : "entries"))).toEqual(["entries", "cleared"])
  })
})
