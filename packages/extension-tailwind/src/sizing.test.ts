import { describe, expect, it } from "vite-plus/test"
import { setsOwnSize } from "./sizing.ts"

describe("setsOwnSize", () => {
  it("says so for a width, a height under a line or @container on the element itself", () => {
    expect(setsOwnSize(["relative", "flex", "size-8", "shrink-0"])).toBe(true)
    expect(setsOwnSize(["w-(--sidebar-width)"])).toBe(true)
    expect(setsOwnSize(["@container/card-header", "grid"])).toBe(true)
    expect(setsOwnSize(["bg-border", "data-horizontal:h-px", "data-horizontal:w-full"])).toBe(true)
  })

  it("leaves out a height that holds a line of text, a full width, and classes for what's inside or from a parent", () => {
    // A badge's `h-5` holds a line of text.
    expect(setsOwnSize(["inline-flex", "h-5", "rounded-full"])).toBe(false)
    expect(setsOwnSize(["flex", "w-full", "gap-2", "group-data-[size=sm]/card:size-6"])).toBe(false)
    expect(setsOwnSize(["shrink-0", "[&_svg]:size-4"])).toBe(false)
    expect(setsOwnSize([])).toBe(false)
  })
})
