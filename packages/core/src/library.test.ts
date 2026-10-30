import { describe, expect, it } from "vite-plus/test"
import { deviceForWidth, lengthToPixels } from "./devices.ts"
import type { ContainerSpec } from "./document.ts"
import { detachInstance } from "./instances.ts"
import { libraryCanvas, libraryDesigns, libraryId, parseLibraryManifest, withLibraryCanvas } from "./library.ts"
import { componentLibrary, resolveDesign } from "./render.ts"

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

describe("libraryId", () => {
  it("is the manifest's id, else the package's name without its scope", () => {
    expect(libraryId({ id: "nova" }, "@buildkitgg/shadcn-baseui-nova")).toBe("nova")
    expect(libraryId({}, "@acme/charts-kit")).toBe("charts-kit")
    expect(libraryId({}, "charts-kit")).toBe("charts-kit")
  })
})

describe("libraryDesigns", () => {
  const settingsRow: ContainerSpec = {
    id: "settings-row",
    name: "Settings row",
    kind: "component",
    position: { x: 0, y: 0 },
    params: { label: { type: "text", default: "Notifications" } },
    root: {
      type: "layout",
      id: "row",
      children: [
        { type: "text", id: "label", text: "Label", bind: { text: "label" } },
        { type: "component", id: "switch", component: "nova/Switch" }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  }
  const settingsList: ContainerSpec = {
    id: "settings-list",
    name: "Settings list",
    kind: "component",
    position: { x: 0, y: 200 },
    root: {
      type: "component",
      id: "card",
      component: "nova/Card",
      slots: { children: [{ type: "instance", id: "first", design: "settings-row", args: { label: "Email" } }] }
    },
    states: [{ id: "default", name: "Default" }]
  }
  const screen: ContainerSpec = {
    id: "showcase",
    name: "Showcase",
    position: { x: 600, y: 0 },
    root: { type: "instance", id: "list", design: "settings-list" },
    states: []
  }
  const manifest = { canvas: { version: 3 as const, containers: [settingsRow, settingsList, screen] } }

  it("names a library's component designs by the library, with their instances following, and leaves out screens", () => {
    const designs = libraryDesigns(manifest, "nova")
    expect(designs.map((design) => design.id)).toEqual(["nova/settings-row", "nova/settings-list"])
    expect(designs[1]?.root).toEqual({
      ...settingsList.root,
      slots: { children: [{ type: "instance", id: "first", design: "nova/settings-row", args: { label: "Email" } }] }
    })
    expect(libraryDesigns({}, "nova")).toEqual([])
  })

  it("renders where an app places one, linked or detached", () => {
    const library = componentLibrary(libraryDesigns(manifest, "nova"))
    const page: ContainerSpec = {
      id: "settings",
      name: "Settings",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "page", children: [{ type: "instance", id: "row", design: "nova/settings-row" }] },
      states: []
    }
    const linked = resolveDesign(page.root, undefined, "desktop", library)
    expect(JSON.stringify(linked)).toContain('"component":"nova/Switch"')
    expect(JSON.stringify(linked)).toContain("Notifications")

    const copy = detachInstance(page, "row", library)
    const root = copy.root.type === "layout" ? copy.root.children[0] : undefined
    expect(root).toMatchObject({ type: "layout", id: "row", name: "Settings row" })
    expect(JSON.stringify(copy)).not.toContain("nova/settings-row")
    const detached = JSON.stringify(resolveDesign(copy.root, undefined, "desktop"))
    expect(detached).toContain('"component":"nova/Switch"')
    expect(detached).toContain("Notifications")
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
