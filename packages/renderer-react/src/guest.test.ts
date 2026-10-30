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

describe("the guest's code revision", () => {
  it("goes up when a component comes from a new file, and not when it's given the same one again", () => {
    const guest = createGuest({ components: { Card: () => null }, css: "" })
    let heard = 0
    const stop = guest.revision!.subscribe(() => heard++)
    const start = guest.revision!.get()

    guest.addComponents!({ Badge: { path: "src/badge.tsx", export: "Badge" } })
    expect(guest.revision!.get()).toBe(start + 1)
    guest.addComponents!({ Badge: { path: "src/badge.tsx", export: "Badge" } })
    expect(guest.revision!.get()).toBe(start + 1)
    // One the guest loaded with, moved to another file.
    guest.addComponents!({ Card: { path: "src/ui/card.tsx", export: "Card" } })
    expect(guest.revision!.get()).toBe(start + 2)
    guest.addComponents!({})
    expect(guest.revision!.get()).toBe(start + 2)
    expect(heard).toBe(2)

    stop()
    guest.addComponents!({ Badge: { path: "src/badge.tsx", export: "default" } })
    expect(guest.revision!.get()).toBe(start + 3)
    expect(heard).toBe(2)
  })
})
