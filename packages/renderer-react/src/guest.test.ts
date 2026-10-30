import { describe, expect, it } from "vite-plus/test"
import { createGuest } from "./guest.ts"

const cog = () => null
const bell = () => null
const solidCog = () => null

describe("createGuest with icon sets", () => {
  it("draws a style kept in a module of its own from that module, and lists its icons apart", () => {
    const guest = createGuest({
      components: {},
      css: "",
      iconSets: {
        heroicons: {
          module: { CogIcon: cog, BellIcon: bell },
          styles: { "16/solid": { CogIcon: solidCog } }
        }
      }
    })
    expect(guest.hasComponent("heroicons/CogIcon")).toBe(true)
    expect(guest.hasComponent("heroicons/16/solid/CogIcon")).toBe(true)
    expect(guest.hasComponent("heroicons/16/solid/BellIcon")).toBe(false)
    expect(guest.hasComponent("heroicons/20/solid/CogIcon")).toBe(false)
    expect(guest.iconNames?.("heroicons")).toEqual(["BellIcon", "CogIcon"])
    expect(guest.iconNames?.("heroicons", "16/solid")).toEqual(["CogIcon"])
    expect(guest.iconNames?.("heroicons", "20/solid")).toEqual([])
  })
})
