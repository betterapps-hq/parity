import { newestEntries, registryCatalog } from "@parity-app/registry"
import { describe, expect, it } from "vite-plus/test"
import { familiesOf, libraryPreview } from "./library-preview.ts"

describe("libraryPreview", () => {
  it("reads a registry file's tokens with their kinds and themes, its components by family, and its breakpoints", async () => {
    const mantine = await libraryPreview("@mantine/core")

    expect(mantine?.themes).toEqual(["default", "dark"])
    expect(mantine?.breakpoints.map((breakpoint) => breakpoint.width)).toEqual([576, 768, 992, 1200, 1408])
    expect(mantine?.families.find((family) => family.name === "Accordion")?.count).toBeGreaterThan(1)
    expect(mantine?.tokens.find((token) => token.name === "mantine-radius-default")).toMatchObject({ kind: "radius" })
    // Its primary color is a reference to another of its tokens, resolved to the color itself.
    expect(mantine?.tokens.find((token) => token.name === "mantine-primary-color-filled")?.values.default).toMatch(/^#/)
  })

  it("has every token the catalog draws each offered library's look with", async () => {
    const entries = await newestEntries()

    for (const library of await registryCatalog()) {
      const packageName =
        library.preview?.replace("{style}", "nova") ??
        entries.find((entry) => entry.manifest.id === library.id)?.manifest.package?.name

      const names = new Set((await libraryPreview(packageName!))?.tokens.map((token) => token.name))

      expect({ [library.id]: Object.values(library.look).filter((name) => !names.has(name)) }).toEqual({
        [library.id]: []
      })
    }
  })

  it("has nothing for a package without a file", async () => {
    expect(await libraryPreview("left-pad")).toBeUndefined()
  })
})

describe("familiesOf", () => {
  const component = { as: "function" } as const

  it("groups by the family a file names, then by namespace, then by the shortest component a name starts with", () => {
    expect(
      familiesOf({
        Accordion: component,
        AccordionItem: component,
        "Dialog.Root": component,
        "Dialog.Title": component,
        CardHeader: { ...component, group: "Card" },
        Button: component,
        ButtonGroup: component
      })
    ).toEqual([
      { name: "Accordion", count: 2 },
      { name: "Button", count: 2 },
      { name: "Card", count: 1 },
      { name: "Dialog", count: 2 }
    ])
  })
})
