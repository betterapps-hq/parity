import { describe, expect, it } from "vite-plus/test"
import { diagnosticFiles, lastRunCrash, type LoggedEvent, parseLogLines } from "./diagnostics.ts"

const event = (sessionId: string, name: string, time: string, extra: Partial<LoggedEvent> = {}): LoggedEvent => ({
  process: "main",
  installId: "install",
  sessionId,
  name,
  time,
  level: "info",
  attributes: {},
  ...extra
})

describe("parseLogLines", () => {
  it("reads one event a line and skips a line cut short", () => {
    const line = JSON.stringify(event("a", "app.started", "2026-11-06T10:00:00.000Z"))
    expect(parseLogLines(`${line}\n{"name":"app.qu\n\n`)).toEqual([JSON.parse(line)])
  })
})

describe("lastRunCrash", () => {
  it("finds the last run that didn't quit, with its last error", () => {
    const events = [
      event("a", "app.started", "2026-11-06T09:00:00.000Z"),
      event("a", "app.quit", "2026-11-06T09:30:00.000Z"),
      event("b", "app.started", "2026-11-06T10:00:00.000Z"),
      event("b", "error.thrown", "2026-11-06T10:01:00.000Z", { level: "error", attributes: { message: "boom" } }),
      event("b", "action.ran", "2026-11-06T10:02:00.000Z", { process: "renderer" }),
      event("c", "app.started", "2026-11-06T11:00:00.000Z")
    ]
    const crash = lastRunCrash(events, "c")
    expect(crash).toMatchObject({
      sessionId: "b",
      time: "2026-11-06T10:02:00.000Z",
      lastError: { name: "error.thrown", attributes: { message: "boom" } }
    })
    expect(crash?.events).toHaveLength(3)
  })

  it("finds none when the last run quit, or there was no other run", () => {
    const quit = [
      event("a", "app.started", "2026-11-06T09:00:00.000Z"),
      event("a", "app.quit", "2026-11-06T09:30:00.000Z"),
      event("c", "app.started", "2026-11-06T11:00:00.000Z")
    ]
    expect(lastRunCrash(quit, "c")).toBeUndefined()
    expect(lastRunCrash([event("c", "app.started", "2026-11-06T11:00:00.000Z")], "c")).toBeUndefined()
  })

  it("ignores runs only the CLI recorded", () => {
    const events = [
      event("a", "app.started", "2026-11-06T09:00:00.000Z"),
      event("a", "app.quit", "2026-11-06T09:30:00.000Z"),
      event("cli", "command.ran", "2026-11-06T10:00:00.000Z", { process: "cli" })
    ]
    expect(lastRunCrash(events, "c")).toBeUndefined()
  })
})

describe("diagnosticFiles", () => {
  const now = Date.parse("2026-11-06T12:00:00.000Z")
  const events = [
    event("a", "old", "2026-11-06T10:30:00.000Z", { project: "/old" }),
    event("b", "project.opened", "2026-11-06T11:10:00.000Z", { project: "/site" }),
    event("b", "tab.opened", "2026-11-06T11:20:00.000Z", { project: "/kit" }),
    event("b", "action.ran", "2026-11-06T11:30:00.000Z", { project: "/site" })
  ]

  it("keeps the last hour of logs and the projects open in it", () => {
    const files = diagnosticFiles({ events, now, versions: { parity: "0.20.0" } })
    expect(files.map((file) => file.name)).toEqual(["logs.jsonl", "versions.json", "projects.json"])
    expect(files[0]?.text.split("\n")).toHaveLength(3)
    expect(JSON.parse(files[2]?.text ?? "")).toEqual(["/site", "/kit"])
  })

  it("adds the crash when there is one", () => {
    const crash = { sessionId: "a", time: "2026-11-06T10:30:00.000Z", events: [] }
    const files = diagnosticFiles({ events, now, versions: { parity: "0.20.0" }, crash })
    expect(files.at(-1)).toMatchObject({ name: "crash.json" })
  })
})
