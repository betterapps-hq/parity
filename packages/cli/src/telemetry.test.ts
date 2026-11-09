import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliEvents, createTelemetry, createTestSink } from "@parity-app/telemetry"
import { afterEach, describe, expect, it } from "vite-plus/test"
import {
  batchRun,
  cliCallerChanged,
  cliLogFolder,
  cliTelemetrySetting,
  fileSink,
  inCliRun,
  recordCli,
  runTraceHeaders,
  setCliTelemetry,
  telemetryNotice
} from "./telemetry.ts"

function testTelemetry() {
  const sink = createTestSink()

  const telemetry = createTelemetry({
    events: cliEvents,
    context: { process: "cli", installId: "install", sessionId: "session" },
    sinks: [sink],
    check: true
  })

  return { sink, telemetry }
}

afterEach(() => {
  setCliTelemetry(undefined)
  process.exitCode = undefined
})

describe("inCliRun", () => {
  it("records the command as a span its events and calls continue, with what it exits with", async () => {
    const { sink, telemetry } = testTelemetry()
    setCliTelemetry(telemetry)
    let headers: ReturnType<typeof runTraceHeaders>
    await inCliRun("problems", ["tab"], async () => {
      recordCli("cli.connectFailed", { code: "not_answering", copies: 2 })
      headers = runTraceHeaders()
      process.exitCode = 1
    })
    const [ran] = sink.spans
    expect(ran).toMatchObject({
      name: "cli.ran",
      outcome: "error",
      attributes: { command: "problems", flags: ["tab"], exitCode: 1 }
    })
    expect(sink.named("cli.connectFailed")[0]).toMatchObject({ traceId: ran?.traceId, spanId: ran?.spanId })
    expect(headers?.["sentry-trace"]).toBe(`${ran?.traceId}-${ran?.spanId}-1`)
    expect(runTraceHeaders()).toBeUndefined()
  })

  it("ends with a failure's code, and passes the failure on", async () => {
    const { sink, telemetry } = testTelemetry()
    setCliTelemetry(telemetry)
    const failure = Object.assign(new Error("No app"), { details: { code: "not_running" } })
    await expect(inCliRun("tabs", [], () => Promise.reject(failure))).rejects.toBe(failure)
    expect(sink.spans[0]).toMatchObject({ outcome: "error", attributes: { exitCode: 1, code: "not_running" } })
  })

  it("records nothing before the CLI's telemetry starts", async () => {
    let ran = false
    await inCliRun("tabs", [], async () => {
      recordCli("cli.connectFailed", { code: "not_running", copies: 0 })
      ran = true
    })
    expect(ran).toBe(true)
  })
})

describe("fileSink", () => {
  it("writes each event as a line to the day's file, and keeps the newest 10 days", () => {
    const folder = mkdtempSync(join(tmpdir(), "parity-cli-logs-"))

    try {
      for (let day = 1; day <= 11; day++) {
        writeFileSync(join(folder, `parity-cli-2026-10-${String(day).padStart(2, "0")}.jsonl`), "")
      }

      writeFileSync(join(folder, "notes.txt"), "")

      const envelope = {
        process: "cli" as const,
        installId: "install",
        sessionId: "session",
        name: "mcp.session",
        time: "2026-11-08T09:00:00.000Z",
        level: "info" as const,
        attributes: { client: "claude-code" }
      }

      const sink = fileSink(folder)
      sink.event(envelope)
      sink.event(envelope)
      const names = readdirSync(folder).sort()
      expect(names).toHaveLength(11)
      expect(names).not.toContain("parity-cli-2026-10-01.jsonl")
      expect(names).not.toContain("parity-cli-2026-10-02.jsonl")
      expect(names).toContain("notes.txt")
      const lines = readFileSync(join(folder, "parity-cli-2026-11-08.jsonl"), "utf8").trim().split("\n")
      expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([envelope, envelope])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe("cliLogFolder", () => {
  it("is ~/.parity/logs, the folder PARITY_CLI_LOGS names, or none under Vitest without it", () => {
    expect(cliLogFolder({ PARITY_CLI_LOGS: "/tmp/logs", VITEST: "true" })).toBe("/tmp/logs")
    expect(cliLogFolder({ VITEST: "true" })).toBeUndefined()
    expect(cliLogFolder({})).toMatch(/\.parity[\\/]logs$/)
  })
})

describe("cliTelemetrySetting", () => {
  const installId = "0b6f7c1e-3c55-4d5e-9a1f-6f2d9c8b7a10"
  const saved = (level: string) => JSON.stringify({ level, installId })

  it("sends what the app's Settings saved, as the app's install", () => {
    expect(cliTelemetrySetting({}, saved("off"))).toEqual({ level: "off", setting: "off", installId })
    expect(cliTelemetrySetting({}, saved("all"))).toEqual({ level: "all", setting: "all", installId })
  })

  it("sends everything before the app has run, as no install", () => {
    expect(cliTelemetrySetting({}, undefined)).toEqual({ level: "all", setting: "all", installId: "none" })
    expect(cliTelemetrySetting({}, "not json")).toMatchObject({ level: "all", installId: "none" })
  })

  it("lets the variables decide over the setting, as the app does", () => {
    expect(cliTelemetrySetting({ PARITY_TELEMETRY: "off" }, saved("all"))).toMatchObject({
      level: "off",
      overriddenBy: "PARITY_TELEMETRY"
    })
    expect(cliTelemetrySetting({ PARITY_TELEMETRY: "all" }, saved("off"))).toMatchObject({ level: "all" })
    expect(cliTelemetrySetting({ DO_NOT_TRACK: "1", PARITY_TELEMETRY: "all" }, saved("all"))).toMatchObject({
      level: "off",
      overriddenBy: "DO_NOT_TRACK"
    })
    expect(cliTelemetrySetting({ VITEST: "true" }, saved("all"))).toMatchObject({ level: "off" })
  })

  it("refuses a PARITY_TELEMETRY that isn't a level, rather than sending what was meant to be off", () => {
    expect(() => cliTelemetrySetting({ PARITY_TELEMETRY: "of" }, undefined)).toThrow(/PARITY_TELEMETRY is "of"/)
  })
})

describe("telemetryNotice", () => {
  it("says once, on one line, that diagnostics are shared and how to stop it", () => {
    const notice = telemetryNotice("all", false)
    expect(notice).toContain("PARITY_TELEMETRY=off")
    expect(notice).toContain("Share diagnostics")
    expect(notice).not.toContain("\n")
    expect(telemetryNotice("all", true)).toBeUndefined()
  })

  it("says nothing while diagnostics are off", () => {
    expect(telemetryNotice("off", false)).toBeUndefined()
  })
})

describe("batchRun", () => {
  afterEach(() => cliCallerChanged({ name: "Terminal", id: "Terminal" }))

  it("tags a batch as the app tags its events: environment, test pass, and the agent calling", () => {
    cliCallerChanged({ name: "Claude", id: "Claude#1a2b3c4d", client: "claude-code" })
    const run = batchRun({ CI: "true", PARITY_TEST_RUN: "ci-7" }, "install", true, { published: true })
    expect(run).toMatchObject({
      environment: "ci",
      published: true,
      tags: { test_run: "ci-7", driver: "agent", agent: "Claude", agent_client: "claude-code" },
      user: { id: "install", username: "Claude#1a2b3c4d" }
    })
    expect(run.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(run.source).toBeUndefined()
  })

  it("names a checkout's folder, whose commit names its release, and the tester as the user", () => {
    const run = batchRun({ PARITY_TESTER: "Andrew" }, "install", false, undefined)
    expect(run).toMatchObject({ environment: "development", user: { id: "install", username: "Andrew" } })
    expect(run.tags).toEqual({ driver: "agent", agent: "Terminal" })
    expect(run.published).toBe(false)
    expect(run.source).toBeDefined()
  })

  it("names a build that npm didn't publish, such as a pkg.pr.new preview, by the commit it was built from", () => {
    const run = batchRun({}, "install", true, { published: false, commit: "9a6440b" })
    expect(run).toMatchObject({ environment: "tester", published: false, commit: "9a6440b" })
    expect(run.source).toBeUndefined()
  })
})
