import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { viteBuilder, viteConfigFiles } from "./builder.ts"

describe("the Vite extension", () => {
  it("has a manifest Parity accepts, with its builder's entry, config files and console chatter, and its versions", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers?.builder).toEqual({
      entry: "./builder",
      watches: viteConfigFiles,
      console: { chatter: [String.raw`^\[vite\]`], generatedPaths: ["^@"] }
    })
    expect(found.versions).toEqual({
      packages: ["vite"],
      range: "^6.0.0 || ^7.0.0 || ^8.0.0",
      distributions: { "@voidzero-dev/vite-plus-core": "Vite+" }
    })
  })

  it("names an entry module its package exports, which gives the builder", () => {
    const { entry } = readExtension(packageJson).manifest.contributes.providers!.builder!

    expect(Object.keys(packageJson.exports)).toContain(entry)
    expect(viteBuilder.watches).toEqual(viteConfigFiles)
  })
})
