import { realpathSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity-app/core"
import type { JsonValue } from "@parity-app/core/schema"
import { isText } from "@parity-app/core/values/evaluate"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { findLibraries, registryTokens } from "./libraries.ts"

const renderer: RendererAdapter = {
  id: "test",
  name: "Test",
  detect: () => Promise.resolve({ found: true, summary: "" }),
  guestModule: "",
  runtimePackages: [],
  runtimeImports: [],
  componentExtensions: [".tsx", ".ts"],
  findComponents: (source: string) =>
    [...source.matchAll(/export function ([A-Z]\w*)/g)].map((match) => ({
      name: match[1]!,
      export: match[1]!,
      as: "function"
    }))
}

let root: string

async function write(path: string, content: JsonValue) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), isText(content) ? content : JSON.stringify(content))
}

const component = (fields: Record<string, JsonValue> = {}) => ({ as: "function", ...fields })

beforeEach(async () => {
  // Resolved as the reader resolves links: macOS's temp folder is a link, and Windows' can be a short name (`RUNNER~1`).
  root = realpathSync.native(await mkdtemp(join(tmpdir(), "canvas-library-files-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("library files", () => {
  it("merges hand edits over what was generated, from a shared file, and reports edits for exports that have gone", async () => {
    await write("node_modules/@acme/ui/package.json", { name: "@acme/ui", version: "1.0.0", types: "index.d.ts" })
    await write("node_modules/@acme/ui/index.d.ts", "export function Menu(): unknown")
    await write("node_modules/@acme/ui/acme.lib.par", {
      version: 4,
      id: "acme",
      name: "Acme UI",
      edits: "acme.edits.json",
      components: {
        list: {
          Menu: component(),
          MenuItem: component({ parents: ["Menu"], parentsFrom: "prefix" }),
          MenuContext: component()
        }
      }
    })
    await write("node_modules/@acme/ui/acme.edits.json", {
      components: {
        MenuItem: { parents: ["Menu", "MenuContent"] },
        MenuContext: { visual: false },
        Gone: { parents: ["Menu"] }
      }
    })

    const found = await findLibraries(root, { dependencies: { "@acme/ui": "1.0.0" } }, [], renderer)
    // A part that draws nothing stays listed, so the parts placed inside it can be, and says so.
    expect(Object.keys(found.components).sort()).toEqual(["acme/Menu", "acme/MenuContext", "acme/MenuItem"])
    expect(found.components["acme/MenuContext"]?.visual).toBe(false)
    expect(found.notes).toEqual(["@acme/ui: hand edits for exports it no longer has: Gone"])
  })

  it("keeps a file made for an older version, leaving out what's gone and listing what's new by name", async () => {
    await write("node_modules/@acme/ui/package.json", { name: "@acme/ui", version: "2.1.0", types: "index.d.ts" })
    await write(
      "node_modules/@acme/ui/index.d.ts",
      "export function Button(): unknown\nexport function Chip(): unknown"
    )
    await write("registry/@acme+ui.lib.par", {
      version: 4,
      id: "acme",
      name: "Acme UI",
      package: { name: "@acme/ui", version: "1.4.0", range: "^1.0.0" },
      decorators: [{ wrap: { import: "@acme/ui", component: "Provider" } }],
      components: { list: { Button: component(), Badge: component() } }
    })

    const found = await findLibraries(root, { dependencies: { "@acme/ui": "2.1.0" } }, [], renderer, {
      registry: join(root, "registry")
    })

    expect(found.libraries[0]?.decorators).toHaveLength(1)
    expect(Object.keys(found.components).sort()).toEqual(["acme/Button", "acme/Chip"])
    expect(found.notes[0]).toMatch(
      /2\.1\.0 is newer than Parity's file for it \(1\.4\.0\): 1 new components found by name, 1 gone/
    )
  })

  it("keeps a file made for a newer version, with its decorators, for a version older than every file (PAR-1168)", async () => {
    await write("node_modules/@acme/ui/package.json", { name: "@acme/ui", version: "1.2.0", types: "index.d.ts" })
    await write(
      "node_modules/@acme/ui/index.d.ts",
      'export function Button(): unknown\nexport function Legacy(): unknown\nexport { Card } from "./card.js"'
    )
    // Made with a factory, as Mantine's are, so it's no component the renderer recognises, but it's still exported;
    // `Hidden`, beside it, isn't re-exported.
    await write(
      "node_modules/@acme/ui/card.d.ts",
      "export declare const Card: Factory<{ props: CardProps }>\nexport declare const Hidden: Factory<{ props: {} }>"
    )
    await write("registry/@acme+ui.lib.par", {
      version: 4,
      id: "acme",
      name: "Acme UI",
      package: { name: "@acme/ui", version: "2.4.0", range: "^2.0.0" },
      decorators: [{ wrap: { import: "@acme/ui", component: "Provider" } }],
      components: { list: { Button: component(), Badge: component(), Card: component(), Hidden: component() } }
    })

    const found = await findLibraries(root, { dependencies: { "@acme/ui": "1.2.0" } }, [], renderer, {
      registry: join(root, "registry")
    })

    expect(found.libraries[0]?.decorators).toHaveLength(1)
    expect(Object.keys(found.components).sort()).toEqual(["acme/Button", "acme/Card", "acme/Legacy"])
    expect(found.notes[0]).toMatch(
      /1\.2\.0 is older than Parity's file for it \(2\.4\.0\): 1 components it doesn't list found by name, 2 it doesn't have yet/
    )
  })
})

describe("libraries an extension found", () => {
  /** What the shadcn extension finds of sync's components in nova, as it reads their `manifest.json`. */
  const nova = {
    registry: "@buildkitgg/shadcn-baseui-nova",
    package: "@buildkitgg/shadcn",
    name: "Shadcn Nova",
    description: "Every shadcn component on Base UI, in the nova style.",
    styles: "tailwind.css"
  }

  /** `@buildkitgg/shadcn` as sync writes it into an app. */
  async function synced(declarations: string) {
    await write("node_modules/@buildkitgg/shadcn/package.json", {
      name: "@buildkitgg/shadcn",
      version: "0.1.4",
      types: "index.d.ts"
    })
    await write("node_modules/@buildkitgg/shadcn/index.d.ts", declarations)
  }

  /** The registry's file for Buildkit's nova kit, with tokens. */
  async function novaFile() {
    await write("registry/@buildkitgg+shadcn-baseui-nova.lib.par", {
      version: 4,
      id: "nova",
      name: "Shadcn Nova",
      package: { name: "@buildkitgg/shadcn-baseui-nova", version: "0.5.0", range: "^0.5.0" },
      styles: "tailwind.css",
      decorators: [{ wrap: { import: "@buildkitgg/shadcn-baseui-nova", component: "TooltipProvider" } }],
      tokens: { color: { primary: { $type: "color", $value: "#171717" } } },
      components: { list: { Button: component(), Sonner: component() } }
    })
  }

  const syncedApp = { dependencies: { "@buildkitgg/shadcn": "link:node_modules/.buildkit/shadcn" } }

  it("are read with their registry file, named by the package the app imports, and checked against what it exports", async () => {
    await synced("export function Button(): unknown\nexport function Attachment(): unknown")
    await novaFile()

    const found = await findLibraries(root, syncedApp, ["src/index.css"], renderer, {
      registry: join(root, "registry"),
      detected: [nova]
    })

    expect(found.libraries).toMatchObject([
      {
        id: "shadcn",
        name: "Shadcn Nova",
        package: "@buildkitgg/shadcn",
        styles: "tailwind.css",
        stylesImported: false,
        decorators: [{ wrap: { import: "@buildkitgg/shadcn", component: "TooltipProvider" } }]
      }
    ])
    // The kit's Sonner isn't generated any more, and Attachment is newer than the kit's file.
    expect(Object.keys(found.components).sort()).toEqual(["shadcn/Attachment", "shadcn/Button"])
    expect(found.components["shadcn/Button"]?.path).toBe("@buildkitgg/shadcn")
    // sync's version says nothing about the kit's, so there's no file to update.
    expect(found.notes).toEqual([])
  })

  it("with no registry file, are listed from their declarations, as the extension describes them", async () => {
    await synced("export function Button(): unknown")

    const found = await findLibraries(root, syncedApp, [], renderer, {
      registry: join(root, "registry"),
      detected: [
        {
          registry: "@buildkitgg/shadcn-aria-lyra",
          package: "@buildkitgg/shadcn",
          name: "Shadcn Lyra",
          description: "Every shadcn component on React Aria, in the lyra style."
        }
      ]
    })

    expect(found.libraries).toMatchObject([
      {
        id: "shadcn",
        name: "Shadcn Lyra",
        description: "Every shadcn component on React Aria, in the lyra style.",
        package: "@buildkitgg/shadcn",
        stylesImported: true
      }
    ])
    expect(found.libraries[0]?.styles).toBeUndefined()
    expect(Object.keys(found.components)).toEqual(["shadcn/Button"])
  })

  it("add only their registry file's tokens when the components are the app's own", async () => {
    await novaFile()

    const found = await findLibraries(root, {}, [], renderer, {
      registry: join(root, "registry"),
      detected: [{ registry: nova.registry, name: nova.name, description: "Copied in." }]
    })

    expect(found.libraries).toEqual([])
    expect(found.components).toEqual({})
    expect(found.describedTokens).toMatchObject([
      { name: "Shadcn Nova", manifest: "registry:@buildkitgg+shadcn-baseui-nova.lib.par" }
    ])
    expect(found.describedTokens[0]?.tokens.length).toBeGreaterThan(0)
  })

  it("bring the same tokens a preview of their registry file shows before they're added", async () => {
    await novaFile()

    const preview = await registryTokens(nova.registry, [], join(root, "registry"))

    expect(preview).toMatchObject({ name: "Shadcn Nova", manifest: "registry:@buildkitgg+shadcn-baseui-nova.lib.par" })
    expect(preview?.tokens.map(({ path, values }) => [path, values.default])).toEqual([["color.primary", "#171717"]])
    expect(await registryTokens("@acme/none", [], join(root, "registry"))).toBeUndefined()
  })

  it("read the icon package their components draw with as an icon library, from their own package's copy", async () => {
    await synced("export function Button(): unknown")
    await novaFile()
    // Linked into sync's package, not the app's own dependency.
    await write("node_modules/@buildkitgg/shadcn/node_modules/@acme/icons/package.json", {
      name: "@acme/icons",
      version: "1.0.0"
    })
    await write("registry/@acme+icons.lib.par", {
      version: 4,
      id: "acme-icons",
      name: "Acme Icons",
      package: { name: "@acme/icons", version: "1.0.0", range: "^1.0.0" },
      icons: { render: "export" }
    })

    const found = await findLibraries(root, syncedApp, [], renderer, {
      registry: join(root, "registry"),
      detected: [{ ...nova, icons: "@acme/icons" }]
    })

    expect(found.libraries.map(({ id, kind, importName }) => ({ id, kind, importName }))).toEqual([
      { id: "shadcn", kind: undefined, importName: "@buildkitgg/shadcn" },
      { id: "acme-icons", kind: "icons", importName: "@acme/icons" }
    ])
  })
})

describe("icon sets", () => {
  it("reads a set's props from the first icon it prefers, or from the component that draws its icons from data", async () => {
    await write("node_modules/glyphs/package.json", { name: "glyphs", version: "1.0.0", types: "dist/index.d.ts" })
    await write("node_modules/glyphs/dist/index.d.ts", "export declare function CheckIcon(): unknown")
    await write("node_modules/glyphs/glyphs.lib.par", {
      version: 4,
      id: "glyphs",
      name: "Glyphs",
      icons: { render: "export", prefer: ["CheckIcon"] }
    })
    await write("node_modules/@drawn/icons/package.json", { name: "@drawn/icons", version: "1.0.0" })
    await write("node_modules/@drawn/icons/drawn.lib.par", {
      version: 4,
      id: "drawn",
      name: "Drawn",
      icons: { render: { import: "@drawn/react", component: "DrawnIcon", prop: "icon" } }
    })
    await write("node_modules/@drawn/react/package.json", {
      name: "@drawn/react",
      version: "1.0.0",
      exports: { ".": { types: "./index.d.ts" } }
    })
    await write("node_modules/@drawn/react/index.d.ts", "export declare function DrawnIcon(): unknown")

    const found = await findLibraries(
      root,
      { dependencies: { glyphs: "1.0.0", "@drawn/icons": "1.0.0" } },
      [],
      renderer
    )

    expect(found.iconSets).toEqual({
      "glyphs/": {
        path: "glyphs",
        export: "CheckIcon",
        library: "glyphs",
        declaration: "node_modules/glyphs/dist/index.d.ts"
      },
      "drawn/": {
        path: "@drawn/react",
        export: "DrawnIcon",
        library: "drawn",
        declaration: "node_modules/@drawn/react/index.d.ts"
      }
    })
  })

  it("reads no props for a set that names no icon, whose icons keep the props they set", async () => {
    await write("node_modules/glyphs/package.json", { name: "glyphs", version: "1.0.0", types: "index.d.ts" })
    await write("node_modules/glyphs/index.d.ts", "export declare function CheckIcon(): unknown")
    await write("node_modules/glyphs/glyphs.lib.par", {
      version: 4,
      id: "glyphs",
      name: "Glyphs",
      icons: { render: "export" }
    })

    const found = await findLibraries(root, { dependencies: { glyphs: "1.0.0" } }, [], renderer)
    expect(found.libraries.map((library) => library.kind)).toEqual(["icons"])
    expect(found.iconSets).toEqual({})
  })
})
