import { describe, expect, it } from "vite-plus/test"
import { cn } from "./class-merger.ts"

describe("the app's class merger", () => {
  it("reads text-2xs as a size, so a color beside it stays", () => {
    expect(cn("text-2xs text-muted-foreground")).toBe("text-2xs text-muted-foreground")
  })

  it("lets text-2xs replace the kit's size", () => {
    expect(cn("text-xs font-medium", "text-2xs")).toBe("font-medium text-2xs")
  })

  it("lets a type role replace the kit's size, line and wrap", () => {
    expect(cn("text-muted-foreground text-sm leading-normal text-balance", "type-description")).toBe(
      "text-muted-foreground type-description"
    )
  })

  it("lets a size replace a type role", () => {
    expect(cn("type-message", "text-2xs")).toBe("text-2xs")
  })

  it("keeps the kit's responsive size beside a role that sets none", () => {
    expect(cn("text-base md:text-sm", "md:text-base")).toBe("text-base md:text-base")
  })
})
