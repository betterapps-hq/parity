import { describe, expect, it } from "vite-plus/test"
import { lengthSteps, lengthToken } from "./lengths.ts"

describe("lengthSteps", () => {
  it("gives the steps of a number, negative and zero too", () => {
    expect(lengthSteps(4)).toBe(4)
    expect(lengthSteps(-1.5)).toBe(-1.5)
    expect(lengthSteps(0)).toBe(0)
  })

  it("gives nothing for a token, fill, hug or no length", () => {
    expect(lengthSteps("space-4")).toBeUndefined()
    expect(lengthSteps("fill")).toBeUndefined()
    expect(lengthSteps(undefined)).toBeUndefined()
  })
})

describe("lengthToken", () => {
  it("gives the name a length token has, and nothing for steps", () => {
    expect(lengthToken("space-4")).toBe("space-4")
    expect(lengthToken(4)).toBeUndefined()
    expect(lengthToken(undefined)).toBeUndefined()
  })
})
