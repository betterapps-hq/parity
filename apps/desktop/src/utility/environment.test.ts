import { describe, expect, it } from "vite-plus/test"
import { readCopyEnvironment } from "./environment.ts"

describe("readCopyEnvironment", () => {
  it("reads the copy's process id and start time as numbers", () => {
    expect(
      readCopyEnvironment({ PARITY_APP_PID: "4120", PARITY_APP_STARTED: "1762300000000", HOME: "/home/a" })
    ).toEqual({ PARITY_APP_PID: 4120, PARITY_APP_STARTED: 1762300000000 })
  })

  it("leaves out what isn't set, or is set empty", () => {
    expect(readCopyEnvironment({ PARITY_APP_PID: "" })).toEqual({})
  })

  it("refuses a value that isn't a whole number, naming the variable", () => {
    expect(() => readCopyEnvironment({ PARITY_APP_PID: "abc" })).toThrow(
      "The agent server can't start with this environment variable: PARITY_APP_PID: expected a whole number"
    )
    expect(() => readCopyEnvironment({ PARITY_APP_STARTED: "0" })).toThrow(
      /PARITY_APP_STARTED: expected a whole number/
    )
  })
})
