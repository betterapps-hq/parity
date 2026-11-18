import { accountColor } from "@parity-app/presence-colors"
import { describe, expect, it } from "vite-plus/test"
import { initialsOf, lookOf } from "./look.ts"

describe("initialsOf", () => {
  it("takes the first letters of the first two names", () => {
    expect(initialsOf({ name: "Mia van der Berg", email: "mia@example.com" })).toBe("MV")
  })

  it("uses the email's name when there's no name", () => {
    expect(initialsOf({ email: "jonas.weber@example.com" })).toBe("JW")
  })

  it("shows a question mark when there's nothing to take letters from", () => {
    expect(initialsOf({ email: "@example.com" })).toBe("?")
  })
})

describe("lookOf", () => {
  it("gives initials on the email's color, and no picture without one", () => {
    expect(lookOf({ name: "Mia Chen", email: "mia@example.com" })).toEqual({
      initials: "MC",
      color: accountColor("mia@example.com")
    })
  })

  it("carries the provider's picture", () => {
    expect(
      lookOf({ name: "Mia Chen", email: "mia@example.com", pictureUrl: "https://example.com/mia.png" }).photo
    ).toBe("https://example.com/mia.png")
  })
})
