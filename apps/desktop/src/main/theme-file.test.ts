import { describe, expect, it } from "vite-plus/test"
import { savedTheme } from "./theme-file.ts"

describe("savedTheme", () => {
  it("reads the theme theme.json keeps", () => {
    expect(savedTheme('{"theme":"light"}')).toBe("light")
    expect(savedTheme('{"theme":"system"}')).toBe("system")
  })

  it("opens dark when theme.json is missing, corrupt or names no theme Parity has", () => {
    expect(savedTheme(undefined)).toBe("dark")
    expect(savedTheme('{"theme":"li')).toBe("dark")
    expect(savedTheme("[]")).toBe("dark")
    expect(savedTheme('{"theme":"sepia"}')).toBe("dark")
  })
})
