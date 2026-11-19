import type { Palette } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import { HeldPalettes } from "./palettes.ts"

const palette = (n: number): Palette => ({ n, name: `P${n}`, stops: ["a", "b", "c"], color: "c", ink: "i" })

/** A colors service that counts claims per key and hands out whatever number `numbers` says. */
function counting() {
  const claims = new Map<string, number>()
  const numbers = new Map<string, number>()
  let calls = 0

  return {
    claims,
    numbers,
    calls: () => calls,
    colors: {
      claim(key: string) {
        calls += 1
        claims.set(key, (claims.get(key) ?? 0) + 1)

        return palette(numbers.get(key) ?? 0)
      },
      release(key: string) {
        claims.set(key, (claims.get(key) ?? 0) - 1)
      }
    }
  }
}

describe("HeldPalettes", () => {
  it("claims someone's palette once, however often it's read", () => {
    const service = counting()
    const palettes = new HeldPalettes(service.colors)

    for (let draw = 0; draw < 50; draw += 1) {
      palettes.of("a")
    }

    expect(service.calls()).toBe(1)
    expect(service.claims.get("a")).toBe(1)
  })

  it("reads each palette again after an assignment, keeping one claim on it", () => {
    const service = counting()
    const palettes = new HeldPalettes(service.colors)
    palettes.of("a")
    palettes.of("b")

    service.numbers.set("b", 3)
    palettes.reread()

    expect(palettes.of("b")).toEqual(palette(3))
    expect([...service.claims]).toEqual([
      ["a", 1],
      ["b", 1]
    ])
  })

  it("gives the claim back when they leave, and only once", () => {
    const service = counting()
    const palettes = new HeldPalettes(service.colors)
    palettes.of("a")

    palettes.release("a")
    palettes.release("a")

    expect(service.claims.get("a")).toBe(0)
  })
})
