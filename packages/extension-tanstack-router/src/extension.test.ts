import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }

describe("the TanStack Router extension", () => {
  it("has a manifest Parity accepts, and gives its supported versions by its peer dependency", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual([])
    expect(found.versions).toEqual({ packages: ["@tanstack/react-router"], range: "^1.0.0" })
  })
})
