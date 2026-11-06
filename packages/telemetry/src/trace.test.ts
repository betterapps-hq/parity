import { describe, expect, it } from "vite-plus/test"
import { formatTraceparent, newSpanId, newTraceId, parseTraceparent } from "./index.ts"

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
