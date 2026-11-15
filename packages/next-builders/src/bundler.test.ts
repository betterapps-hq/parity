import { describe, expect, it } from "vite-plus/test"
import { nextBundler, nextDevScript } from "./bundler.ts"

describe("the bundler Next's dev server runs", () => {
  it("is Turbopack on Next.js 16 and webpack before, unless the script says otherwise", () => {
    expect(nextBundler("next dev", "16.4.6")).toBe("turbopack")
    expect(nextBundler(undefined, "16.0.0")).toBe("turbopack")
    expect(nextBundler("next dev", "15.5.2")).toBe("webpack")
    expect(nextBundler("next dev --webpack", "16.4.6")).toBe("webpack")
    expect(nextBundler("next dev --turbopack", "15.5.2")).toBe("turbopack")
    expect(nextBundler("next dev --turbo -p 3001", "14.2.0")).toBe("turbopack")
  })

  it("is read from the script that runs `next dev`, not `next build` or `next start`", () => {
    expect(nextDevScript({ build: "next build", start: "next start", dev: "next dev --webpack" })).toEqual([
      "dev",
      "next dev --webpack"
    ])
    expect(nextDevScript({ build: "next build" })).toBeUndefined()
    expect(nextDevScript(undefined)).toBeUndefined()
  })
})
