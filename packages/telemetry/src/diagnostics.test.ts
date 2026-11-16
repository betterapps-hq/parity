import { describe, expect, it } from "vite-plus/test"
import { diagnosticFiles, lastRunCrash, lastUnfinishedRun, type LoggedEvent, parseLogLines } from "./diagnostics.ts"

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

describe("lastUnfinishedRun", () => {
  it("finds the last run that didn't quit, with its last error", () => {
    const events = [
      event("a", "app.started", "2026-11-06T09:00:00.000Z"),
      event("a", "app.quit", "2026-11-06T09:30:00.000Z"),
      event("b", "app.started", "2026-11-06T10:00:00.000Z"),
      event("b", "error.thrown", "2026-11-06T10:01:00.000Z", { level: "error", attributes: { message: "boom" } }),
      event("b", "action.ran", "2026-11-06T10:02:00.000Z", { process: "renderer" }),
      event("c", "app.started", "2026-11-06T11:00:00.000Z")
    ]

    const run = lastUnfinishedRun(events, "c")
    expect(run).toMatchObject({
      sessionId: "b",
      time: "2026-11-06T10:02:00.000Z",
      lastError: { name: "error.thrown", attributes: { message: "boom" } }
    })
    expect(run?.events).toHaveLength(3)
  })

  it("finds none when the last run quit, or there was no other run", () => {
    const quit = [
      event("a", "app.started", "2026-11-06T09:00:00.000Z"),
      event("a", "app.quit", "2026-11-06T09:30:00.000Z"),
      event("c", "app.started", "2026-11-06T11:00:00.000Z")
    ]

    expect(lastUnfinishedRun(quit, "c")).toBeUndefined()
    expect(lastUnfinishedRun([event("c", "app.started", "2026-11-06T11:00:00.000Z")], "c")).toBeUndefined()
  })

  it("ignores runs only the CLI recorded", () => {
    const events = [
      event("a", "app.started", "2026-11-06T09:00:00.000Z"),
      event("a", "app.quit", "2026-11-06T09:30:00.000Z"),
      event("cli", "command.ran", "2026-11-06T10:00:00.000Z", { process: "cli" })
    ]

    expect(lastUnfinishedRun(events, "c")).toBeUndefined()
  })
})

describe("lastRunCrash", () => {
  const noSigns = { minidumps: [], openHangs: [] }
  const started = Date.parse("2026-11-06T10:00:00.000Z")

  /** A run that ended without quitting, then this run. */
  const stopped = [
    event("a", "app.started", "2026-11-06T09:00:00.000Z"),
    event("a", "app.quit", "2026-11-06T09:30:00.000Z"),
    event("b", "app.started", "2026-11-06T10:00:00.000Z"),
    event("b", "action.ran", "2026-11-06T10:02:00.000Z"),
    event("c", "app.started", "2026-11-06T11:00:00.000Z")
  ]

  it("finds no crash in a run that was stopped, as an agent or a force-quit stops it", () => {
    expect(lastRunCrash(stopped, "c", noSigns)).toBeUndefined()
  })

  it("finds a crash in a run that left a minidump or an open hang while it ran", () => {
    expect(lastRunCrash(stopped, "c", { minidumps: [started + 60_000], openHangs: [] })?.sessionId).toBe("b")
    expect(lastRunCrash(stopped, "c", { minidumps: [], openHangs: [started + 60_000] })?.sessionId).toBe("b")
  })

  it("ignores signs from before the run started, which an earlier run left", () => {
    expect(lastRunCrash(stopped, "c", { minidumps: [started - 1], openHangs: [started - 1] })).toBeUndefined()
  })

  it("finds a crash in a run that recorded a fatal event", () => {
    const fatal = [...stopped, event("b", "main.failed", "2026-11-06T10:03:00.000Z", { level: "fatal" })]

    expect(lastRunCrash(fatal, "c", noSigns)?.lastError?.name).toBe("main.failed")
  })

  it("finds a crash when the editor window's renderer went, even though the run then quit", () => {
    const gone = (window: string) => [
      event("b", "app.started", "2026-11-06T10:00:00.000Z"),
      event("b", "window.gone", "2026-11-06T10:01:00.000Z", {
        level: "error",
        attributes: { window, reason: "crashed" }
      }),
      event("b", "app.quit", "2026-11-06T10:02:00.000Z"),
      event("c", "app.started", "2026-11-06T11:00:00.000Z")
    ]

    expect(lastRunCrash(gone("renderer"), "c", noSigns)?.sessionId).toBe("b")
    // An offscreen window drawing frames is opened again, so the person never saw it go.
    expect(lastRunCrash(gone("render"), "c", noSigns)).toBeUndefined()
  })

  it("finds no crash in a run that quit, whatever signs there are", () => {
    const quit = [
      event("b", "app.started", "2026-11-06T10:00:00.000Z"),
      event("b", "app.quit", "2026-11-06T10:02:00.000Z"),
      event("c", "app.started", "2026-11-06T11:00:00.000Z")
    ]

    expect(lastRunCrash(quit, "c", { minidumps: [started + 1], openHangs: [] })).toBeUndefined()
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
