import { describe, expect, it } from "vite-plus/test"
import { namespacedName, tokenNamed } from "./token-scale.ts"

describe("a token's name in a field", () => {
  it("has the field's namespace once, whether the project's name has it or not", () => {
    expect(namespacedName("font-heading", "font-")).toBe("font-heading")
    expect(namespacedName("sans", "font-")).toBe("font-sans")
  })

  it("is found typed with the namespace or without it, either way the token is named", () => {
    const tokens = [{ name: "font-heading" }, { name: "sans" }]
    expect(tokenNamed(tokens, "heading", "font-")?.name).toBe("font-heading")
    expect(tokenNamed(tokens, "font-heading", "font-")?.name).toBe("font-heading")
    expect(tokenNamed(tokens, "font-sans", "font-")?.name).toBe("sans")
  })
})
