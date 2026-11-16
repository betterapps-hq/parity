import { describe, expect, it } from "vite-plus/test"
import { clockOf, playerAction, seekTo, volumeTo } from "./controls.ts"

const press = (key: string, held: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) =>
  playerAction({ key, ctrlKey: false, altKey: false, metaKey: false, ...held })

describe("playerAction", () => {
  it("plays and pauses with Space and K, either case", () => {
    expect(press(" ")).toBe("toggle")
    expect(press("k")).toBe("toggle")
    expect(press("K")).toBe("toggle")
  })

  it("moves with left, right, Home and End, turns it up and down, mutes with M and fills the screen with F", () => {
    expect([press("ArrowLeft"), press("ArrowRight"), press("Home"), press("End")]).toEqual([
      "back",
      "forward",
      "start",
      "end"
    ])
    expect([press("ArrowUp"), press("ArrowDown")]).toEqual(["louder", "quieter"])
    expect(press("m")).toBe("mute")
    expect(press("f")).toBe("fullscreen")
  })

  it("leaves other keys, and any held with Ctrl, Alt or Command, to the app", () => {
    expect(press("Enter")).toBeUndefined()
    expect(press("Escape")).toBeUndefined()
    expect(press("f", { ctrlKey: true })).toBeUndefined()
    expect(press("k", { metaKey: true })).toBeUndefined()
    expect(press("ArrowRight", { altKey: true })).toBeUndefined()
  })
})

describe("seekTo", () => {
  it("moves five seconds back or forward, never past either end", () => {
    expect(seekTo("forward", 3, 12)).toBe(8)
    expect(seekTo("forward", 10, 12)).toBe(12)
    expect(seekTo("back", 8, 12)).toBe(3)
    expect(seekTo("back", 2, 12)).toBe(0)
  })

  it("goes to the start or the end, and leaves actions that don't move it", () => {
    expect(seekTo("start", 7, 12)).toBe(0)
    expect(seekTo("end", 7, 12)).toBe(12)
    expect(seekTo("mute", 7, 12)).toBeUndefined()
  })
})

describe("volumeTo", () => {
  it("turns it up or down a tenth, between silent and full", () => {
    expect(volumeTo("louder", 0.5, false)).toBe(0.6)
    expect(volumeTo("quieter", 0.5, false)).toBe(0.4)
    expect(volumeTo("louder", 0.95, false)).toBe(1)
    expect(volumeTo("quieter", 0.05, false)).toBe(0)
  })

  it("turns a muted video up from silence, and leaves actions that don't turn it", () => {
    expect(volumeTo("louder", 0.8, true)).toBe(0.1)
    expect(volumeTo("quieter", 0.8, true)).toBe(0)
    expect(volumeTo("toggle", 0.8, false)).toBeUndefined()
  })
})

describe("clockOf", () => {
  it("reads as a clock, with hours only when it runs that long", () => {
    expect(clockOf(5)).toBe("0:05")
    expect(clockOf(65.9)).toBe("1:05")
    expect(clockOf(3605)).toBe("1:00:05")
  })

  it("reads a length that isn't known yet as nothing played", () => {
    expect(clockOf(Number.NaN)).toBe("0:00")
    expect(clockOf(Number.POSITIVE_INFINITY)).toBe("0:00")
  })
})
