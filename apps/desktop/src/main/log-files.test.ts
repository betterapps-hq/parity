import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Envelope } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createLogFileSink, createLogFiles } from "./log-files.ts"

let folder = ""

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-logs-"))
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(folder, { recursive: true, force: true })
})

const at = (time: string) => () => Date.parse(time)
const files = () => readdirSync(folder).sort()

describe("createLogFiles", () => {
  it("writes the day's file, and the next one once it would pass its size", () => {
    const logs = createLogFiles({ folder, maxBytes: 11, now: at("2026-11-06T09:00:00Z") })
    logs.append("12345\n")
    logs.append("1234\n")
    logs.append("123456\n")
    expect(files()).toEqual(["parity-2026-11-06.2.jsonl", "parity-2026-11-06.jsonl"])
    expect(readFileSync(join(folder, "parity-2026-11-06.jsonl"), "utf8")).toBe("12345\n1234\n")
    expect(readFileSync(join(folder, "parity-2026-11-06.2.jsonl"), "utf8")).toBe("123456\n")
  })

  it("starts another file on a new day, and goes on with today's after a restart", () => {
    let now = Date.parse("2026-11-06T23:59:00Z")
    createLogFiles({ folder, now: () => now }).append("one\n")
    now = Date.parse("2026-11-07T00:01:00Z")
    createLogFiles({ folder, now: () => now }).append("two\n")
    createLogFiles({ folder, now: () => now }).append("three\n")
    expect(files()).toEqual(["parity-2026-11-06.jsonl", "parity-2026-11-07.jsonl"])
    expect(readFileSync(join(folder, "parity-2026-11-07.jsonl"), "utf8")).toBe("two\nthree\n")
  })

  it("keeps the newest files, leaving others in the folder alone", () => {
    writeFileSync(join(folder, "parity-2026-11-04.jsonl"), "old\n")
    writeFileSync(join(folder, "parity-2026-11-05.jsonl"), "older\n")
    writeFileSync(join(folder, "notes.txt"), "mine\n")
    const logs = createLogFiles({ folder, maxBytes: 4, keep: 3, now: at("2026-11-06T09:00:00Z") })

    for (const line of ["a\n", "b\n", "c\n", "d\n", "e\n"]) {
      logs.append(line)
    }

    // Two lines fill each file: a and b, c and d, then e.
    expect(files()).toEqual([
      "notes.txt",
      "parity-2026-11-06.2.jsonl",
      "parity-2026-11-06.3.jsonl",
      "parity-2026-11-06.jsonl"
    ])
  })
})

describe("createLogFileSink", () => {
  const envelope = (name: string, level: Envelope["level"]): Envelope => ({
    process: "renderer",
    installId: "install",
    sessionId: "session",
    name,
    time: "2026-11-06T09:00:00.000Z",
    level,
    attributes: { design: "Home" }
  })

  it("writes events as lines of JSON a second later, and a fatal event at once with those before it", () => {
    vi.useFakeTimers()
    const logs = createLogFiles({ folder, now: at("2026-11-06T09:00:00Z") })
    const sink = createLogFileSink(logs)
    const file = join(folder, "parity-2026-11-06.jsonl")
    sink.event(envelope("tab.opened", "info"))
    expect(files()).toEqual([])
    vi.advanceTimersByTime(1000)
    sink.event(envelope("tab.closed", "info"))
    sink.event(envelope("app.crashed", "fatal"))
    const lines = readFileSync(file, "utf8").trimEnd().split("\n")
    // SAFETY: the sink writes each line from an envelope it was given.
    expect(lines.map((line) => (JSON.parse(line) as Envelope).name)).toEqual([
      "tab.opened",
      "tab.closed",
      "app.crashed"
    ])
    expect(JSON.parse(lines[0] ?? "")).toEqual(envelope("tab.opened", "info"))
  })

  it("loses the local copy, not the app, when the folder can't be written", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const sink = createLogFileSink({
      append: () => {
        throw new Error("The disk is full")
      }
    })

    expect(() => sink.event(envelope("app.crashed", "fatal"))).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it("names the test run on every line when one is set", () => {
    const logs = createLogFiles({ folder, now: at("2026-11-06T09:00:00Z") })
    const sink = createLogFileSink(logs, { testRun: "ci-42" })
    sink.event(envelope("tab.opened", "info"))
    sink.flush()
    // SAFETY: the sink writes the line from an envelope, with the run's `testRun` beside it.
    const line = JSON.parse(readFileSync(join(folder, "parity-2026-11-06.jsonl"), "utf8")) as { testRun?: string }
    expect(line.testRun).toBe("ci-42")
  })
})
