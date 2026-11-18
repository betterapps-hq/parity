import { describe, expect, it } from "vite-plus/test"
import { accountColor, accountHue } from "./account.ts"

describe("accountColor", () => {
  it("keeps the color avatars have always had, so nobody's changes", () => {
    expect(accountColor("mia@example.com")).toBe("oklch(0.6 0.13 18)")
  })

  it("gives different emails different hues", () => {
    expect(accountHue("mia@example.com")).not.toBe(accountHue("jonas@example.com"))
  })

  it("keeps the hue a whole degree on the color wheel", () => {
    for (const email of ["", "a", "mia@example.com", "ö@ü.de", "a.very.long.address+tag@sub.example.co.uk"]) {
      const hue = accountHue(email)

      expect(Number.isInteger(hue)).toBe(true)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })
})
