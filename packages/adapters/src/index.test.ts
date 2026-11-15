import type { Adapter } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { builders } from "./builders.ts"
import { adapters, extensionTools } from "./index.ts"

describe("adapters", () => {
  // Detection, status items and imported screens are matched to their adapter by id.
  it("gives every adapter its own id", () => {
    const all: readonly Adapter[] = Object.values(adapters).flat()
    const ids = all.map((adapter) => adapter.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("lists the builders a builder's process loads", () => {
    expect(adapters.builders).toBe(builders)
  })

  // Detection lists the styling framework before Storybook and the router after, as it did before they were extensions.
  it("says which extension tools style the project (PAR-1095)", () => {
    expect(extensionTools.map(({ id, styles }) => [id, styles])).toEqual([
      ["tailwind", true],
      ["tanstack-router", false]
    ])
  })
})
