import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { readComponents } from "./extension.ts"

describe("the React extension", () => {
  it("has a manifest Parity accepts, with its renderer's guest and runtime, and its versions by its peer dependencies", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers?.renderer).toMatchObject({
      guest: "./guest",
      runtimePackages: ["react", "react-dom"],
      componentExtensions: [".tsx", ".ts", ".jsx", ".js"]
    })
    expect(found.versions).toEqual({ packages: ["react", "react-dom"], range: "^18.0.0 || ^19.0.0" })
  })

  it("names a guest module its package exports", () => {
    const { guest } = readExtension(packageJson).manifest.contributes.providers!.renderer!

    expect(Object.keys(packageJson.exports)).toContain(guest)
  })
})

describe("readComponents", () => {
  it("reads each file's components, in the order the files are given", () => {
    const files = [
      { file: "src/card.tsx", source: "export function Card() { return <div /> }" },
      { file: "src/util.ts", source: "export const sum = (a: number, b: number) => a + b" },
      { file: "src/button.tsx", source: "export default function Button() { return <button /> }" }
    ]

    expect(readComponents(files)).toEqual([
      [{ name: "Card", export: "Card", as: "function" }],
      [],
      [{ name: "Button", export: "default", as: "function" }]
    ])
  })
})
