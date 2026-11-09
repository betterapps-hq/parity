import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliEvents, createSentrySink, createTelemetry } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import {
  adoptDebugIds,
  type Batch,
  type BatchRun,
  type BatchTarget,
  createOutbox,
  loadedDebugIds,
  sendBatches,
  writeBatch
} from "./outbox.ts"

let folder: string
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-outbox-"))
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

const run: BatchRun = {
  environment: "development",
  version: "0.19.0",
  published: false,
  tags: { driver: "agent", agent: "Terminal" },
  user: { id: "install" }
}

/** A Sentry that keeps the batches it's sent, and what each flush found waiting. */
function fakeTarget(onSend?: (batch: Batch) => void) {
  const sent: Batch[] = []
  const flushes: number[] = []
  const target: BatchTarget = {
    send: (batch) => {
      sent.push(batch)
      onSend?.(batch)
    },
    flush: async () => flushes.push(sent.length)
  }
  return { sent, flushes, target }
}

const breadcrumbOnly = (category: string): Batch => ({
  run,
  items: [{ kind: "breadcrumb", breadcrumb: { type: "default", category, level: "info", timestamp: 1, data: {} } }]
})

describe("createOutbox", () => {
  it("keeps what the Sentry sink sends, in order: breadcrumbs, logs, and the command's span as a transaction", () => {
    const outbox = createOutbox()
    const telemetry = createTelemetry({
      events: cliEvents,
      context: { process: "cli", installId: "install", sessionId: "session" },
      sinks: [createSentrySink(outbox.target, { upload: true })],
      check: true
    })
    const span = telemetry.startSpan("cli.ran", { command: "tabs", flags: [] })
    telemetry.track("cli.connectFailed", { code: "not_running", copies: 0 }, { span })
    span.end("error", { exitCode: 1 })
    outbox.exception(new TypeError("Cannot read properties of undefined"), span)

    const items = outbox.take()
    expect(items.map((item) => item.kind)).toEqual(["breadcrumb", "log", "breadcrumb", "event", "exception"])
    expect(items[3]).toMatchObject({
      kind: "event",
      event: { type: "transaction", transaction: "cli.ran", contexts: { trace: { trace_id: span.traceId } } }
    })
    expect(items[4]).toMatchObject({
      kind: "exception",
      error: { name: "TypeError", message: "Cannot read properties of undefined" },
      tags: { process: "cli" },
      trace: { traceId: span.traceId, spanId: span.spanId }
    })
    expect(items[4]?.kind === "exception" && items[4].error.stack).toContain("outbox.test.ts")
    expect(outbox.take()).toEqual([])
  })
})

describe("writeBatch", () => {
  it("writes a batch whole, and nothing for an empty one", () => {
    expect(writeBatch(folder, { run, items: [] })).toBeUndefined()
    const name = writeBatch(folder, breadcrumbOnly("cli.ran"))
    expect(readdirSync(folder)).toEqual([name])
  })
})

describe("sendBatches", () => {
  it("sends every batch waiting, oldest first, removes them, and flushes", async () => {
    writeBatch(folder, breadcrumbOnly("first"))
    writeBatch(folder, breadcrumbOnly("second"))
    const { sent, flushes, target } = fakeTarget()
    expect(await sendBatches(folder, target)).toBe(2)
    expect(sent.map((batch) => batch.items[0]?.kind === "breadcrumb" && batch.items[0].breadcrumb.category)).toEqual([
      "first",
      "second"
    ])
    expect(flushes).toEqual([2])
    expect(readdirSync(folder)).toEqual([])
  })

  it("sends a batch written while it sends, before letting go", async () => {
    writeBatch(folder, breadcrumbOnly("first"))
    let wrote = false
    const { sent, target } = fakeTarget(() => {
      if (wrote) return
      wrote = true
      writeBatch(folder, breadcrumbOnly("later"))
    })
    expect(await sendBatches(folder, target)).toBe(2)
    expect(sent).toHaveLength(2)
  })

  it("leaves the folder to a sender that's already sending", async () => {
    writeBatch(folder, breadcrumbOnly("first"))
    writeFileSync(join(folder, ".sending"), "")
    const { sent, target } = fakeTarget()
    expect(await sendBatches(folder, target)).toBe(0)
    expect(sent).toEqual([])
  })

  it("takes over from a sender that stopped two minutes ago", async () => {
    writeBatch(folder, breadcrumbOnly("first"))
    const lock = join(folder, ".sending")
    writeFileSync(lock, "")
    const old = new Date(Date.now() - 3 * 60 * 1000)
    utimesSync(lock, old, old)
    const { sent, target } = fakeTarget()
    expect(await sendBatches(folder, target)).toBe(1)
    expect(sent).toHaveLength(1)
    expect(readdirSync(folder)).toEqual([])
  })

  it("drops batches a day old, and files that aren't batches, unsent", async () => {
    writeBatch(folder, breadcrumbOnly("old"))
    writeFileSync(join(folder, "1-other.json"), "not a batch")
    const { sent, target } = fakeTarget()
    expect(await sendBatches(folder, target, { now: () => Date.now() + 25 * 60 * 60 * 1000 })).toBe(0)
    expect(sent).toEqual([])
    expect(readdirSync(folder)).toEqual([])
  })
})

describe("debug IDs", () => {
  const command = "Error\n    at file:///cli/dist/bin.mjs:1:20"
  const sender = "Error\n    at file:///cli/dist/send.mjs:1:20"

  it("carries the command's bundles' debug IDs to the sender, which adds them to its own", () => {
    const batch: Batch = { run, items: [], debugIds: loadedDebugIds({ _sentryDebugIds: { [command]: "bin-id" } }) }
    const global = { _sentryDebugIds: { [sender]: "send-id" } }
    adoptDebugIds(structuredClone(batch), global)
    expect(global._sentryDebugIds).toEqual({ [sender]: "send-id", [command]: "bin-id" })
  })

  it("leaves the sender's alone for a batch from source, which has none", () => {
    const global = { _sentryDebugIds: { [sender]: "send-id" } }
    adoptDebugIds({ run, items: [], debugIds: loadedDebugIds({}) }, global)
    expect(global._sentryDebugIds).toEqual({ [sender]: "send-id" })
  })
})
