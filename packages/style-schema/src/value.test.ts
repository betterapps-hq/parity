import { describe, expect, it } from "vite-plus/test"
import { formatNumber, lengthForm } from "./value.ts"

describe("lengthForm", () => {
  it("stores a whole pixel as a spacing step, a quarter step included", () => {
    expect(lengthForm(16)).toEqual({ step: 4 })
    expect(lengthForm(13)).toEqual({ step: 3.25 })
    expect(lengthForm(-8)).toEqual({ step: -2 })
  })

  it("stores part of a pixel as a value", () => {
    expect(lengthForm(13.3333)).toEqual({ value: "13.333px" })
  })
})

describe("formatNumber", () => {
  it("keeps three decimals unless told, without trailing zeros", () => {
    expect(formatNumber(1.23456)).toBe("1.235")
    expect(formatNumber(1.5, 0)).toBe("2")
    expect(formatNumber(2.1)).toBe("2.1")
  })
})
