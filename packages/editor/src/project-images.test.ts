import type { CanvasDocument, ContainerSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  cantRemove,
  codeFilesUsing,
  codeReferences,
  designsUsing,
  filterImages,
  findImage,
  findUses,
  imageItem,
  keepImageDetails,
  mediumOf,
  projectImages,
  removalOf,
  usesOnCard
} from "./project-images.ts"

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
  root: { type: "image", id: "banner", src: "/images/hero.png" }
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

  it("finds an image a layer's fill paints, in the design and in a state, so it isn't counted unused (PAR-931)", () => {
    const filled: ContainerSpec = {
      id: "hero",
      name: "Hero",
      position: { x: 0, y: 0 },
      root: {
        type: "layout",
        id: "banner",
        style: {
          background: [
            { kind: "image", src: "/images/team.png", fit: "fill" },
            { kind: "solid", color: "muted" }
          ]
        },
        children: []
      },
      states: [
        { id: "default", name: "Default" },
        {
          id: "night",
          name: "Night",
          overrides: { banner: { style: { background: [{ kind: "image", src: "/images/night.png", fit: "tile" }] } } }
        }
      ]
    }

    const found = projectImages({
      files: [{ path: "public/images/team.png", bytes: 10 }],
      references: [],
      documents: [{ path: "app.par", document: { version: 3, containers: [filled] } }]
    })

    expect(found.map((image) => [image.src, image.kind, image.usedBy.map((use) => use.node)])).toEqual([
      ["/images/team.png", "file", ["banner"]],
      ["/images/night.png", "missing", ["banner"]]
    ])
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

  it("credits a file with what the project kept as it was added, before any layer's", () => {
    const kept = { name: "Lena Ray", url: "https://pixabay.com/users/lena", source: "Pixabay" }

    const withDetails = projectImages({
      files,
      references: [],
      documents: [
        {
          path: "app.par",
          document: { ...document, images: { "public/images/unused.webp": { alt: "Lake", credit: kept } } }
        }
      ]
    })

    expect(findImage(withDetails, "unused.webp")).toMatchObject({ alt: "Lake", credit: kept })
    expect(filterImages(withDetails, { search: "lake" }).map(({ name }) => name)).toEqual(["unused.webp"])
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
      "src/main.tsx isn't one of the project's images or videos. Those are the files in public/images/ and public/videos/, and the photos layers link to."
    )
  })
})

describe("mediumOf", () => {
  it("tells a vector from an image by its file's extension, whatever follows it", () => {
    expect(mediumOf({ src: "/images/logo.svg" })).toBe("vector")
    expect(mediumOf({ src: "/images/logo.SVG?v=2" })).toBe("vector")
    expect(mediumOf({ src: "/images/hero.png" })).toBe("image")
    expect(mediumOf({ src: "https://images.example.com/svg-of-a-cat.jpg" })).toBe("image")
  })

  it("tells a video by its file's extension", () => {
    expect(mediumOf({ src: "/videos/waves.mp4" })).toBe("video")
    expect(mediumOf({ src: "/videos/loop.WEBM?v=2" })).toBe("video")
    expect(mediumOf({ src: "/images/mp4-poster.png" })).toBe("image")
  })
})

describe("a project's videos (PAR-841)", () => {
  const clip: ContainerSpec = {
    id: "landing",
    name: "Landing",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [
        { type: "video", id: "hero", src: "/videos/waves.mp4", alt: "Waves at dusk" },
        { type: "video", id: "stock", src: "https://cdn.example.com/surf.webm", credit }
      ]
    }
  }

  const videos = projectImages({
    files: [
      { path: "public/videos/waves.mp4", bytes: 4_000_000 },
      { path: "public/images/hero.png", bytes: 1200 }
    ],
    references: [],
    documents: [{ path: "app.par", document: { version: 3, containers: [clip] } }]
  })

  it("lists video files under public/videos by their name there, with the layers that play them", () => {
    expect(videos.map(({ kind, name, path }) => [kind, name, path])).toEqual([
      ["file", "hero.png", "public/images/hero.png"],
      ["file", "waves.mp4", "public/videos/waves.mp4"],
      ["linked", "Video by Ada Park", undefined]
    ])
    expect(findImage(videos, "waves.mp4")?.usedBy.map(({ node }) => node)).toEqual(["hero"])
    expect(findImage(videos, "public/videos/waves.mp4")?.alt).toBe("Waves at dusk")
  })

  it("inserts a video as a video", () => {
    expect(imageItem({ src: "/videos/waves.mp4", alt: "Waves at dusk" }, { width: 1920, height: 1080 })).toEqual({
      kind: "video",
      src: "/videos/waves.mp4",
      alt: "Waves at dusk",
      width: 1920,
      height: 1080
    })
  })
})

describe("designsUsing", () => {
  const use = (design: string, node: string, document = "app.par") => ({ document, design, designName: design, node })

  it("groups an image's layers by design, the design with the most first", () => {
    const usedBy = [use("home", "logo"), use("pricing", "logo"), use("pricing", "footer-logo"), use("pricing", "badge")]

    expect(designsUsing({ usedBy })).toEqual([
      { document: "app.par", design: "pricing", name: "pricing", layers: ["logo", "footer-logo", "badge"] },
      { document: "app.par", design: "home", name: "home", layers: ["logo"] }
    ])
  })

  it("keeps designs of the same id in different files apart", () => {
    const usedBy = [use("home", "logo"), use("home", "logo", "admin.par")]

    expect(designsUsing({ usedBy }).map((design) => design.document)).toEqual(["app.par", "admin.par"])
  })

  it("has none for an image nothing uses", () => {
    expect(designsUsing({ usedBy: [] })).toEqual([])
  })
})

describe("removalOf", () => {
  const images = projectImages({
    files: [
      { path: "public/images/unused.webp", bytes: 300 },
      { path: "public/images/hero.png", bytes: 1200 },
      { path: "public/images/logo.svg", bytes: 90 }
    ],
    references: [{ image: "public/images/logo.svg", path: "src/App.tsx", line: 3 }],
    documents
  })

  const removal = (named: string) => removalOf(findImage(images, named)!)

  it("removes a file nothing uses at once", () => {
    expect(removal("unused.webp")).toBe("file")
  })

  it("removes a file designs use with the layers that show it", () => {
    expect(removal("hero.png")).toBe("file-and-layers")
  })

  it("leaves a file the project's code names", () => {
    expect(removal("logo.svg")).toBe("code")
  })

  it("removes the layers of a linked photo and of a path with no file, which have nothing to delete", () => {
    expect(removal("https://images.unsplash.com/photo-1")).toBe("layers")
    expect(removal("/images/gone.png")).toBe("layers")
  })
})

describe("imageItem", () => {
  it("inserts an image by its src at its picture's size, keeping its alt text and credit", () => {
    const item = imageItem({ src: "/images/hero.png", alt: "A desk by a window", credit }, { width: 1200, height: 800 })

    expect(item).toEqual({
      kind: "image",
      src: "/images/hero.png",
      alt: "A desk by a window",
      credit,
      width: 1200,
      height: 800
    })
  })

  it("leaves out what the image doesn't have", () => {
    expect(imageItem({ src: "/images/logo.svg" }, { width: 64, height: 64 })).toEqual({
      kind: "image",
      src: "/images/logo.svg",
      width: 64,
      height: 64
    })
  })
})

describe("where an image is used, on its card", () => {
  const use = (design: string, node: string) => ({ document: "app.par", design, designName: design, node })
  const line = (path: string, at: number) => ({ path, line: at })

  it("groups lines of code by file, in the order the files were found, each file's lines in order", () => {
    const usedInCode = [line("src/Header.tsx", 40), line("index.html", 3), line("src/Header.tsx", 12)]

    expect(codeFilesUsing({ usedInCode })).toEqual([
      { path: "src/Header.tsx", name: "Header.tsx", lines: [12, 40] },
      { path: "index.html", name: "index.html", lines: [3] }
    ])
  })

  it("names files by as many folders as tell two of the same name apart", () => {
    const usedInCode = [line("src/pages/index.tsx", 1), line("src/components/index.tsx", 2), line("index.tsx", 3)]

    expect(codeFilesUsing({ usedInCode }).map(({ name }) => name)).toEqual([
      "pages/index.tsx",
      "components/index.tsx",
      "index.tsx"
    ])
  })

  it("lists designs first and files of code in the room left", () => {
    const image = {
      usedBy: [use("home", "logo"), use("pricing", "logo")],
      usedInCode: [line("a.tsx", 1), line("b.tsx", 2), line("c.tsx", 3)]
    }

    expect(usesOnCard(image, 3)).toMatchObject({
      designs: [{ design: "home" }, { design: "pricing" }],
      files: [{ path: "a.tsx" }],
      moreDesigns: 0,
      moreFiles: 2
    })
  })

  it("lists one place past the room rather than counting it", () => {
    const usedBy = ["a", "b", "c", "d"].map((design) => use(design, "logo"))

    expect(usesOnCard({ usedBy, usedInCode: [] }, 3)).toMatchObject({ moreDesigns: 0, moreFiles: 0 })
    expect(usesOnCard({ usedBy, usedInCode: [] }, 3).designs).toHaveLength(4)
  })

  it("counts the designs and files a full card leaves out", () => {
    const usedBy = ["a", "b", "c", "d", "e"].map((design) => use(design, "logo"))
    const card = usesOnCard({ usedBy, usedInCode: [line("a.tsx", 1)] }, 3)

    expect(card.designs).toHaveLength(3)
    expect(card).toMatchObject({ files: [], moreDesigns: 2, moreFiles: 1 })
  })

  it("finds designs by name and files by path, ignoring case", () => {
    const image = {
      usedBy: [{ ...use("home", "logo"), designName: "Home mobile" }, use("pricing", "logo")],
      usedInCode: [line("src/Mobile.tsx", 1), line("src/Header.tsx", 2)]
    }

    const found = findUses(image, " MOBILE ")

    expect(found.designs.map(({ name }) => name)).toEqual(["Home mobile"])
    expect(found.files.map(({ path }) => path)).toEqual(["src/Mobile.tsx"])
  })
})

describe("keepImageDetails", () => {
  it("records what each file shows and who made it, keeping what was there", () => {
    const kept = keepImageDetails(
      { ...document, images: { "public/images/a.jpg": { alt: "A" } } },
      { "public/images/b.jpg": { alt: "B", credit } }
    )

    expect(kept.images).toEqual({ "public/images/a.jpg": { alt: "A" }, "public/images/b.jpg": { alt: "B", credit } })
    expect(kept.containers).toBe(document.containers)
  })
})
