import { describe, expect, it } from "vite-plus/test"
import { readEnvironment } from "./environment.ts"

describe("readEnvironment", () => {
  it("reads the variables scripts and tests set, as the values main uses", () => {
    expect(
      readEnvironment({
        PARITY_RENDERER_URL: "http://localhost:5173/",
        PARITY_DEBUG_PORT: "9333",
        PARITY_WINDOW_SIZE: "1439x901",
        PARITY_DEV_RUNNER: "4120",
        PATH: "/usr/bin"
      })
    ).toEqual({
      PARITY_RENDERER_URL: "http://localhost:5173/",
      PARITY_DEBUG_PORT: 9333,
      PARITY_WINDOW_SIZE: { width: 1439, height: 901 },
      PARITY_DEV_RUNNER: 4120
    })
  })

  it("loads the installed page when nothing is set, and counts an empty variable as unset", () => {
    expect(readEnvironment({ PARITY_DEBUG_PORT: "", PARITY_PROJECT: "" })).toEqual({
      PARITY_RENDERER_URL: "parity://app/index.html"
    })
  })

  it("refuses a bad value, naming the variable", () => {
    expect(() => readEnvironment({ PARITY_WINDOW_SIZE: "1440 by 900" })).toThrow(
      new TypeError(
        "Parity can't start with this environment variable: PARITY_WINDOW_SIZE: expected a size such as 1440x900"
      )
    )
    expect(() => readEnvironment({ PARITY_DEBUG_PORT: "--inspect" })).toThrow(
      "PARITY_DEBUG_PORT: expected a whole number"
    )
    expect(() => readEnvironment({ PARITY_DEBUG_PORT: "70000" })).toThrow("PARITY_DEBUG_PORT: expected at most 65535")
    expect(() => readEnvironment({ PARITY_RENDERER_URL: "not a url" })).toThrow("PARITY_RENDERER_URL: expected a URL")
  })
})
