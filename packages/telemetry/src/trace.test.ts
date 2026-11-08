import { describe, expect, it } from "vite-plus/test"
import {
  endWhenSettled,
  errorCode,
  formatTraceparent,
  newSpanId,
  newTraceId,
  parseTraceparent,
  readTraceHeaders,
  traceHeaders
} from "./index.ts"

describe("trace and span IDs", () => {
  it("are 32 and 16 lowercase hex digits", () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/)
    expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/)
    expect(newTraceId()).not.toBe(newTraceId())
  })

  it("are never all zeros, which W3C Trace Context holds invalid", () => {
    const draws = [new Uint8Array(8), Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 255)]
    expect(newSpanId(() => draws.shift() ?? new Uint8Array(8))).toBe("00000000000000ff")
  })
})

describe("traceparent", () => {
  const context = { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7" }

  it("writes and reads W3C Trace Context's example", () => {
    const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    expect(formatTraceparent(context)).toBe(header)
    expect(parseTraceparent(header)).toEqual(context)
    expect(parseTraceparent(`  ${header}\n`)).toEqual(context)
  })

  it("reads a later version's header, with more after its flags", () => {
    expect(parseTraceparent("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-later")).toEqual(context)
  })

  it("reads nothing from a header W3C Trace Context holds invalid", () => {
    const invalid = [
      "",
      "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
      "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
      "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-later",
      "00-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01"
    ]
    expect(Object.fromEntries(invalid.map((header) => [header, parseTraceparent(header)]))).toEqual(
      Object.fromEntries(invalid.map((header) => [header, undefined]))
    )
  })
})

describe("trace headers", () => {
  const context = { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7" }

  it("write a span's sentry-trace and baggage, which read back as the span", () => {
    const headers = traceHeaders(context)
    expect(headers).toEqual({
      "sentry-trace": "4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1",
      baggage: "sentry-trace_id=4bf92f3577b34da6a3ce929d0e0e4736,sentry-sampled=true"
    })
    expect(readTraceHeaders(headers)).toEqual(context)
  })

  it("read a traceparent, and Node's repeated headers by their first", () => {
    expect(readTraceHeaders({ traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" })).toEqual(
      context
    )
    expect(readTraceHeaders({ "sentry-trace": ["4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7", "x"] })).toEqual(
      context
    )
  })

  it("give nothing for what an older sender or a stranger sends", () => {
    for (const sent of [
      undefined,
      "4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1",
      {},
      { "sentry-trace": "nonsense" },
      { "sentry-trace": "00000000000000000000000000000000-00f067aa0ba902b7-1" },
      { "sentry-trace": 12 }
    ]) {
      expect(readTraceHeaders(sent)).toBeUndefined()
    }
  })
})

describe("endWhenSettled", () => {
  it("ends the span ok with what the work returns, or with the error and its code, passing the failure on", async () => {
    const ended: unknown[] = []
    const span = { end: (...args: unknown[]) => void ended.push(args) }
    expect(await endWhenSettled(span, () => 4)).toBe(4)
    const coded = Object.assign(new Error("Locked"), { details: { code: "locked" } })
    await expect(
      endWhenSettled(span, async () => {
        throw coded
      })
    ).rejects.toBe(coded)
    await expect(endWhenSettled(span, () => Promise.reject(new Error("Plain")))).rejects.toThrow("Plain")
    expect(ended).toEqual([["ok"], ["error", { code: "locked" }], ["error", undefined]])
  })

  it("ends the span as it's told, when told how", async () => {
    const ended: unknown[] = []
    const span = { end: (...args: unknown[]) => void ended.push(args) }
    const settled = {
      result: (value: number) => ({ outcome: value > 0 ? ("ok" as const) : ("error" as const), attributes: { value } }),
      error: () => ({ outcome: "cancelled" as const })
    }
    expect(await endWhenSettled(span, () => -1, settled)).toBe(-1)
    await expect(endWhenSettled(span, () => Promise.reject(new Error("Stopped")), settled)).rejects.toThrow("Stopped")
    expect(ended).toEqual([
      ["error", { value: -1 }],
      ["cancelled", undefined]
    ])
  })

  it("reads a coded error's code, or a Node error's own", () => {
    expect(errorCode(Object.assign(new Error(), { details: { code: "not_found" } }))).toBe("not_found")
    expect(errorCode(Object.assign(new Error(), { code: "ENOENT" }))).toBe("ENOENT")
    expect(errorCode("nope")).toBeUndefined()
  })
})
