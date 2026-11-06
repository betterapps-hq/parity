import { describe, expect, it } from "vite-plus/test"
import { sendsToSentry, telemetryEnvironment, telemetryLevel } from "./settings.ts"

describe("telemetryLevel", () => {
  it("sends everything unless asked otherwise", () => {
    expect(telemetryLevel({})).toBe("all")
    expect(telemetryLevel({ PARITY_TELEMETRY: "" })).toBe("all")
  })

  it("takes PARITY_TELEMETRY in any case", () => {
    expect(telemetryLevel({ PARITY_TELEMETRY: "errors" })).toBe("errors")
    expect(telemetryLevel({ PARITY_TELEMETRY: " OFF " })).toBe("off")
  })

  it("turns off for DO_NOT_TRACK, whatever PARITY_TELEMETRY says", () => {
    expect(telemetryLevel({ DO_NOT_TRACK: "1", PARITY_TELEMETRY: "all" })).toBe("off")
    expect(telemetryLevel({ DO_NOT_TRACK: "true" })).toBe("off")
    expect(telemetryLevel({ DO_NOT_TRACK: "0" })).toBe("all")
  })

  it("never sends from unit tests", () => {
    expect(telemetryLevel({ VITEST: "true", PARITY_TELEMETRY: "all" })).toBe("off")
  })

  it("refuses a value that isn't a level, rather than guessing", () => {
    expect(() => telemetryLevel({ PARITY_TELEMETRY: "of" })).toThrow(
      'PARITY_TELEMETRY is "of"; expected all, errors or off'
    )
  })
})

describe("telemetryEnvironment", () => {
  it("names CI runs, installed builds and checkouts", () => {
    expect(telemetryEnvironment({ CI: "true" }, true)).toBe("ci")
    expect(telemetryEnvironment({}, true)).toBe("tester")
    expect(telemetryEnvironment({}, false)).toBe("development")
  })

  it("doesn't count CI set to false", () => {
    expect(telemetryEnvironment({ CI: "false" }, false)).toBe("development")
    expect(telemetryEnvironment({ CI: "" }, true)).toBe("tester")
  })
})

describe("sendsToSentry", () => {
  it("sends everything at All, only errors at Errors, and nothing at Off", () => {
    const kinds = ["error", "log", "span"] as const
    expect(kinds.map((kind) => sendsToSentry("all", kind))).toEqual([true, true, true])
    expect(kinds.map((kind) => sendsToSentry("errors", kind))).toEqual([true, false, false])
    expect(kinds.map((kind) => sendsToSentry("off", kind))).toEqual([false, false, false])
  })
})
