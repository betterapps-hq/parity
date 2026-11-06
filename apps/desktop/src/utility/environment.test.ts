import { describe, expect, it } from "vite-plus/test"
import { readServiceEnvironment } from "./environment.ts"

describe("readServiceEnvironment", () => {
  it("reads the service's variables, and only those", () => {
    expect(
      readServiceEnvironment({
        PARITY_APP_PID: "4120",
        PARITY_APP_STARTED: "1762300000000",
        PARITY_ALLOWED_ORIGINS: "http://localhost:5310,,http://localhost:6006",
        PARITY_CHECKER_IDLE_MS: "1000",
        PARITY_BITMAP_DIR: "D:/data/bitmaps",
        PARITY_DEV_RUNNER: "1",
        HOME: "/home/a"
      })
    ).toEqual({
      PARITY_APP_PID: 4120,
      PARITY_APP_STARTED: 1762300000000,
      PARITY_ALLOWED_ORIGINS: ["http://localhost:5310", "http://localhost:6006"],
      PARITY_CHECKER_IDLE_MS: 1000,
      PARITY_BITMAP_DIR: "D:/data/bitmaps",
      PARITY_DEV_RUNNER: "1"
    })
  })

  it("leaves out what isn't set, or is set empty", () => {
    expect(readServiceEnvironment({ PARITY_APP_PID: "", PARITY_CACHE_DIR: "" })).toEqual({})
  })

  it("refuses a value that isn't a whole number, naming the variable", () => {
    expect(() => readServiceEnvironment({ PARITY_APP_PID: "abc" })).toThrow(
      "The project service can't start with this environment variable: PARITY_APP_PID: expected a whole number"
    )
    expect(() => readServiceEnvironment({ PARITY_APP_STARTED: "0" })).toThrow(
      /PARITY_APP_STARTED: expected a whole number/
    )
    expect(() => readServiceEnvironment({ PARITY_CHECKER_IDLE_MS: "5m" })).toThrow(
      /PARITY_CHECKER_IDLE_MS: expected a whole number/
    )
  })
})
