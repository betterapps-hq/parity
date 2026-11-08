import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliEvents, createTelemetry, createTestSink } from "@parity-app/telemetry"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { cliLogFolder, fileSink, inCliRun, recordCli, runTraceHeaders, setCliTelemetry } from "./telemetry.ts"

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
