import { describe, expect, it } from "vite-plus/test"
import { stoppedFromOutside } from "./builders.ts"

describe("stoppedFromOutside", () => {
  it("counts a stop signal, or the code Vite exits with when it handles one, as stopped from outside", () => {
    expect(stoppedFromOutside({ signal: "SIGTERM", output: "" })).toBe(true)
    expect(stoppedFromOutside({ exitCode: 143, output: "" })).toBe(true)
    expect(stoppedFromOutside({ exitCode: 130, output: "" })).toBe(true)
  })

  it("counts any other exit as a crash", () => {
    expect(stoppedFromOutside({ exitCode: 1, output: "Error: Cannot find module" })).toBe(false)
    expect(stoppedFromOutside({ signal: "SIGKILL", output: "" })).toBe(false)
    expect(stoppedFromOutside(undefined)).toBe(false)
  })
})
