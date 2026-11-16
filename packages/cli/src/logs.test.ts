import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { describeLogs, type LogEvent, readLogs } from "./logs.ts"

let folder: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-logs-"))
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

const trace = "4bf92f3577b34da6a3ce929d0e0e4736"

const event = (name: string, overrides: Partial<LogEvent> = {}): LogEvent => ({
  process: "main",
  installId: "install",
  sessionId: "run-2",
  name,
  time: "2026-11-06T09:00:00.000Z",
  level: "info",
  attributes: {},
  ...overrides
})

const lines = (...events: LogEvent[]) => events.map((value) => `${JSON.stringify(value)}\n`).join("")

/** Two runs over two days and a rolled-over file, with a line a crash cut short. */
function writeFixture(): void {
  writeFileSync(
    join(folder, "parity-2026-11-05.jsonl"),
    lines(
      event("app.started", { sessionId: "run-1", time: "2026-11-05T09:00:00.000Z" }),
      event("project.opened", {
        sessionId: "run-1",
        time: "2026-11-05T09:00:01.000Z",
        traceId: trace,
        spanId: "00f067aa0ba902b7",
        durationMs: 812.4,
        outcome: "ok",
        testRun: "ci-7"
      })
    )
  )
  writeFileSync(
    join(folder, "parity-2026-11-06.jsonl"),
    `${lines(event("app.started", { time: "2026-11-06T09:00:00.000Z" }))}{"name":"cut`
  )
  writeFileSync(
    join(folder, "parity-2026-11-06.2.jsonl"),
    lines(
      event("render.failed", {
        process: "render",
        level: "error",
        time: "2026-11-06T09:00:05.000Z",
        traceId: trace,
        attributes: { design: "Home" }
      }),
      event("tab.opened", { process: "renderer", level: "debug", time: "2026-11-06T09:00:03.000Z" })
    )
  )
  writeFileSync(join(folder, "notes.txt"), "not a log\n")
}

const names = (result: { events: LogEvent[] }) => result.events.map((value) => value.name)

describe("readLogs", () => {
  it("shows the last run's events, oldest first, across rolled-over files", () => {
    writeFixture()
    const result = readLogs({}, { folder })
    expect(result.session).toBe("run-2")
    expect(names(result)).toEqual(["app.started", "tab.opened", "render.failed"])
    expect(result).toMatchObject({ total: 3, truncated: false, limit: 100 })
  })

  it("filters by lowest level and by process", () => {
    writeFixture()
    expect(names(readLogs({ level: "warn" }, { folder }))).toEqual(["render.failed"])
    expect(names(readLogs({ process: "renderer" }, { folder }))).toEqual(["tab.opened"])
  })

  it("follows a trace or a test run across runs", () => {
    writeFixture()
    expect(names(readLogs({ trace: trace.slice(0, 8).toUpperCase() }, { folder }))).toEqual([
      "project.opened",
      "render.failed"
    ])
    expect(names(readLogs({ testRun: "ci-7" }, { folder }))).toEqual(["project.opened"])
  })

  it("reads since a time or how long ago, and every run when asked", () => {
    writeFixture()
    const now = Date.parse("2026-11-06T09:00:10.000Z")
    expect(names(readLogs({ since: "6s" }, { folder, now }))).toEqual(["render.failed"])
    expect(names(readLogs({ session: "all", since: "2026-11-05T09:00:01Z" }, { folder }))).toEqual([
      "project.opened",
      "app.started",
      "tab.opened",
      "render.failed"
    ])
    expect(() => readLogs({ since: "yesterday" }, { folder })).toThrow(/since/)
  })

  it("keeps the newest events up to the limit and says it left some out", () => {
    writeFixture()
    const result = readLogs({ limit: 1 }, { folder })
    expect(names(result)).toEqual(["render.failed"])
    expect(result).toMatchObject({ total: 3, truncated: true })
    expect(describeLogs(result)).toContain("3 events, the newest 1 shown")
  })

  it("rejects an unknown level", () => {
    expect(() => readLogs({ level: "loud" }, { folder })).toThrow(/expected one of/i)
  })

  it("reads an empty or missing folder as no events", () => {
    const result = readLogs({}, { folder: join(folder, "missing") })
    expect(result.events).toEqual([])
    expect(describeLogs(result)).toMatch(/^No events match/)
  })

  it("describes each event on a line, with a span's duration and trace", () => {
    writeFixture()
    const text = describeLogs(readLogs({ testRun: "ci-7" }, { folder }))
    expect(text).toContain("2026-11-05T09:00:01.000Z info main project.opened (812 ms) trace 4bf92f35")
  })
})

describe("the skill's example", () => {
  it("runs over the fixture", () => {
    writeFixture()
    const guide = readFileSync(new URL("../skills/guide/checking.md", import.meta.url), "utf8")
    const example = /`parity logs ([^`]*)`/.exec(guide)?.[1]
    expect(example).toBeDefined()

    const { values } = parseArgs({
      args: example?.split(" ") ?? [],
      options: { level: { type: "string" }, since: { type: "string" } }
    })

    const now = Date.parse("2026-11-06T09:01:00.000Z")
    expect(names(readLogs(values, { folder, now }))).toEqual(["render.failed"])
  })
})
