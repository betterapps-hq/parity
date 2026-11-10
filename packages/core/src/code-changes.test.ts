import { describe, expect, it, vi } from "vite-plus/test"
import type { CodeChange } from "./adapters.ts"
import { gatherChanges, isStylesheetFile } from "./code-changes.ts"

describe("isStylesheetFile", () => {
  it("knows a stylesheet by its extension, with any query left off, and nothing else", () => {
    expect(
      ["src/styles.css", "/app/theme.scss", "a.module.less", "b.styl", "c.pcss?inline"].map(isStylesheetFile)
    ).toEqual([true, true, true, true, true])
    expect(["src/card.tsx", "styles.css.ts", "README.md", "css"].map(isStylesheetFile)).toEqual([
      false,
      false,
      false,
      false
    ])
  })
})

describe("gatherChanges", () => {
  it("sends a burst of saves once, with the latest stamp, and stamps that always go up", () => {
    vi.useFakeTimers()

    try {
      const send = vi.fn<(change: CodeChange) => void>()
      const changes = gatherChanges(send)
      const first = changes.stamp()
      changes.add({ paths: ["src/card.tsx"], styles: false })
      const second = changes.stamp()
      changes.add({ paths: ["src/button.tsx", "src/card.tsx"], styles: false })
      changes.add({ paths: [], styles: false })
      expect(second).toBeGreaterThan(first)
      vi.advanceTimersByTime(100)
      expect(send).toHaveBeenCalledExactlyOnceWith({ paths: ["src/card.tsx", "src/button.tsx"], stamp: second })

      // A stylesheet's change is sent though no component file changed, and said of the whole burst it was in.
      const third = changes.stamp()
      changes.add({ paths: [], styles: true })
      changes.add({ paths: ["src/card.tsx"], styles: false })
      vi.advanceTimersByTime(100)
      expect(send).toHaveBeenLastCalledWith({ paths: ["src/card.tsx"], stamp: third, styles: true })
      changes.add({ paths: ["src/card.tsx"], styles: false })
      vi.advanceTimersByTime(100)
      expect(send).toHaveBeenLastCalledWith({ paths: ["src/card.tsx"], stamp: third })
    } finally {
      vi.useRealTimers()
    }
  })
})
