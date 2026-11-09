import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { ComponentExport, RendererAdapter } from "@parity-app/core"
import type { JsonValue } from "@parity-app/core/schema"
import { isText } from "@parity-app/core/values/evaluate"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { findLibraries } from "./libraries.ts"
import {
  exportedComponents,
  findPackage,
  type InstalledPackage,
  packageEntry,
  packageStylesheet,
  readPackage,
  splitSpecifier
} from "./packages.ts"

/** Exported functions are components, and so is a capitalised default export. Declaration files don't say how. */
const renderer: RendererAdapter = {
  id: "test",
  name: "Test",
  detect: () => true,
  guestModule: "",
  runtimePackages: [],
  runtimeImports: [],
  componentExtensions: [".tsx"],
  findComponents: (source, file) => [
    ...[...source.matchAll(/export (?:declare )?function ([A-Z]\w*)/g)].map(([, name]): ComponentExport => ({
      name: name!,
      export: name!,
      as: file.endsWith(".d.ts") ? undefined : "function"
    })),
    ...[...source.matchAll(/export default ([A-Z]\w*)/g)].map(([, name]) => ({ name: name!, export: "default" }))
  ]
}

/** One folder holding every shape of package the reader is asked about, installed for an app in `apps/web`. */
let root: string

function write(path: string, content: JsonValue = ""): void {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, isText(content) ? content : JSON.stringify(content))
}

const app = () => join(root, "apps", "web")
const at = (...path: string[]) => join(root, ...path)

async function installed(name: string): Promise<InstalledPackage> {
  const found = await findPackage(app(), name)

  if (!found) {
    throw new Error(`${name} isn't in the fixture`)
  }

  return found
}

beforeAll(() => {
  // Resolved as the reader resolves links, so a Windows temp folder's short name (`RUNNER~1`) is written out in full.
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "parity-packages-")))
  write("apps/web/package.json", { name: "web" })

  // The app's own copy is nearer than the one in the folder above.
  write("apps/web/node_modules/shadowed/package.json", { name: "shadowed", version: "2.0.0" })
  write("node_modules/shadowed/package.json", { name: "shadowed", version: "1.0.0" })
  // A folder without a manifest isn't a package, so the search goes on above it.
  mkdirSync(at("apps/web/node_modules/@acme/kit"), { recursive: true })

  // A package with every kind of `exports`: nested conditions, subpaths, patterns, a private path and stylesheets.
  write("node_modules/@acme/kit/package.json", {
    name: "@acme/kit",
    version: "2.3.0",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: { node: "./dist/node.mjs", default: "./dist/index.mjs" },
        require: "./dist/index.cjs"
      },
      "./button": { import: { types: "./dist/button.d.mts", default: "./dist/button.mjs" } },
      "./icons/*": "./dist/icons/*.js",
      "./icons/internal/*": null,
      "./styles.css": "./dist/styles.css",
      "./tailwind.css": { types: "./dist/styles.d.ts", default: "./dist/tailwind.css" },
      "./package.json": "./package.json"
    }
  })

  for (const file of ["node.mjs", "index.mjs", "index.cjs", "button.d.mts", "button.mjs", "styles.d.ts"]) {
    write(`node_modules/@acme/kit/dist/${file}`)
  }

  write("node_modules/@acme/kit/dist/icons/heart.js")
  write("node_modules/@acme/kit/dist/icons/heart.d.ts")
  write("node_modules/@acme/kit/dist/icons/internal/secret.js")
  write("node_modules/@acme/kit/dist/styles.css")
  write("node_modules/@acme/kit/dist/tailwind.css")
  // Its declarations, through both kinds of re-export, a default export, types, an import cycle and another package.
  write(
    "node_modules/@acme/kit/dist/index.d.ts",
    [
      'export * from "./button.js"',
      'export { Card as Panel, type CardProps } from "./card.js"',
      'export type { Theme } from "./theme.js"',
      'export { default as Dialog } from "./dialog.js"',
      'export * from "./cycle.js"',
      'export * from "react"',
      "export declare function Root(): unknown"
    ].join("\n")
  )
  write("node_modules/@acme/kit/dist/button.d.ts", "export declare function Button(): unknown\nexport default Button")
  write("node_modules/@acme/kit/dist/card.d.ts", "export declare function Card(): unknown")
  write("node_modules/@acme/kit/dist/theme.d.ts", "export declare function Theme(): unknown")
  write("node_modules/@acme/kit/dist/dialog.d.ts", "declare function DialogRoot(): unknown\nexport default DialogRoot")
  write("node_modules/@acme/kit/dist/cycle.d.ts", 'export * from "./index.js"\nexport declare function Loop(): unknown')

  // Older packages: `main`, `types` and `style` fields, a `main` without its extension, `typings`, no `exports`.
  write("node_modules/legacy/package.json", {
    name: "legacy",
    version: "1.0.0",
    main: "lib/index.js",
    types: "lib/index.d.ts",
    style: "dist/legacy.css"
  })

  for (const file of ["lib/index.js", "lib/index.d.ts", "lib/util.js", "dist/legacy.css"]) {
    write(`node_modules/legacy/${file}`)
  }

  write("node_modules/beside/package.json", { name: "beside", main: "./build/main" })
  write("node_modules/beside/build/main.js")
  write("node_modules/beside/build/main.d.ts")
  write("node_modules/typed/package.json", { name: "typed", typings: "types.d.ts" })
  write("node_modules/typed/types.d.ts")
  write("node_modules/typed/index.js")
  // `exports` as conditions for the one entry point, one of them a list to try in turn.
  write("node_modules/sugar/package.json", {
    name: "sugar",
    exports: { types: "./index.d.ts", import: [{ worker: "./worker.mjs" }, "./index.mjs"] }
  })
  write("node_modules/sugar/index.d.ts")
  write("node_modules/sugar/index.mjs")
  write("node_modules/sugar/worker.mjs")
  // A library whose declarations are named only under `exports`, away from the old `dist/index.d.ts` guess.
  write("node_modules/exported/package.json", {
    name: "exported",
    version: "1.0.0",
    exports: { ".": { import: { types: "./types/main.d.mts", default: "./esm/main.mjs" } } }
  })
  write("node_modules/exported/exported.lib.par", { version: 3, id: "exported", name: "Exported" })
  write("node_modules/exported/types/main.d.mts", "export declare function Badge(): unknown")
  write("node_modules/exported/esm/main.mjs")

  // Installed under an alias (`"@acme/alias": "npm:@acme/real@3.1.0"`), and linked from pnpm's store.
  write("node_modules/@acme/alias/package.json", { name: "@acme/real", version: "3.1.0" })
  write("node_modules/.pnpm/linked@1.0.0/node_modules/linked/package.json", { name: "linked", version: "1.0.0" })
  symlinkSync(at("node_modules/.pnpm/linked@1.0.0/node_modules/linked"), at("node_modules/linked"), "junction")

  // Manifests that aren't a package's.
  write("node_modules/wrong-types/package.json", { name: "wrong-types", types: 5 })
  write("node_modules/not-json/package.json", "{")

  // Workspace packages, read from source: an entry built to `dist`, a `source` condition, and an unbuilt `main`.
  write("packages/ui/package.json", {
    name: "@acme/ui",
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./forms": { source: "./src/forms/index.ts", import: "./dist/forms.js" },
      "./card": "./dist/esm/card.js"
    }
  })
  write(
    "packages/ui/src/index.tsx",
    'export * from "./forms"\nexport { Card as Panel } from "./card.js"\nexport function Shell() {}'
  )
  write("packages/ui/src/forms/index.ts", 'export * from "./field"')
  write("packages/ui/src/forms/field.tsx", "export function Field() {}")
  write("packages/ui/src/card.tsx", "export function Card() {}")
  write("packages/utils/package.json", { name: "@acme/utils", main: "src/lib/index.ts" })
  write("packages/utils/src/lib/index.ts", "export function formatDate() {}")
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("finding an installed package", () => {
  it("looks in node_modules here, then in each folder above, the nearest first", async () => {
    expect((await installed("shadowed")).manifest.version).toBe("2.0.0")
    expect(await installed("@acme/kit")).toMatchObject({
      dir: at("node_modules/@acme/kit"),
      installedAt: at("node_modules/@acme/kit"),
      manifest: { name: "@acme/kit", version: "2.3.0" }
    })
    expect(await findPackage(app(), "missing")).toBeUndefined()
  })

  it("follows a link to where the package really is, as pnpm installs it", async () => {
    expect(await installed("linked")).toMatchObject({
      dir: at("node_modules/.pnpm/linked@1.0.0/node_modules/linked"),
      installedAt: at("node_modules/linked")
    })
  })

  it("reads what an alias really is from the package's own manifest", async () => {
    expect((await installed("@acme/alias")).manifest).toMatchObject({ name: "@acme/real", version: "3.1.0" })
  })

  it("says which manifest isn't a package's, and where in it", async () => {
    await expect(findPackage(app(), "wrong-types")).rejects.toThrow(
      `${at("node_modules/wrong-types/package.json")}: /types: expected a string`
    )
    await expect(findPackage(app(), "not-json")).rejects.toThrow("package.json: /: expected JSON")
    expect(await readPackage(at("packages"))).toBeUndefined()
  })
})

describe("picking an entry", () => {
  it("follows exports' conditions for each use, the package's own order of nesting kept", async () => {
    const kit = await installed("@acme/kit")
    expect(packageEntry(kit, "types")).toBe(at("node_modules/@acme/kit/dist/index.d.ts"))
    expect(packageEntry(kit, "runtime")).toBe(at("node_modules/@acme/kit/dist/node.mjs"))
    expect(packageEntry(kit, "types", "./button")).toBe(at("node_modules/@acme/kit/dist/button.d.mts"))
    expect(packageEntry(kit, "runtime", "button")).toBe(at("node_modules/@acme/kit/dist/button.mjs"))
    // A stylesheet's `types` condition names declarations, never the stylesheet.
    expect(packageEntry(kit, "style", "tailwind.css")).toBe(at("node_modules/@acme/kit/dist/tailwind.css"))
  })

  it("matches a pattern, the longest first, and leaves out what the package keeps to itself", async () => {
    const kit = await installed("@acme/kit")
    expect(packageEntry(kit, "runtime", "./icons/heart")).toBe(at("node_modules/@acme/kit/dist/icons/heart.js"))
    // Declarations beside the module, as TypeScript reads them.
    expect(packageEntry(kit, "types", "./icons/heart")).toBe(at("node_modules/@acme/kit/dist/icons/heart.d.ts"))
    expect(packageEntry(kit, "runtime", "./icons/internal/secret")).toBeUndefined()
    expect(packageEntry(kit, "runtime", "./icons/")).toBeUndefined()
    expect(packageEntry(kit, "runtime", "./dist/index.cjs")).toBeUndefined()
  })

  it("reads older packages by their main, module, types, typings and style fields", async () => {
    const legacy = await installed("legacy")
    expect(packageEntry(legacy, "types")).toBe(at("node_modules/legacy/lib/index.d.ts"))
    expect(packageEntry(legacy, "runtime")).toBe(at("node_modules/legacy/lib/index.js"))
    expect(packageEntry(legacy, "style")).toBe(at("node_modules/legacy/dist/legacy.css"))
    // Without `exports`, a subpath is a file in the package.
    expect(packageEntry(legacy, "runtime", "./lib/util")).toBe(at("node_modules/legacy/lib/util.js"))
    const beside = await installed("beside")
    expect(packageEntry(beside, "runtime")).toBe(at("node_modules/beside/build/main.js"))
    expect(packageEntry(beside, "types")).toBe(at("node_modules/beside/build/main.d.ts"))
    const typed = await installed("typed")
    expect(packageEntry(typed, "types")).toBe(at("node_modules/typed/types.d.ts"))
    expect(packageEntry(typed, "runtime")).toBe(at("node_modules/typed/index.js"))
  })

  it("reads exports written as the one entry point's conditions, trying a list in turn", async () => {
    const sugar = await installed("sugar")
    expect(packageEntry(sugar, "types")).toBe(at("node_modules/sugar/index.d.ts"))
    expect(packageEntry(sugar, "runtime")).toBe(at("node_modules/sugar/index.mjs"))
  })

  it("traces a workspace package's built entry back to its source", async () => {
    const ui = (await readPackage(at("packages/ui")))!
    expect(packageEntry(ui, "source")).toBe(at("packages/ui/src/index.tsx"))
    expect(packageEntry(ui, "source", "./forms")).toBe(at("packages/ui/src/forms/index.ts"))
    expect(packageEntry(ui, "source", "./card")).toBe(at("packages/ui/src/card.tsx"))
    // `lib` inside `src` is source; only build folders at the package's root are built.
    const utils = (await readPackage(at("packages/utils")))!
    expect(packageEntry(utils, "source")).toBe(at("packages/utils/src/lib/index.ts"))
  })

  it("finds the stylesheet a project imports: the style field, else the usual names exports lists", async () => {
    expect(packageStylesheet(await installed("@acme/kit"))).toBe("tailwind.css")
    expect(packageStylesheet(await installed("legacy"))).toBe("dist/legacy.css")
    expect(packageStylesheet(await installed("sugar"))).toBeUndefined()
  })

  it("splits a specifier into its package and the entry point in it", () => {
    expect(splitSpecifier("@acme/kit/icons/heart")).toEqual({ name: "@acme/kit", subpath: "./icons/heart" })
    expect(splitSpecifier("legacy")).toEqual({ name: "legacy", subpath: "." })
  })
})

describe("following re-exports", () => {
  it("follows both kinds through a package's declarations, leaving out types, defaults and other packages", async () => {
    const dist = (file: string) => at("node_modules/@acme/kit/dist", file)
    const exported = await exportedComponents(dist("index.d.ts"), renderer)
    expect(Object.fromEntries(exported)).toEqual({
      Root: { name: "Root", file: dist("index.d.ts") },
      Button: { name: "Button", file: dist("button.d.ts") },
      Panel: { name: "Panel", file: dist("card.d.ts") },
      Dialog: { name: "Dialog", file: dist("dialog.d.ts") },
      Loop: { name: "Loop", file: dist("cycle.d.ts") }
    })
  })

  it("lists a library's components from declarations only its exports name", async () => {
    const found = await findLibraries(app(), { dependencies: { exported: "1.0.0" } }, [], renderer)
    expect(found.libraries.map((library) => library.id)).toEqual(["exported"])
    expect(found.components).toEqual({
      "exported/Badge": {
        path: "exported",
        export: "Badge",
        library: "exported",
        declaration: "../../node_modules/exported/types/main.d.mts"
      }
    })
  })

  it("follows them through source, to a folder's index and to `./x.js` written for `./x.tsx`", async () => {
    const src = (file: string) => at("packages/ui/src", file)
    const exported = await exportedComponents(src("index.tsx"), renderer)
    expect(Object.fromEntries(exported)).toEqual({
      Shell: { name: "Shell", file: src("index.tsx"), as: "function" },
      Field: { name: "Field", file: src("forms/field.tsx"), as: "function" },
      Panel: { name: "Panel", file: src("card.tsx"), as: "function" }
    })
  })
})
