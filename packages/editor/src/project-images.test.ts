import type { CanvasDocument, ContainerSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { cantRemove, codeReferences, filterImages, findImage, projectImages } from "./project-images.ts"

const credit = { name: "Ada Park", url: "https://unsplash.com/@adapark", source: "Unsplash" }

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    children: [
      { type: "image", id: "hero", src: "/images/hero.png?v=2", alt: "A desk by a window" },
      { type: "image", id: "photo", src: "https://images.unsplash.com/photo-1", credit },
      { type: "instance", id: "avatar", design: "avatar", args: { src: "/images/ada.jpg" } },
      { type: "image", id: "gone", src: "/images/gone.png" }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "dark", name: "Dark", overrides: { avatar: { props: { src: "/images/hero-dark.png" } } } }
  ]
}

const pricing: ContainerSpec = {
  id: "pricing",
  name: "Pricing",
  position: { x: 0, y: 0 },
  root: { type: "image", id: "banner", src: "/images/hero.png" },
  states: [{ id: "default", name: "Default" }]
}

const document: CanvasDocument = { version: 3, containers: [home, pricing] }

const documents = [{ path: "app.par", document }]

const files = [
  { path: "public/images/unused.webp", bytes: 300 },
  { path: "public/images/hero.png", bytes: 1200 },
  { path: "public/images/hero-dark.png", bytes: 1100 },
  { path: "public/images/ada.jpg", bytes: 900 },
  { path: "public/images/logo.svg", bytes: 400 }
]

const code = [
  { path: "src/App.tsx", text: 'export const App = () => (\n  <img src="/images/logo.svg" alt="" />\n)' },
  { path: "src/index.css", text: ".hero {\n  background: url(images/hero.png);\n}" }
]

const images = projectImages({ files, references: codeReferences(files, code), documents })

describe("projectImages", () => {
  it("lists the project's files by path, then linked photos, then paths with no file", () => {
    expect(images.map(({ kind, name }) => [kind, name])).toEqual([
      ["file", "ada.jpg"],
      ["file", "hero-dark.png"],
      ["file", "hero.png"],
      ["file", "logo.svg"],
      ["file", "unused.webp"],
      ["linked", "Photo by Ada Park"],
      ["missing", "/images/gone.png"]
    ])
  })

  it("finds every layer that shows a file: image layers, an instance's props and a state's patch", () => {
    const uses = (name: string) =>
      findImage(images, name)?.usedBy.map(({ designName, node }) => `${designName} ${node}`)

    expect(uses("hero.png")).toEqual(["Home hero", "Pricing banner"])
    expect(uses("hero-dark.png")).toEqual(["Home avatar"])
    expect(uses("ada.jpg")).toEqual(["Home avatar"])
    expect(findImage(images, "hero.png")?.alt).toBe("A desk by a window")
  })

  it("finds the lines of code that name a file, from an <img> or a CSS url()", () => {
    expect(findImage(images, "logo.svg")?.usedInCode).toEqual([{ path: "src/App.tsx", line: 2 }])
    expect(findImage(images, "hero.png")?.usedInCode).toEqual([{ path: "src/index.css", line: 2 }])
  })

  it("keeps a linked photo's credit, and finds an image by path, address or file name", () => {
    const photo = findImage(images, "https://images.unsplash.com/photo-1")

    expect(photo?.credit).toEqual(credit)
    expect(findImage(images, "public/images/ada.jpg")).toBe(findImage(images, "/images/ada.jpg"))
    expect(findImage(images, ".\\public\\images\\ada.jpg")?.name).toBe("ada.jpg")
  })
})

describe("filterImages", () => {
  it("matches a name, alt text or credit, and keeps to unused images when asked", () => {
    expect(filterImages(images, { search: "DESK" }).map(({ name }) => name)).toEqual(["hero.png"])
    expect(filterImages(images, { search: "ada park" }).map(({ kind }) => kind)).toEqual(["linked"])
    expect(filterImages(images, { unused: true }).map(({ name }) => name)).toEqual(["unused.webp"])
  })
})

describe("cantRemove", () => {
  it("allows a file nothing uses", () => {
    expect(cantRemove(images, "public/images/unused.webp")).toBeUndefined()
  })

  it("says where a file is still used, in designs and in code", () => {
    expect(cantRemove(images, "hero.png")).toBe(
      "hero.png is still used in Home, Pricing and src/index.css (line 2). Remove or replace it there first."
    )
    expect(cantRemove(images, "logo.svg")).toBe(
      "logo.svg is still used in src/App.tsx (line 2). Remove or replace it there first."
    )
  })

  it("explains that a linked photo or a missing file has no file to remove, and names what isn't an image", () => {
    expect(cantRemove(images, "https://images.unsplash.com/photo-1")).toBe(
      "Photo by Ada Park is linked at its library's address, so there's no file to remove. Remove or replace the layers that show it instead."
    )
    expect(cantRemove(images, "/images/gone.png")).toMatch(/has no file in the project/)
    expect(cantRemove(images, "src/main.tsx")).toBe(
      "src/main.tsx isn't one of the project's images. Those are the files in public/images/ and the photos layers link to."
    )
  })
})
