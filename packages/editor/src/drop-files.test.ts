import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  countMedia,
  designOfMedia,
  dropHint,
  dropLabel,
  fileBaseName,
  imageLimit,
  mayBeMedia,
  mediaTypeOf,
  skippedMessage,
  sortDrop,
  videoLimit
} from "./drop-files.ts"

const file = (name: string, type: string, size = 1024) => ({ name, type, size })

const image = (id: string): DesignNode => ({
  type: "image",
  id,
  src: `/images/${id}.png`,
  style: { width: { step: 80 } }
})

const video = (id: string): DesignNode => ({
  type: "video",
  id,
  src: `/videos/${id}.mp4`,
  style: { width: { step: 80 } }
})

const takenTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "video/mp4", "video/webm"]

describe("which dropped files are taken", () => {
  it("takes PNG, JPEG, GIF, WebP and SVG, and MP4 and WebM videos, by their media type", () => {
    for (const type of takenTypes) {
      expect(mediaTypeOf(file("picture", type))).toBe(type)
    }
  })

  it("leaves out other types, images included, whatever the file is called", () => {
    expect(mediaTypeOf(file("notes.txt", "text/plain"))).toBeUndefined()
    expect(mediaTypeOf(file("scan.tiff", "image/tiff"))).toBeUndefined()
    expect(mediaTypeOf(file("photo.heic", "image/heic"))).toBeUndefined()
    expect(mediaTypeOf(file("looks.png", "application/pdf"))).toBeUndefined()
    expect(mediaTypeOf(file("clip.mov", "video/quicktime"))).toBeUndefined()
  })

  it("goes by the extension when the system gives a file no type", () => {
    expect(mediaTypeOf(file("logo.SVG", ""))).toBe("image/svg+xml")
    expect(mediaTypeOf(file("photo.jpeg", ""))).toBe("image/jpeg")
    expect(mediaTypeOf(file("photo.jpg", ""))).toBe("image/jpeg")
    expect(mediaTypeOf(file("anim.gif", ""))).toBe("image/gif")
    expect(mediaTypeOf(file("hero.webp", ""))).toBe("image/webp")
    expect(mediaTypeOf(file("shot.png", ""))).toBe("image/png")
    expect(mediaTypeOf(file("waves.MP4", ""))).toBe("video/mp4")
    expect(mediaTypeOf(file("loop.webm", ""))).toBe("video/webm")
    expect(mediaTypeOf(file("archive.zip", ""))).toBeUndefined()
    expect(mediaTypeOf(file("README", ""))).toBeUndefined()
    // An extension is the name's last part, not one in a folder name.
    expect(mediaTypeOf(file("png", ""))).toBeUndefined()
  })

  it("says what a dragged file may be before its name is known, a picture when it has no type", () => {
    expect(mayBeMedia("image/png")).toBe("image")
    expect(mayBeMedia("image/svg+xml")).toBe("image")
    expect(mayBeMedia("video/webm")).toBe("video")
    expect(mayBeMedia("")).toBe("image")
    expect(mayBeMedia("text/plain")).toBeUndefined()
    expect(mayBeMedia("image/tiff")).toBeUndefined()
    expect(countMedia(["image", "video", undefined, "video"])).toEqual({ images: 1, videos: 2 })
  })

  it("keeps the files in the order they came and skips the rest, by name and why, a video up to its own limit", () => {
    const { taken, skipped } = sortDrop([
      file("notes.txt", "text/plain"),
      file("hero.png", "image/png"),
      file("huge.png", "image/png", imageLimit + 1),
      file("logo.svg", ""),
      file("edge.jpg", "image/jpeg", imageLimit),
      file("waves.mp4", "video/mp4", imageLimit + 1),
      file("film.webm", "video/webm", videoLimit + 1)
    ])

    expect(taken).toEqual([
      { index: 1, type: "image/png", medium: "image" },
      { index: 3, type: "image/svg+xml", medium: "image" },
      { index: 4, type: "image/jpeg", medium: "image" },
      { index: 5, type: "video/mp4", medium: "video" }
    ])
    expect(skipped).toEqual([
      { name: "notes.txt", reason: "type" },
      { name: "huge.png", reason: "size", limit: imageLimit },
      { name: "film.webm", reason: "size", limit: videoLimit }
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
      description: "notes.txt isn't a PNG, JPEG, GIF, WebP, SVG, MP4 or WebM file."
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
        { name: "huge.png", reason: "size" },
        { name: "film.webm", reason: "size", limit: videoLimit }
      ])
    ).toEqual({
      title: "Skipped 4 files",
      description:
        "a.txt and b.pdf aren't PNG, JPEG, GIF, WebP, SVG, MP4 or WebM files. huge.png is larger than 20 MB. film.webm is larger than 100 MB."
    })
    const many = ["1", "2", "3", "4", "5", "6"].map((name) => ({ name: `${name}.txt`, reason: "type" as const }))
    expect(skippedMessage(many)?.description).toBe(
      "1.txt, 2.txt, 3.txt, 4.txt and 2 more aren't PNG, JPEG, GIF, WebP, SVG, MP4 or WebM files."
    )
  })
})

describe("what a drop says and is called", () => {
  it("says beside the pointer what a drop there does", () => {
    expect(dropHint({ images: 1, videos: 0 }, "layout")).toBe("Add the image here")
    expect(dropHint({ images: 2, videos: 0 }, "layout")).toBe("Add 2 images here")
    expect(dropHint({ images: 0, videos: 1 }, "layout")).toBe("Add the video here")
    expect(dropHint({ images: 1, videos: 0 }, "canvas")).toBe("New frame with the image")
    expect(dropHint({ images: 0, videos: 3 }, "canvas")).toBe("New frame with 3 videos")
    expect(dropHint({ images: 2, videos: 1 }, "canvas")).toBe("New frame with 3 files")
    expect(dropHint({ images: 1, videos: 0 }, "none")).toBe("Drop onto a layout, or onto the empty canvas")
    expect(dropHint({ images: 0, videos: 0 }, "layout")).toBe(
      "Only PNG, JPEG, GIF, WebP, SVG, MP4 or WebM files can be dropped"
    )
  })

  it("labels the undo step by how many images and videos it adds", () => {
    expect(dropLabel({ images: 1, videos: 0 })).toBe("Drop image")
    expect(dropLabel({ images: 2, videos: 0 })).toBe("Drop 2 images")
    expect(dropLabel({ images: 0, videos: 1 })).toBe("Drop video")
    expect(dropLabel({ images: 1, videos: 1 })).toBe("Drop 2 files")
  })

  it("names an image by its file without the extension", () => {
    expect(fileBaseName("hero banner.png")).toBe("hero banner")
    expect(fileBaseName("logo.final.svg")).toBe("logo.final")
    expect(fileBaseName("README")).toBe("README")
    expect(fileBaseName(".png")).toBe(".png")
  })
})

describe("a new design of dropped images", () => {
  it("puts the images side by side in a frame that hugs them, at the drop point, named after the file", () => {
    const design = designOfMedia([image("a")], ["Hero banner.png"], ["dashboard"], { x: 120, y: -40 })
    expect(design).toMatchObject({
      id: "hero-banner",
      name: "Hero banner",
      kind: "frame",
      position: { x: 120, y: -40 },
      root: {
        type: "layout",
        style: {
          flexDirection: "row",
          alignItems: "start",
          padding: { step: 6 },
          gap: { step: 4 },
          width: { size: "hug" }
        }
      },
      states: [{ id: "default", name: "Default" }]
    })
  })

  it("is called Images with several, takes a free id, and gives the images fresh ids in order", () => {
    const design = designOfMedia([image("a"), image("b")], ["a.png", "b.svg"], ["images"], { x: 0, y: 0 })
    expect(design.name).toBe("Images")
    expect(design.id).toBe("images-2")
    const root = design.root

    if (root.type !== "layout") {
      throw new Error("The root should be a layout")
    }

    expect(root.children.map((child) => child.type === "image" && child.src)).toEqual([
      "/images/a.png",
      "/images/b.png"
    ])
    const ids = root.children.map((child) => child.id)
    expect(ids).not.toContain("a")
    expect(new Set([root.id, ...ids]).size).toBe(3)
  })

  it("is called Videos with several videos, and Media with some of each", () => {
    expect(designOfMedia([video("a"), video("b")], ["a.mp4", "b.mp4"], [], { x: 0, y: 0 }).name).toBe("Videos")
    expect(designOfMedia([image("a"), video("b")], ["a.png", "b.mp4"], [], { x: 0, y: 0 }).name).toBe("Media")
  })
})
