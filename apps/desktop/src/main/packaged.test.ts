import { describe, expect, it } from "vite-plus/test"
import { isPackaged } from "./packaged.ts"

describe("isPackaged", () => {
  it("is packaged when Electron says so outside the dev runner", () => {
    expect(isPackaged(true, undefined)).toBe(true)
  })

  it("isn't packaged under the dev runner, which runs a copy of Electron named Parity", () => {
    expect(isPackaged(true, 1234)).toBe(false)
  })

  it("isn't packaged when Electron runs under its own name", () => {
    expect(isPackaged(false, undefined)).toBe(false)
    expect(isPackaged(false, 1234)).toBe(false)
  })
})
