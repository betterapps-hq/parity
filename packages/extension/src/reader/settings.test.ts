import { describe, expect, it } from "vite-plus/test"
import type { SettingContribution } from "../index.ts"
import { fits } from "./settings.ts"

const openIn = {
  type: "string",
  enum: ["browser", "parity"],
  default: "browser",
  scope: "app",
  title: "Open stories in"
} satisfies SettingContribution

describe("fits", () => {
  it("takes a value only of its type, and one of its choices when it has them", () => {
    expect(fits({ type: "number", scope: "app", title: "N" }, 3)).toBe(true)
    expect(fits({ type: "number", scope: "app", title: "N" }, "3")).toBe(false)
    expect(fits({ type: "boolean", scope: "app", title: "On" }, false)).toBe(true)
    expect(fits(openIn, "parity")).toBe(true)
    expect(fits(openIn, "tab")).toBe(false)
  })
})
