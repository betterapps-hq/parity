import { describe, expect, it } from "vite-plus/test"
import { crashLog, isCrash, isEarlierCrash, recentLog } from "./crash-log.ts"
import type { LoggedEvent } from "./diagnostics.ts"

const event = (name: string, time: string): LoggedEvent => ({
  process: "main",
  installId: "i",
  sessionId: "s",
  name,
  time,
  level: "info",
  attributes: {}
})

describe("isCrash", () => {
  it("counts fatal events and errors nothing caught", () => {
    expect(isCrash({ level: "fatal" })).toBe(true)
    expect(isCrash({ level: "error", exception: { values: [{ mechanism: { handled: false } }] } })).toBe(true)
  })

  it("doesn't count caught errors or messages", () => {
    expect(isCrash({ level: "error", exception: { values: [{ mechanism: { handled: true } }] } })).toBe(false)
    expect(isCrash({ level: "warning" })).toBe(false)
    expect(isCrash({})).toBe(false)
  })
})

describe("isEarlierCrash", () => {
  it("counts a native crash found as the app starts, which has no exit reason", () => {
    expect(isEarlierCrash({ level: "fatal", platform: "native", tags: {} })).toBe(true)
  })

  it("doesn't count a window that crashed as the app ran, or an error in this run", () => {
    expect(isEarlierCrash({ level: "fatal", platform: "native", tags: { "exit.reason": "crashed" } })).toBe(false)
    expect(isEarlierCrash({ level: "fatal", platform: "node" })).toBe(false)
  })
})

describe("crashLog", () => {
  const events = [
    event("old", "2026-11-09T10:00:00.000Z"),
    event("a", "2026-11-09T10:56:00.000Z"),
    event("b", "2026-11-09T10:59:59.000Z")
  ]

  const until = Date.parse("2026-11-09T11:00:00.000Z")

  it("gives the last 5 minutes as JSON lines, oldest first", () => {
    expect(
      crashLog(events, until)
        .split("\n")
        .map((line) => JSON.parse(line).name)
    ).toEqual(["a", "b"])
  })

  it("keeps the latest when there are more than it carries", () => {
    expect(JSON.parse(crashLog(events, until, { max: 1 })).name).toBe("b")
  })

  it("gives nothing when nothing is recent", () => {
    expect(crashLog(events, Date.parse("2026-11-10T00:00:00.000Z"))).toBe("")
  })
})

describe("recentLog", () => {
  it("drops what's older than it keeps", () => {
    const log = recentLog({ keepMs: 1000, max: 10 })
    log.add(event("old", "1970-01-01T00:00:01.000Z"))
    log.add(event("new", "1970-01-01T00:00:05.000Z"))
    expect(JSON.parse(log.text(5500)).name).toBe("new")
  })

  it("keeps at most its limit", () => {
    const log = recentLog({ keepMs: 60_000, max: 2 })

    for (const name of ["a", "b", "c", "d", "e"]) {
      log.add(event(name, "1970-01-01T00:00:01.000Z"))
    }

    expect(
      log
        .text(2000)
        .split("\n")
        .map((line) => JSON.parse(line).name)
    ).toEqual(["d", "e"])
  })
})
