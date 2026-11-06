import { describe, expect, it } from "vite-plus/test"
import { formatElementSource, parseElementSource } from "./index.ts"

describe("element sources", () => {
  it("writes and reads a file's line and column", () => {
    const source = { path: "src/components/ui/button.tsx", line: 12, column: 5 }
    expect(formatElementSource(source)).toBe("src/components/ui/button.tsx:12:5")
    expect(parseElementSource("src/components/ui/button.tsx:12:5")).toEqual(source)
  })

  it("reads a path with colons in it, as a Windows drive's", () => {
    expect(parseElementSource("C:/shop/src/a.tsx:3:1")).toEqual({ path: "C:/shop/src/a.tsx", line: 3, column: 1 })
  })

  it("reads nothing from anything else", () => {
    expect(
      [null, undefined, "", "src/a.tsx", "src/a.tsx:0:1", "src/a.tsx:3", ":3:1", "src/a.tsx:3:x"].map(
        parseElementSource
      )
    ).toEqual(Array.from({ length: 8 }, () => undefined))
  })
})
