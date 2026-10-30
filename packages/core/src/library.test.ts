import { describe, expect, it } from "vite-plus/test"
import { deviceForWidth, lengthToPixels } from "./devices.ts"
import { libraryCanvas, parseLibraryManifest, withLibraryCanvas } from "./library.ts"

describe("parseLibraryManifest", () => {
  it("reads a library's name, styles and breakpoints, smallest first", () => {
    const manifest = parseLibraryManifest({
      version: 1,
      id: "nova",
      name: "Shadcn Nova",
      styles: "tailwind.css",
      breakpoints: [
        { id: "lg", name: "Large", width: 1024 },
        { id: "sm", name: "Small", width: 640 }
      ]
    })
    expect(manifest).toEqual({
      version: 1,
      id: "nova",
      name: "Shadcn Nova",
      styles: "tailwind.css",
      breakpoints: [
        { id: "sm", name: "Small", width: 640 },
        { id: "lg", name: "Large", width: 1024 }
      ]
    })
  })

  it("rejects unknown keys and missing names", () => {
    expect(() => parseLibraryManifest({ version: 1, name: "x", colours: [] })).toThrow(/colours/)
    expect(() => parseLibraryManifest({ version: 1 })).toThrow(/name/)
  })

  it("reads its tokens and its canvas of designs, and says where a design is wrong", () => {
    const canvas = {
      version: 3,
      containers: [
        {
          id: "button",
          name: "Button",
          kind: "component",
          position: { x: 120, y: 40 },
          root: { type: "layout", id: "root", children: [] },
          states: [{ id: "default", name: "Default" }]
        }
      ]
    }
    const manifest = parseLibraryManifest({ version: 2, name: "Nova", tokens: "tokens.resolver.json", canvas })
    expect(manifest.tokens).toBe("tokens.resolver.json")
    expect(libraryCanvas(manifest).containers[0]?.position).toEqual({ x: 120, y: 40 })
    expect(libraryCanvas(parseLibraryManifest({ version: 1, name: "Nova" }))).toEqual({ version: 3, containers: [] })
    expect(() => parseLibraryManifest({ version: 2, name: "Nova", canvas: { version: 3, containers: [{}] } })).toThrow(
      /^\/canvas\/containers\/0/
    )
  })
})

describe("withLibraryCanvas", () => {
  it("replaces only the canvas, keeping what the author wrote about the library", () => {
    const file = { $schema: "x", version: 1, name: "Nova", styles: "tailwind.css" }
    const saved = withLibraryCanvas(file, { version: 3, containers: [] })
    expect(saved).toEqual({ ...file, version: 2, canvas: { version: 3, containers: [] } })
    expect(Object.keys(saved)).toEqual(["$schema", "version", "name", "styles", "canvas"])
  })
})

describe("lengthToPixels", () => {
  it("reads px, rem and em, at 16px to the rem", () => {
    expect(lengthToPixels("40rem")).toBe(640)
    expect(lengthToPixels("48em")).toBe(768)
    expect(lengthToPixels("1280px")).toBe(1280)
    expect(lengthToPixels("calc(100% - 1rem)")).toBeUndefined()
  })
})

describe("deviceForWidth", () => {
  it("judges a device by width", () => {
    expect([375, 768, 1280, 1920].map(deviceForWidth)).toEqual(["phone", "tablet", "laptop", "desktop"])
  })
})
