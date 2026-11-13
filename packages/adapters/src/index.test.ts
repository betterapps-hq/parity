import { describe, expect, it } from "vite-plus/test"
import { builders } from "./builders.ts"
import { adapters } from "./index.ts"

describe("adapters", () => {
  // Detection, status items and imported screens are matched to their adapter by id.
  it("gives every adapter its own id", () => {
    const ids = Object.values(adapters).flatMap((list) => list.map((adapter) => adapter.id))

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("lists the builders a builder's process loads", () => {
    expect(adapters.builders).toBe(builders)
  })
})
