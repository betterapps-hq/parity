import { describe, expect, it } from "vite-plus/test"
import { parseJsonc } from "./jsonc.ts"

describe("parseJsonc", () => {
  it("keeps comment markers inside strings", () => {
    expect(parseJsonc('{ "paths": { "@/*": ["./src/*"], }, // done\n }')).toEqual({ paths: { "@/*": ["./src/*"] } })
  })
})
