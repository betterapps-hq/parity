import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { turbopackBuilder } from "./builder.ts"

describe("the Turbopack extension", () => {
  it("has a manifest Parity accepts, with its builder's entry and config files, and its versions", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers?.builder?.entry).toBe("./builder")
    expect(found.manifest.contributes.providers?.builder?.watches).toEqual(turbopackBuilder.watches)
    expect(found.versions).toEqual({ packages: ["next"], range: "^16.0.0" })
  })

  it("names an entry module its package exports, which gives the builder", () => {
    const { entry } = readExtension(packageJson).manifest.contributes.providers!.builder!

    expect(Object.keys(packageJson.exports)).toContain(entry)
  })
})
