import { describe, expect, it } from "vitest"
import {
  applyLibraryEdits,
  isSampleRender,
  libraryImports,
  parseLibraryEdits,
  parseLibraryManifest,
  withLibraryCanvas
} from "./library.ts"
import { readDesignTokens } from "./tokens-dtcg.ts"
import { describedCategories, describedTokenCss, extractTokens } from "./tokens.ts"

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

describe("parseLibraryManifest, version 3", () => {
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

  it("keeps versions 1 and 2 as they were, without version 3's fields", () => {
    expect(parseLibraryManifest({ version: 1, name: "Nova", styles: "tailwind.css" }).version).toBe(1)
    expect(() => parseLibraryManifest({ version: 2, name: "Nova", components: { list: {} } })).toThrow(/components/)
    expect(withLibraryCanvas({ version: 3, name: "Nova" }, { version: 3, containers: [] }).version).toBe(3)
    expect(withLibraryCanvas({ version: 1, name: "Nova" }, { version: 3, containers: [] }).version).toBe(2)
  })

  it("lists the modules its decorators and icon renderer import", () => {
    expect(libraryImports(parseLibraryManifest(fluent)).sort()).toEqual([
      "@fluentui/react-components",
      "@griffel/shadow-dom"
    ])
  })
})

describe("library tokens in frames", () => {
  it("declares run-time tokens before the project's styles, files them by category, and pairs line heights", async () => {
    const described = await readDesignTokens(
      {
        "font-size": {
          base300: {
            $value: "14px",
            $extensions: { parity: { var: "fontSizeBase300", lineHeight: "lineHeightBase300" } }
          }
        },
        leading: { base300: { $value: "20px", $extensions: { parity: { var: "lineHeightBase300" } } } },
        spacing: { m: { $value: "12px", $extensions: { parity: { var: "spacingHorizontalM" } } } }
      },
      async () => ({})
    )
    const css = describedTokenCss(described)
    expect(css).toContain("--fontSizeBase300--line-height: var(--lineHeightBase300);")
    // The project's own declaration, later in the stylesheet, wins over the library's.
    const tokens = extractTokens(`${css}:host { --spacingHorizontalM: 16px }`, [], describedCategories(described))
    const byName = Object.fromEntries(tokens.map((token) => [token.name, token]))
    expect(byName.spacingHorizontalM?.category).toBe("spacing")
    expect(byName.fontSizeBase300?.category).toBe("font-size")
    expect(byName.lineHeightBase300?.category).toBe("leading")
    expect(byName.spacingHorizontalM?.values.default).toBe("16px")
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
