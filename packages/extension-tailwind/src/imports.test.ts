import { describe, expect, it } from "vite-plus/test"
import { withStylesImport } from "./imports.ts"

describe("withStylesImport", () => {
  it("imports a library's styles right after Tailwind", () => {
    const source = '@import "tailwindcss";\n@import "./fonts.css";\n'

    expect(withStylesImport(source, "lib/styles.css")).toBe(
      '@import "tailwindcss";\n@import "lib/styles.css";\n@import "./fonts.css";\n'
    )
  })

  it("imports them first when the stylesheet doesn't import Tailwind", () => {
    expect(withStylesImport(":root {}\n", "lib/styles.css")).toBe('@import "lib/styles.css";\n:root {}\n')
  })
})
