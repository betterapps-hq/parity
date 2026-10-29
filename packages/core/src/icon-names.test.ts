import { describe, expect, it } from "vitest"
import { iconVariants } from "./icon-names.ts"

const fluent = {
  pattern: "^(?<name>.+?)(?<size>\\d+)?(?<style>Regular|Filled|Color|Light)$",
  styles: ["Regular", "Filled", "Color", "Light"],
  sizes: [10, 12, 16, 20, 24, 28, 32, 48]
}

const read = (names: string[]) =>
  Object.fromEntries(
    [...iconVariants(names, fluent)].map(([name, { label, size, listed }]) => [name, { label, size, listed }])
  )

describe("iconVariants", () => {
  it("reads a size only where the icon also comes without one", () => {
    expect(read(["AddRegular", "Add24Regular", "CalendarDayRegular", "CalendarDay32Color"])).toEqual({
      AddRegular: { label: "Add", size: undefined, listed: true },
      Add24Regular: { label: "Add", size: 24, listed: false },
      CalendarDayRegular: { label: "CalendarDay", size: undefined, listed: true },
      CalendarDay32Color: { label: "CalendarDay", size: 32, listed: false }
    })
  })

  it("keeps a number that's part of an icon's name, even one that could be a size", () => {
    expect(
      read(["Battery0Regular", "Battery020Regular", "Battery10Regular", "Battery1020Regular", "TextHeader1Regular"])
    ).toEqual({
      Battery0Regular: { label: "Battery0", size: undefined, listed: true },
      Battery020Regular: { label: "Battery0", size: 20, listed: false },
      Battery10Regular: { label: "Battery10", size: undefined, listed: true },
      Battery1020Regular: { label: "Battery10", size: 20, listed: false },
      TextHeader1Regular: { label: "TextHeader1", size: undefined, listed: true }
    })
  })

  it("lists an icon shipped only at fixed sizes once, at the size nearest the default", () => {
    expect(read(["CodeCs16Regular", "Text12Regular", "Text16Regular", "Text32Regular"])).toEqual({
      CodeCs16Regular: { label: "CodeCs", size: 16, listed: true },
      Text12Regular: { label: "Text", size: 12, listed: false },
      Text16Regular: { label: "Text", size: 16, listed: true },
      Text32Regular: { label: "Text", size: 32, listed: false }
    })
  })

  it("leaves out exports the pattern doesn't match", () => {
    expect(iconVariants(["useIconContext"], fluent).size).toBe(0)
  })
})
