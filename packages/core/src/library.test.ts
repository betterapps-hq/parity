import { describe, expect, it } from "vite-plus/test"
import { deviceForWidth, lengthToPixels } from "./devices.ts"
import type { ContainerSpec } from "./document.ts"
import { detachInstance } from "./instances.ts"
import {
  applyLibraryEdits,
  isSampleRender,
  libraryImports,
  parseLibraryEdits,
  remapLibraryImports,
  libraryCanvas,
  libraryDesigns,
  libraryId,
  parseLibraryManifest,
  withLibraryCanvas
} from "./library.ts"
import { componentLibrary, resolveDesign } from "./render.ts"

describe("parseLibraryManifest", () => {
  it("reads a library's name, styles and breakpoints, smallest first", () => {
    const manifest = parseLibraryManifest({
      version: 3,
      id: "nova",
      name: "Shadcn Nova",
      styles: "tailwind.css",
      breakpoints: [
        { id: "lg", name: "Large", width: 1024 },
        { id: "sm", name: "Small", width: 640 }
      ]
    })
    expect(manifest).toEqual({
      version: 3,
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
    expect(() => parseLibraryManifest({ version: 3, name: "x", colours: [] })).toThrow(/colours/)
    expect(() => parseLibraryManifest({ version: 3 })).toThrow(/name/)
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
    const manifest = parseLibraryManifest({ version: 3, name: "Nova", tokens: "tokens.resolver.json", canvas })
    expect(manifest.tokens).toBe("tokens.resolver.json")
    expect(libraryCanvas(manifest).containers[0]?.position).toEqual({ x: 120, y: 40 })
    expect(libraryCanvas(parseLibraryManifest({ version: 3, name: "Nova" }))).toEqual({ version: 3, containers: [] })
    expect(() => parseLibraryManifest({ version: 3, name: "Nova", canvas: { version: 3, containers: [{}] } })).toThrow(
      /^\/canvas\/containers\/0/
    )
  })
})

describe("withLibraryCanvas", () => {
  it("replaces only the canvas, keeping what the author wrote about the library", () => {
    const file = { $schema: "x", version: 3, name: "Nova", styles: "tailwind.css" }
    const saved = withLibraryCanvas(file, { version: 3, containers: [] })
    expect(saved).toEqual({ ...file, version: 3, canvas: { version: 3, containers: [] } })
    expect(Object.keys(saved)).toEqual(["$schema", "version", "name", "styles", "canvas"])
  })
})

describe("libraryId", () => {
  it("is the manifest's id, else the package's name without its scope", () => {
    expect(libraryId({ id: "nova" }, "@buildkitgg/shadcn-baseui-nova")).toBe("nova")
    expect(libraryId({}, "@acme/charts-kit")).toBe("charts-kit")
    expect(libraryId({}, "charts-kit")).toBe("charts-kit")
    expect(libraryId({ id: "" }, "@acme/charts-kit")).toBe("charts-kit")
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

const fluent = {
  version: 3,
  id: "fluent",
  name: "Fluent UI",
  package: { name: "@fluentui/react-components", version: "9.75.0", range: "^9.0.0" },
  components: {
    list: {
      Button: { as: "forwardRef", declaration: "dist/index.d.ts", group: "Button" },
      "Dialog.Root": { as: "function" }
    }
  },
  decorators: [
    {
      wrap: {
        import: "@fluentui/react-components",
        component: "RendererProvider",
        props: {
          renderer: {
            $call: { import: "@griffel/shadow-dom", export: "createShadowDOMRenderer" },
            args: [{ $frame: "root" }]
          }
        }
      }
    },
    {
      wrap: {
        import: "@fluentui/react-components",
        component: "FluentProvider",
        props: {
          theme: {
            $global: "theme",
            values: { dark: { $import: "@fluentui/react-components", export: "webDarkTheme" } },
            default: { $import: "@fluentui/react-components", export: "webLightTheme" }
          }
        }
      }
    },
    { when: { theme: "dark" }, style: { "color-scheme": "dark" } }
  ]
}

describe("library manifest fields", () => {
  it("reads the package, components and decorators", () => {
    const manifest = parseLibraryManifest(fluent)
    expect(manifest.package).toEqual({ name: "@fluentui/react-components", version: "9.75.0", range: "^9.0.0" })
    expect(manifest.components?.list["Dialog.Root"]).toEqual({ as: "function" })
    expect(manifest.decorators).toHaveLength(3)
    expect(manifest.decorators?.[2]).toEqual({ when: { theme: "dark" }, style: { "color-scheme": "dark" } })
  })

  it("reads each icon shape: one export per icon, data drawn by one component, and styles in names", () => {
    const lucide = parseLibraryManifest({ version: 3, name: "Lucide", icons: { render: "export", exclude: ["Icon"] } })
    expect(lucide.icons).toEqual({ render: "export", exclude: ["Icon"] })
    const huge = parseLibraryManifest({
      version: 3,
      name: "Hugeicons",
      icons: { render: { import: "@hugeicons/react", component: "HugeiconsIcon", prop: "icon" }, match: "Icon$" }
    })
    expect(huge.icons?.render).toEqual({ import: "@hugeicons/react", component: "HugeiconsIcon", prop: "icon" })
    const fluentIcons = parseLibraryManifest({
      version: 3,
      name: "Fluent icons",
      icons: {
        render: "export",
        variants: { pattern: "^(?<name>.+?)(?<size>\\d+)?(?<style>Regular|Filled)$", styles: ["Regular", "Filled"] }
      }
    })
    expect(new RegExp(fluentIcons.icons!.variants!.pattern!).exec("Add24Filled")?.groups).toMatchObject({
      name: "Add",
      size: "24",
      style: "Filled"
    })
    const hero = parseLibraryManifest({
      version: 3,
      name: "Heroicons",
      icons: {
        import: "@heroicons/react/24/outline",
        render: "export",
        variants: {
          modules: { "24 Outline": "@heroicons/react/24/outline", "24 Solid": "@heroicons/react/24/solid" },
          default: { style: "24 Outline" }
        }
      }
    })
    expect(hero.icons?.variants?.modules?.["24 Solid"]).toBe("@heroicons/react/24/solid")
    expect(() =>
      parseLibraryManifest({ version: 3, name: "x", icons: { render: "export", variants: { modules: { Solid: 1 } } } })
    ).toThrow(/\/icons\/variants\/modules\/Solid/)
  })

  it("reads the tags an icon set's metadata gives, with where they came from", () => {
    const lucide = parseLibraryManifest({
      version: 3,
      name: "Lucide",
      icons: { render: "export", tags: { Settings: ["cog", "gear"] }, tagSource: "lucide-static@1.63.0/tags.json" }
    })
    expect(lucide.icons?.tags).toEqual({ Settings: ["cog", "gear"] })
    expect(lucide.icons?.tagSource).toBe("lucide-static@1.63.0/tags.json")
    expect(() =>
      parseLibraryManifest({ version: 3, name: "x", icons: { render: "export", tags: { Settings: "gear" } } })
    ).toThrow(/\/icons\/tags\/Settings/)
  })

  it("reads the names an icon set prefers to insert", () => {
    const phosphor = parseLibraryManifest({
      version: 3,
      name: "Phosphor",
      icons: { render: "export", prefer: ["GearIcon"] }
    })
    expect(phosphor.icons?.prefer).toEqual(["GearIcon"])
    expect(() => parseLibraryManifest({ version: 3, name: "x", icons: { render: "export", prefer: [1] } })).toThrow(
      /\/icons\/prefer\/0/
    )
  })

  it("says where a decorator or icon set is wrong", () => {
    expect(() => parseLibraryManifest({ version: 3, name: "x", decorators: [{ when: { theme: "dark" } }] })).toThrow(
      /^\/decorators\/0: expected one of wrap/
    )
    expect(() => parseLibraryManifest({ version: 3, name: "x", decorators: [{ wrap: { component: "A" } }] })).toThrow(
      /\/decorators\/0\/wrap\/import/
    )
    expect(() => parseLibraryManifest({ version: 3, name: "x", icons: { render: "export", match: "(" } })).toThrow(
      /\/icons\/match: expected a regular expression/
    )
    expect(() => parseLibraryManifest({ version: 3, name: "x", components: { list: { A: { as: "guess" } } } })).toThrow(
      /\/components\/list\/A\/as/
    )
  })

  it("rejects obsolete manifest formats instead of keeping compatibility paths", () => {
    for (const version of [1, 2]) {
      expect(() => parseLibraryManifest({ version, name: "Nova" })).toThrow("/version: expected 3")
      expect(() => withLibraryCanvas({ version, name: "Nova" }, { version: 3, containers: [] })).toThrow(
        "/version: expected 3"
      )
    }
    expect(withLibraryCanvas(fluent, { version: 3, containers: [] }).version).toBe(3)
  })

  it("lists the modules its decorators and icon renderer import", () => {
    expect(libraryImports(parseLibraryManifest(fluent)).sort()).toEqual([
      "@fluentui/react-components",
      "@griffel/shadow-dom"
    ])
  })

  it("collects only bootstrap imports when passed a full library object", () => {
    const library = {
      decorators: [{ wrap: { import: "bootstrap-provider", component: "Provider" } }],
      designs: [{ root: { props: { value: { $import: "lazy-design-module", export: "value" } } } }]
    }
    expect(libraryImports(library)).toEqual(["bootstrap-provider"])
  })

  it("collects and rewrites the same specifiers, wherever a value nests them", () => {
    const manifest = {
      decorators: [
        {
          wrap: {
            import: "@real/pkg",
            component: "Provider",
            props: {
              theme: { $import: "@real/pkg", export: "theme" },
              made: {
                $call: { import: "@real/pkg", export: "make" },
                args: [{ $call: { import: "@real/pkg/extra", export: "node" } }]
              }
            }
          }
        }
      ],
      icons: {
        import: "@real/pkg/icons",
        render: { import: "@real/pkg/renderer", component: "Icon", prop: "icon" },
        variants: { modules: { Solid: "@real/pkg/solid" } }
      }
    }
    const aliased = (specifier: string) => specifier.replace(/^@real\/pkg/, "@alias/pkg")
    expect(libraryImports(manifest).sort()).toEqual([
      "@real/pkg",
      "@real/pkg/extra",
      "@real/pkg/icons",
      "@real/pkg/renderer",
      "@real/pkg/solid"
    ])
    expect(remapLibraryImports(manifest, aliased)).toEqual({
      decorators: [
        {
          wrap: {
            import: "@alias/pkg",
            component: "Provider",
            props: {
              theme: { $import: "@alias/pkg", export: "theme" },
              made: {
                $call: { import: "@alias/pkg", export: "make" },
                args: [{ $call: { import: "@alias/pkg/extra", export: "node" } }]
              }
            }
          }
        }
      ],
      icons: {
        import: "@alias/pkg/icons",
        render: { import: "@alias/pkg/renderer", component: "Icon", prop: "icon" },
        variants: { modules: { Solid: "@alias/pkg/solid" } }
      }
    })
    // Collecting after rewriting finds the same specifiers, renamed: the two walks can't disagree.
    expect(libraryImports(remapLibraryImports(manifest, aliased)).sort()).toEqual(
      libraryImports(manifest).sort().map(aliased)
    )
    // Ordinary component data is not a module reference, even when its keys look like manifest fields.
    const data = {
      decorators: [
        {
          wrap: {
            import: "@real/pkg",
            component: "Provider",
            props: {
              import: "@real/pkg",
              modules: { Solid: "@real/pkg/solid" },
              nested: { import: "@real/pkg", export: "data" }
            }
          }
        }
      ]
    }
    expect(remapLibraryImports(data, aliased).decorators[0]?.wrap.props).toEqual(data.decorators[0]?.wrap.props)
    expect(libraryImports(data)).toEqual(["@real/pkg"])
  })
})

describe("imports in library designs and samples", () => {
  it("rewrites reserved values inside component samples and the library canvas without changing literal data", () => {
    const manifest = {
      components: {
        import: "real",
        list: {
          Button: {
            as: "function" as const,
            sample: {
              props: {
                data: { import: "real" },
                value: {
                  $call: { import: "real/values", export: "make" },
                  args: [{ $import: "real", export: "theme" }]
                }
              }
            }
          }
        }
      },
      canvas: {
        version: 3 as const,
        containers: [
          {
            id: "button",
            name: "Button",
            position: { x: 0, y: 0 },
            states: [],
            root: {
              type: "component" as const,
              id: "root",
              component: "kit/Button",
              props: { theme: { $import: "real", export: "theme" } }
            }
          }
        ]
      }
    }
    const mapped = remapLibraryImports(manifest, (name) =>
      name === "real" ? "alias" : name.replace(/^real\//, "alias/")
    )
    expect(mapped.components.import).toBe("alias")
    expect(mapped.components.list.Button.sample.props).toEqual({
      data: { import: "real" },
      value: {
        $call: { import: "alias/values", export: "make" },
        args: [{ $import: "alias", export: "theme" }]
      }
    })
    expect(mapped.canvas.containers[0]?.root.props.theme).toEqual({ $import: "alias", export: "theme" })
    expect(manifest.components.import).toBe("real")
  })
})

describe("parts, samples and hand edits", () => {
  const generated = parseLibraryManifest({
    version: 3,
    name: "Demo",
    edits: "demo.edits.json",
    components: {
      list: {
        Menu: { as: "function", sample: { children: [{ component: "MenuItem", children: ["Open"] }] } },
        MenuItem: {
          as: "forwardRef",
          parents: ["Menu"],
          parentsFrom: "error",
          optionalParents: ["Menu"],
          fingerprint: "1a2b3c4d",
          props: { "inset?": "aa11bb" }
        },
        MenuContext: { as: "exotic", visual: false }
      }
    }
  })

  it("reads each part's parents, the signal that placed it, its sample and its fingerprint", () => {
    expect(generated.edits).toBe("demo.edits.json")
    expect(generated.components?.list.MenuItem).toMatchObject({
      parents: ["Menu"],
      parentsFrom: "error",
      optionalParents: ["Menu"],
      fingerprint: "1a2b3c4d"
    })
    expect(() =>
      parseLibraryManifest({
        version: 3,
        name: "x",
        components: { list: { A: { as: "function", parentsFrom: "guess" } } }
      })
    ).toThrow(/\/components\/list\/A\/parentsFrom/)
  })

  it("reads render functions in samples", () => {
    const manifest = parseLibraryManifest({
      version: 3,
      name: "x",
      components: {
        list: {
          DateInput: {
            as: "function",
            sample: { children: [{ $render: [{ component: "DateSegment" }], pass: ["segment"] }] }
          }
        }
      }
    })
    const child = manifest.components?.list.DateInput?.sample?.children?.[0]
    expect(isSampleRender(child) && child.pass).toEqual(["segment"])
    expect(() =>
      parseLibraryManifest({
        version: 3,
        name: "x",
        components: { list: { A: { as: "function", sample: { children: [{ $render: [], spread: false }] } } } }
      })
    ).toThrow(/\/sample\/children\/0\/spread/)
  })

  it("merges edits over what was generated, marks edited parents, and reports edits whose export has gone", () => {
    const edits = parseLibraryEdits({
      components: {
        MenuItem: { parents: ["Menu", "MenuContent"] },
        MenuContext: false,
        Gone: { visual: false },
        Added: { as: "function", group: "Menu" }
      }
    })
    const { manifest, orphans } = applyLibraryEdits(generated, edits)
    expect(manifest.components?.list.MenuItem).toMatchObject({
      parents: ["Menu", "MenuContent"],
      parentsFrom: "edit",
      fingerprint: "1a2b3c4d"
    })
    // Edited parents replace which generated ones were optional too.
    expect(manifest.components?.list.MenuItem?.optionalParents).toBeUndefined()
    expect(manifest.components?.list.MenuContext).toBeUndefined()
    expect(manifest.components?.list.Added).toEqual({ as: "function", group: "Menu" })
    expect(orphans).toEqual(["Gone"])
  })
})
