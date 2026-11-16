import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { rsbuildBuilder, rsbuildConfigFiles } from "./builder.ts"

describe("the Rsbuild extension", () => {
  it("has a manifest Parity accepts, with its builder's entry and config files, and its versions", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers?.builder?.entry).toBe("./builder")
    expect(found.versions).toEqual({ packages: ["@rsbuild/core"], range: "^1.4.0 || ^2.0.0" })
  })

  it("names an entry module its package exports, which gives the builder", () => {
    const { entry } = readExtension(packageJson).manifest.contributes.providers!.builder!

    expect(Object.keys(packageJson.exports)).toContain(entry)
    expect(rsbuildBuilder.watches).toEqual(rsbuildConfigFiles)
  })
})
