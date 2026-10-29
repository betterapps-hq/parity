import { describe, expect, it } from "vitest"
import { matchesQuery, sizeQuery } from "./viewport.ts"

const phone = { width: 390, height: 844 }
const laptop = { width: 1280, height: 800 }

/** Whether a media query holds in a frame, with the real window saying yes to `hover` and no to anything else. */
function matches(query: string, viewport: { width: number; height: number }): boolean | undefined {
  const parsed = sizeQuery(query)
  return parsed && matchesQuery(parsed, viewport, (condition) => condition === "(hover: hover)")
}

describe("a frame's media queries", () => {
  it("answers widths and heights for the frame, in px, rem and em", () => {
    expect(matches("(max-width: 767px)", phone)).toBe(true)
    expect(matches("(max-width: 767px)", laptop)).toBe(false)
    expect(matches("(min-width: 40rem)", laptop)).toBe(true)
    expect(matches("(min-width: 48em)", phone)).toBe(false)
    expect(matches("(min-height: 820px)", phone)).toBe(true)
    expect(matches("(width: 390px)", phone)).toBe(true)
  })

  it("reads range syntax", () => {
    expect(matches("(width >= 64rem)", laptop)).toBe(true)
    expect(matches("(width < 768px)", phone)).toBe(true)
    expect(matches("(400px <= width < 800px)", phone)).toBe(false)
    expect(matches("(1024px < width)", laptop)).toBe(true)
  })

  it("answers orientation and aspect ratio from the frame's shape", () => {
    expect(matches("(orientation: portrait)", phone)).toBe(true)
    expect(matches("(orientation: landscape)", laptop)).toBe(true)
    expect(matches("(min-aspect-ratio: 16/10)", laptop)).toBe(true)
  })

  it("asks the real window the rest of a query", () => {
    expect(matches("screen and (min-width: 1024px) and (hover: hover)", laptop)).toBe(true)
    expect(matches("(min-width: 1024px) and (prefers-color-scheme: dark)", laptop)).toBe(false)
    expect(matches("print and (min-width: 1px)", laptop)).toBe(false)
  })

  it("takes alternatives and negation", () => {
    expect(matches("(max-width: 400px), (min-width: 1200px)", laptop)).toBe(true)
    expect(matches("not all and (min-width: 768px)", phone)).toBe(true)
    expect(matches("not all and (min-width: 768px)", laptop)).toBe(false)
  })

  it("leaves queries without a size, and nesting it doesn't read, to the real window", () => {
    expect(sizeQuery("(prefers-color-scheme: dark)")).toBeUndefined()
    expect(sizeQuery("(hover: hover) and (pointer: fine)")).toBeUndefined()
    expect(sizeQuery("((min-width: 1px) or (max-width: 2px))")).toBeUndefined()
    expect(sizeQuery("(min-width: calc(1px + 2px))")).toBeUndefined()
  })
})
