import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { handles } from "./extension.ts"

describe("the Tailwind CSS extension", () => {
  it("has a manifest Parity accepts, with its styles provider and its versions by its peer dependency", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers).toEqual({ styles: {} })
    expect(found.versions).toEqual({ packages: ["tailwindcss"], range: "^4.0.0", prefix: "v" })
  })
})

describe("handles", () => {
  it("reads a stylesheet that imports Tailwind or uses its directives, and nothing else", () => {
    expect(handles(`@import "tailwindcss";`)).toBe(true)
    expect(handles(`@tailwind base;\n@tailwind utilities;`)).toBe(true)
    expect(handles(`:root { --primary: red; }`)).toBe(false)
  })
})
