import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity-app/core"
import type { JsonValue } from "@parity-app/core/schema"
import { isText } from "@parity-app/core/values/evaluate"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { findLibraries } from "./libraries.ts"

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
  root = await mkdtemp(join(tmpdir(), "canvas-library-files-"))
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

    const found = await findLibraries(
      root,
      { dependencies: { "@acme/ui": "2.1.0" } },
      [],
      renderer,
      [],
      join(root, "registry")
    )

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

    const found = await findLibraries(
      root,
      { dependencies: { "@acme/ui": "1.2.0" } },
      [],
      renderer,
      [],
      join(root, "registry")
    )

    expect(found.libraries[0]?.decorators).toHaveLength(1)
    expect(Object.keys(found.components).sort()).toEqual(["acme/Button", "acme/Card", "acme/Legacy"])
    expect(found.notes[0]).toMatch(
      /1\.2\.0 is older than Parity's file for it \(2\.4\.0\): 1 components it doesn't list found by name, 2 it doesn't have yet/
    )
  })
})

describe("components shadcn-sync generates", () => {
  /** `@buildkitgg/shadcn` as sync writes it into an app, with the settings it records in `manifest.json`. */
  async function synced(settings: Record<string, string>, declarations: string) {
    await write("node_modules/@buildkitgg/shadcn/package.json", {
      name: "@buildkitgg/shadcn",
      version: "0.1.4",
      types: "index.d.ts"
    })
    await write("node_modules/@buildkitgg/shadcn/manifest.json", { generatorVersion: "0.1.4", settings })
    await write("node_modules/@buildkitgg/shadcn/index.d.ts", declarations)
  }

  it("are read with their kit's file, imported from the package the app has, and checked against what it exports", async () => {
    await synced(
      { base: "base", icons: "lucide", style: "nova", theme: "neutral", css: "tailwind" },
      "export function Button(): unknown\nexport function Attachment(): unknown"
    )
    await write("registry/@buildkitgg+shadcn-baseui-nova.lib.par", {
      version: 4,
      id: "nova",
      name: "Shadcn Nova",
      package: { name: "@buildkitgg/shadcn-baseui-nova", version: "0.5.0", range: "^0.5.0" },
      styles: "tailwind.css",
      decorators: [{ wrap: { import: "@buildkitgg/shadcn-baseui-nova", component: "TooltipProvider" } }],
      components: { list: { Button: component(), Sonner: component() } }
    })

    const found = await findLibraries(
      root,
      { dependencies: { "@buildkitgg/shadcn": "link:node_modules/.buildkit/shadcn" } },
      ["src/index.css"],
      renderer,
      [],
      join(root, "registry")
    )

    expect(found.libraries).toMatchObject([
      {
        id: "nova",
        name: "Shadcn Nova",
        package: "@buildkitgg/shadcn",
        tailwindEntry: "tailwind.css",
        stylesImported: false,
        decorators: [{ wrap: { import: "@buildkitgg/shadcn", component: "TooltipProvider" } }]
      }
    ])
    // The kit's Sonner isn't generated any more, and Attachment is newer than the kit's file.
    expect(Object.keys(found.components).sort()).toEqual(["nova/Attachment", "nova/Button"])
    expect(found.components["nova/Button"]?.path).toBe("@buildkitgg/shadcn")
    // sync's version says nothing about the kit's, so there's no file to update.
    expect(found.notes).toEqual([])
  })

  it("on a base with no kit, are listed from their declarations, with their own CSS when compiled", async () => {
    await synced(
      { base: "aria", icons: "lucide", style: "lyra", theme: "neutral", css: "compiled" },
      "export function Button(): unknown"
    )

    const found = await findLibraries(
      root,
      { dependencies: { "@buildkitgg/shadcn": "link:node_modules/.buildkit/shadcn" } },
      [],
      renderer,
      [],
      join(root, "registry")
    )

    expect(found.libraries).toMatchObject([
      {
        id: "lyra",
        name: "Shadcn Lyra",
        description: "Every shadcn component on React Aria, in the lyra style.",
        package: "@buildkitgg/shadcn",
        stylesImported: true
      }
    ])
    expect(found.libraries[0]?.tailwindEntry).toBeUndefined()
    expect(Object.keys(found.components)).toEqual(["lyra/Button"])
  })
})
