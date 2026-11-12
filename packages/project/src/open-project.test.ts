import { join, resolve } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { documentTarget, pickMainDocument, projectFileChange, readDesigns } from "./open-project.ts"

describe("pickMainDocument", () => {
  it.each([
    { name: "takes the first .par at the root", documents: ["designs/a.par", "shop.par", "z.par"], main: "shop.par" },
    { name: "else a library's own .lib.par", documents: ["designs/a.par", "nova.lib.par"], main: "nova.lib.par" },
    { name: "else any .par", documents: ["designs/a.par"], main: "designs/a.par" },
    { name: "else a new one named after the package", documents: [], main: "shop.par" }
  ])("$name", ({ documents, main }) => {
    expect(pickMainDocument(documents, "@acme/shop")).toBe(main)
  })

  it("names a new one `project.par` when the package's name has nothing to name it by", () => {
    expect(pickMainDocument([], "@acme/!!!")).toBe("project.par")
  })
})

describe("readDesigns", () => {
  it("reads a .par as its designs, and a .lib.par's designs from its canvas", () => {
    const canvas = { version: 4, containers: [] }
    expect(readDesigns("shop.par", JSON.stringify(canvas))).toEqual(canvas)
    const library = { version: 4, name: "Nova", canvas }
    expect(readDesigns("nova.lib.par", JSON.stringify(library))).toEqual(canvas)
  })
})

describe("documentTarget", () => {
  const root = resolve("/work/shop")

  it("places a .par inside the root", () => {
    expect(documentTarget(root, "designs/home.par")).toBe(join(root, "designs", "home.par"))
  })

  it.each(["../shop-old/home.par", "../home.par", resolve("/elsewhere/home.par"), "notes.txt", "."])(
    "refuses %s",
    (path) => {
      expect(documentTarget(root, path)).toBeUndefined()
    }
  )
})

describe("projectFileChange", () => {
  const change = (path: string, configInput = false) =>
    projectFileChange(path, { componentExtensions: [".tsx", ".ts"], configInput })

  it.each([
    { path: "node_modules/ui/tsconfig.json", configInput: true, expected: "config" },
    { path: "src/Button.tsx", expected: "component" },
    { path: "src/.cache/Button.tsx", expected: undefined },
    { path: "node_modules/ui/Button.tsx", expected: undefined },
    { path: "shop.par", expected: "document" },
    { path: "designs/home.par", expected: "document" },
    { path: "nova.lib.par", expected: "document" },
    { path: "libraries/nova.lib.par", expected: undefined },
    { path: "README.md", expected: undefined }
  ])("takes $path for $expected", ({ path, configInput, expected }) => {
    expect(change(path, configInput)).toBe(expected)
  })
})
