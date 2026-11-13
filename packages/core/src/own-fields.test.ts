import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec } from "./document.ts"
import { findNode } from "./edit.ts"
import { setOwnFields } from "./own-fields.ts"

const design: ContainerSpec = {
  id: "story",
  name: "Story",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    children: [
      { type: "text", id: "title", name: "Title", text: "Hello", tag: "h1" },
      { type: "image", id: "photo", src: "/images/beach.jpg", alt: "A beach", fit: "contain" },
      { type: "video", id: "clip", src: "/videos/waves.mp4", controls: true },
      { type: "component", id: "button", component: "Button" },
      {
        type: "instance",
        id: "card",
        design: "card",
        slots: {
          media: [{ type: "image", id: "cover", src: "/images/cover.jpg" }],
          body: [{ type: "text", id: "lead", text: "Lead" }]
        }
      }
    ]
  }
}

const node = (container: ContainerSpec, id: string) => findNode(container.root, id)

describe("setting a node's own fields", () => {
  it("renames a layer, and an empty or null name takes it away", () => {
    expect(node(setOwnFields(design, "title", { name: "Heading" }), "title")?.name).toBe("Heading")
    expect(node(setOwnFields(design, "title", { name: "" }), "title")).not.toHaveProperty("name")
    expect(node(setOwnFields(design, "title", { name: null }), "title")).not.toHaveProperty("name")
  })

  it("changes a text's tag, and null takes it back to a paragraph", () => {
    expect(node(setOwnFields(design, "title", { tag: "h2" }), "title")).toMatchObject({
      tag: "h2"
    })
    expect(node(setOwnFields(design, "title", { tag: null }), "title")).not.toHaveProperty("tag")
  })

  it("sets an image's file and alt text, and empty alt text takes it away", () => {
    const changed = setOwnFields(design, "photo", { src: "/images/hill.jpg", alt: "A hill" })

    expect(node(changed, "photo")).toMatchObject({
      src: "/images/hill.jpg",
      alt: "A hill",
      fit: "contain"
    })
    expect(node(setOwnFields(design, "photo", { alt: "" }), "photo")).not.toHaveProperty("alt")
  })

  it("turns a video's controls off by taking them away", () => {
    expect(node(setOwnFields(design, "clip", { controls: false }), "clip")).not.toHaveProperty("controls")
  })

  it("renames a code component's component", () => {
    expect(node(setOwnFields(design, "button", { component: "IconButton" }), "button")).toMatchObject({
      component: "IconButton"
    })
  })

  it("sets the fields of layers an instance fills its slots with", () => {
    const renamed = setOwnFields(design, "lead", { name: "Lead paragraph", tag: "p" })
    const pictured = setOwnFields(renamed, "cover", { src: "/images/sea.jpg", alt: "The sea" })

    expect(node(pictured, "lead")).toMatchObject({ name: "Lead paragraph", tag: "p" })
    expect(node(pictured, "cover")).toMatchObject({ src: "/images/sea.jpg", alt: "The sea" })
    expect(node(pictured, "photo")).toBe(node(design, "photo"))
  })

  it("gives back the same design when nothing changes", () => {
    expect(setOwnFields(design, "title", { name: "Title", tag: "h1" })).toBe(design)
    expect(setOwnFields(design, "photo", { alt: undefined })).toBe(design)
    expect(setOwnFields(design, "clip", { alt: null })).toBe(design)
  })

  it("refuses a field the node doesn't have, naming it", () => {
    const refusal = (field: string) => expect.objectContaining({ details: expect.objectContaining({ field }) })

    expect(() => setOwnFields(design, "photo", { tag: "h2" })).toThrow("Only a text has a tag")
    expect(() => setOwnFields(design, "photo", { tag: "h2" })).toThrow(refusal("tag"))
    expect(() => setOwnFields(design, "title", { src: "/images/hill.jpg" })).toThrow(refusal("src"))
    expect(() => setOwnFields(design, "photo", { controls: true })).toThrow(refusal("controls"))
    expect(() => setOwnFields(design, "title", { component: "Heading" })).toThrow(refusal("component"))
  })

  it("refuses an empty file, and a node that isn't there", () => {
    expect(() => setOwnFields(design, "photo", { src: "" })).toThrow("An image or a video needs a file")
    expect(() => setOwnFields(design, "missing", { name: "Gone" })).toThrow('No node "missing" in Story')
  })
})
