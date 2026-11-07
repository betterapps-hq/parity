import { describe, expect, it } from "vite-plus/test"
import { crashTime, lowerFirst } from "./report-time.ts"

describe("crashTime", () => {
  const now = new Date(2026, 10, 6, 15, 0)
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 5).toISOString()
  const clock = (day: number, hour: number) =>
    new Date(2026, 10, day, hour, 5).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

  it("says today, yesterday, or the date", () => {
    expect(crashTime(at(6, 14), now)).toBe(`Today at ${clock(6, 14)}`)
    expect(crashTime(at(5, 9), now)).toBe(`Yesterday at ${clock(5, 9)}`)
    const date = new Date(2026, 10, 2).toLocaleDateString(undefined, { month: "long", day: "numeric" })
    expect(crashTime(at(2, 9), now)).toBe(`${date} at ${clock(2, 9)}`)
  })

  it("reads mid-sentence without lowering the clock's PM", () => {
    expect(lowerFirst("Today at 7:22 PM")).toBe("today at 7:22 PM")
  })
})
