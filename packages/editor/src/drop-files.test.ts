import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  designOfImages,
  dropHint,
  dropLabel,
  fileBaseName,
  imageLimit,
  imageTypeOf,
  mayBeImage,
  skippedMessage,
  sortDrop
} from "./drop-files.ts"

const file = (name: string, type: string, size = 1024) => ({ name, type, size })
const image = (id: string): DesignNode => ({ type: "image", id, src: `/images/${id}.png`, style: { width: 80 } })

describe("which dropped files are taken", () => {
  it("takes PNG, JPEG, GIF, WebP and SVG by their media type", () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]) {
      expect(imageTypeOf(file("picture", type))).toBe(type)
    }
  })

  it("leaves out other types, images included, whatever the file is called", () => {
    expect(imageTypeOf(file("notes.txt", "text/plain"))).toBeUndefined()
    expect(imageTypeOf(file("scan.tiff", "image/tiff"))).toBeUndefined()
    expect(imageTypeOf(file("photo.heic", "image/heic"))).toBeUndefined()
    expect(imageTypeOf(file("looks.png", "application/pdf"))).toBeUndefined()
  })

  it("goes by the extension when the system gives a file no type", () => {
    expect(imageTypeOf(file("logo.SVG", ""))).toBe("image/svg+xml")
    expect(imageTypeOf(file("photo.jpeg", ""))).toBe("image/jpeg")
    expect(imageTypeOf(file("photo.jpg", ""))).toBe("image/jpeg")
    expect(imageTypeOf(file("anim.gif", ""))).toBe("image/gif")
    expect(imageTypeOf(file("hero.webp", ""))).toBe("image/webp")
    expect(imageTypeOf(file("shot.png", ""))).toBe("image/png")
    expect(imageTypeOf(file("archive.zip", ""))).toBeUndefined()
    expect(imageTypeOf(file("README", ""))).toBeUndefined()
    // An extension is the name's last part, not one in a folder name.
    expect(imageTypeOf(file("png", ""))).toBeUndefined()
  })

  it("counts a dragged file as a possible image before its name is known, unless its type rules it out", () => {
    expect(mayBeImage("image/png")).toBe(true)
    expect(mayBeImage("image/svg+xml")).toBe(true)
    expect(mayBeImage("")).toBe(true)
    expect(mayBeImage("text/plain")).toBe(false)
    expect(mayBeImage("image/tiff")).toBe(false)
  })

  it("keeps the images in the order they came and skips the rest, by name and why", () => {
    const { images, skipped } = sortDrop([
      file("notes.txt", "text/plain"),
      file("hero.png", "image/png"),
      file("huge.png", "image/png", imageLimit + 1),
      file("logo.svg", ""),
      file("edge.jpg", "image/jpeg", imageLimit)
    ])
    expect(images).toEqual([
      { index: 1, type: "image/png" },
      { index: 3, type: "image/svg+xml" },
      { index: 4, type: "image/jpeg" }
    ])
    expect(skipped).toEqual([
      { name: "notes.txt", reason: "type" },
      { name: "huge.png", reason: "size" }
    ])
  })
})

describe("what's said about skipped files", () => {
  it("says nothing when every file was taken", () => {
    expect(skippedMessage([])).toBeUndefined()
  })

  it("names one skipped file and says why", () => {
    expect(skippedMessage([{ name: "notes.txt", reason: "type" }])).toEqual({
      title: "Skipped notes.txt",
      description: "notes.txt isn't a PNG, JPEG, GIF, WebP or SVG image."
    })
    expect(skippedMessage([{ name: "huge.png", reason: "size" }])).toEqual({
      title: "Skipped huge.png",
      description: "huge.png is larger than 20 MB."
    })
  })

  it("lists several, by reason, and counts past five", () => {
    expect(
      skippedMessage([
        { name: "a.txt", reason: "type" },
        { name: "b.pdf", reason: "type" },
        { name: "huge.png", reason: "size" }
      ])
    ).toEqual({
      title: "Skipped 3 files",
      description: "a.txt and b.pdf aren't PNG, JPEG, GIF, WebP or SVG images. huge.png is larger than 20 MB."
    })
    const many = ["1", "2", "3", "4", "5", "6"].map((name) => ({ name: `${name}.txt`, reason: "type" as const }))
    expect(skippedMessage(many)?.description).toBe(
      "1.txt, 2.txt, 3.txt, 4.txt and 2 more aren't PNG, JPEG, GIF, WebP or SVG images."
    )
  })
})

describe("what a drop says and is called", () => {
  it("says beside the pointer what a drop there does", () => {
    expect(dropHint(1, "layout")).toBe("Add the image here")
    expect(dropHint(2, "layout")).toBe("Add 2 images here")
    expect(dropHint(1, "canvas")).toBe("New design with the image")
    expect(dropHint(3, "canvas")).toBe("New design with 3 images")
    expect(dropHint(1, "none")).toBe("Drop onto a layout, or onto the empty canvas")
    expect(dropHint(0, "layout")).toBe("Only PNG, JPEG, GIF, WebP or SVG images can be dropped")
  })

  it("labels the undo step by how many images it adds", () => {
    expect(dropLabel(1)).toBe("Drop image")
    expect(dropLabel(2)).toBe("Drop 2 images")
  })

  it("names an image by its file without the extension", () => {
    expect(fileBaseName("hero banner.png")).toBe("hero banner")
    expect(fileBaseName("logo.final.svg")).toBe("logo.final")
    expect(fileBaseName("README")).toBe("README")
    expect(fileBaseName(".png")).toBe(".png")
  })
})

describe("a new design of dropped images", () => {
  it("puts the images side by side in a row that wraps, at the drop point, named after the file", () => {
    const design = designOfImages([image("a")], ["Hero banner.png"], ["dashboard"], { x: 120, y: -40 })
    expect(design).toMatchObject({
      id: "hero-banner",
      name: "Hero banner",
      position: { x: 120, y: -40 },
      root: { type: "layout", style: { direction: "row", wrap: true, align: "start", padding: 6, gap: 4 } },
      states: [{ id: "default", name: "Default" }]
    })
  })

  it("is called Images with several, takes a free id, and gives the images fresh ids in order", () => {
    const design = designOfImages([image("a"), image("b")], ["a.png", "b.svg"], ["images"], { x: 0, y: 0 })
    expect(design.name).toBe("Images")
    expect(design.id).toBe("images-2")
    const root = design.root
    if (root.type !== "layout") throw new Error("The root should be a layout")
    expect(root.children.map((child) => child.type === "image" && child.src)).toEqual([
      "/images/a.png",
      "/images/b.png"
    ])
    const ids = root.children.map((child) => child.id)
    expect(ids).not.toContain("a")
    expect(new Set([root.id, ...ids]).size).toBe(3)
  })
})
