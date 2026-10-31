import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import {
  checkedChanges,
  componentIds,
  correctedSources,
  filesChanged,
  findAppComponents,
  importersOf,
  leftOutChanges,
  type ParsedComponent,
  readChangedFiles
} from "./listing.ts"
import { importAlias, readTsconfig, resolvePathAlias } from "./tsconfig.ts"

/** Exported functions are components; `export const X = Y.Z` is one the parse can't decide. */
const renderer = {
  componentExtensions: [".tsx"],
  findComponents: (source: string) => [
    ...[...source.matchAll(/export function ([A-Z]\w*)/g)].map((match) => ({
      name: match[1]!,
      export: match[1]!,
      as: "function"
    })),
    ...[...source.matchAll(/export const ([A-Z]\w*) = \w+\.\w+/g)].map((match) => ({
      name: match[1]!,
      export: match[1]!
    }))
  ]
} as unknown as RendererAdapter

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-components-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("finding the app's components", () => {
  /** The app's components with their ids, as discovery lists them, with the UI kit in `uiKit`. */
  const list = async (uiKit?: string) => {
    const notes: string[] = []
    const { found } = await findAppComponents(root, renderer, readTsconfig(root), uiKit, notes)
    return { components: componentIds(found), notes }
  }

  it("reads every file the app's tsconfig includes, through its references", async () => {
    await write(
      "tsconfig.json",
      '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }'
    )
    await write("tsconfig.base.json", '{ "compilerOptions": { "jsx": "react-jsx" } }')
    await write("tsconfig.app.json", '{ "extends": "./tsconfig.base.json", "include": ["src"] }')
    await write("tsconfig.node.json", '{ "include": ["vite.config.ts"] }')
    await write("src/components/ui/button.tsx", "export function Button() {}")
    await write("src/routes/orders/order-list.tsx", "export function OrderList() {}")
    await write("src/components/ui/button.stories.tsx", "export function Primary() {}")
    await write(
      "src/main.tsx",
      'createRoot(document.getElementById("root")!).render(<App />)\nexport function App() {}'
    )
    await write("src/tmp/scratch.tsx", "export function Scratch() {}")
    await write("other/outside.tsx", "export function Outside() {}")

    const project = await list("src/components/ui")
    expect(project.components).toEqual({
      Button: { path: "src/components/ui/button.tsx", export: "Button", as: "function" },
      OrderList: { path: "src/routes/orders/order-list.tsx", export: "OrderList", as: "function", lazy: true }
    })
    expect(project.notes).toContain("not read, since they mount the app: src/main.tsx")
  })

  it("reads every file under the root when there's no tsconfig", async () => {
    await write("src/pages/home.tsx", "export function Home() {}")
    await write("node_modules/pkg/index.tsx", "export function Installed() {}")
    const project = await list()
    expect(Object.keys(project.components)).toEqual(["Home"])
  })

  it("reads .ts files when the renderer asks for them, but not declarations or config files", async () => {
    await write("src/components/badge.ts", "export function Badge() {}")
    await write("src/env.d.ts", "export function Declared() {}")
    await write("vite.config.ts", "export function Config() {}")
    const { found } = await findAppComponents(
      root,
      { ...renderer, componentExtensions: [".tsx", ".ts"] },
      readTsconfig(root),
      undefined,
      []
    )
    expect(found.map((component) => component.path)).toEqual(["src/components/badge.ts"])
  })

  it("keeps undecided exports only in the UI kit folder, as it did before", async () => {
    await write("src/components/ui/select.tsx", "export const Select = Primitive.Root\nexport function SelectItem() {}")
    await write("src/components/access.tsx", "export const ForAdmins = Gate.Admins")
    const project = await list("src/components/ui")
    expect(Object.keys(project.components).sort()).toEqual(["Select", "SelectItem"])
  })
})

describe("component ids", () => {
  const found = (path: string, name: string, uiKit = false): ParsedComponent => ({ name, path, export: name, uiKit })

  it("are bare names while they're unique", () => {
    expect(Object.keys(componentIds([found("src/a.tsx", "Card"), found("src/b.tsx", "Badge")]))).toEqual([
      "Card",
      "Badge"
    ])
  })

  it("gain folders on a clash, except the UI kit's, which keeps the bare name", () => {
    const ids = componentIds([
      found("src/components/ui/field.tsx", "FieldError", true),
      found("src/components/packing-fields.tsx", "FieldError"),
      found("src/app/(portal)/error.tsx", "ErrorPage"),
      found("src/app/error.tsx", "ErrorPage")
    ])
    expect(ids).toEqual({
      FieldError: { path: "src/components/ui/field.tsx", export: "FieldError" },
      "components/FieldError": { path: "src/components/packing-fields.tsx", export: "FieldError", lazy: true },
      "(portal)/ErrorPage": { path: "src/app/(portal)/error.tsx", export: "ErrorPage", lazy: true },
      "app/ErrorPage": { path: "src/app/error.tsx", export: "ErrorPage", lazy: true }
    })
  })

  it("use the file's name for two in one folder, and skip ids libraries have", () => {
    const ids = componentIds(
      [found("demos/sidebar-footer.tsx", "AppSidebar"), found("demos/sidebar-header.tsx", "AppSidebar")],
      new Set()
    )
    expect(Object.keys(ids)).toEqual(["demos/sidebar-footer/AppSidebar", "demos/sidebar-header/AppSidebar"])
    const avoided = componentIds(
      [found("src/nova/button.tsx", "Button"), found("src/ui/button.tsx", "Button")],
      new Set(["nova/Button"])
    )
    expect(Object.keys(avoided)).toEqual(["src/nova/Button", "ui/Button"])
  })

  it("list a component exported by name and as the default once", () => {
    const ids = componentIds([
      found("src/badge.tsx", "Badge"),
      { ...found("src/badge.tsx", "Badge"), export: "default" }
    ])
    expect(ids).toEqual({ Badge: { path: "src/badge.tsx", export: "Badge", lazy: true } })
  })

  it("start with a library's namespace in its own project, as the apps that install it name them", () => {
    const ids = componentIds(
      [
        found("src/components/ui/button.tsx", "Button"),
        found("src/components/ui/field.tsx", "FieldError", true),
        found("src/demos/field.tsx", "FieldError")
      ],
      new Set(["nova/Button", "lucide/Heart"]),
      "nova"
    )
    expect(Object.keys(ids)).toEqual(["nova/ui/Button", "nova/FieldError", "nova/demos/FieldError"])
    expect(Object.keys(componentIds([found("src/card.tsx", "Card")], new Set(), "nova"))).toEqual(["nova/Card"])
  })

  it("keep a library project's namespace as files change, the checker reads them and the person lists more", () => {
    const sources = { "nova/Card": { path: "src/card.tsx", export: "Card", as: "function" as const } }
    const read = new Map([["src/badge.tsx", [{ ...found("src/badge.tsx", "Badge"), as: "function" as const }]]])
    expect(filesChanged(sources, read, "nova").added).toEqual(["nova/Badge"])
    const checked = [{ name: "Tabs", path: "src/tabs.tsx", export: "Tabs", as: "function" as const }]
    expect(Object.keys(checkedChanges(sources, checked, undefined, "nova").added)).toEqual(["nova/Tabs"])
    const corrected = correctedSources(sources, { include: [{ path: "src/promo.tsx", export: "Promo" }] }, "nova")
    expect(Object.keys(corrected)).toEqual(["nova/Card", "nova/Promo"])
  })
})

describe("readTsconfig", () => {
  it("follows extends and references, and resolves paths from the config that declares them", async () => {
    await write("tsconfig.json", '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }')
    await write(
      "tsconfig.app.json",
      '{ "compilerOptions": { "jsx": "react-jsx", "paths": { "@/*": ["./src/*"], "~ui": ["./src/ui/index.ts"] } }, "include": ["src"] }'
    )
    await write("src/ui/index.ts", "export {}")
    const tsconfig = readTsconfig(root)
    expect(tsconfig.configs.map((config) => config.path)).toEqual(["tsconfig.json", "tsconfig.app.json"])
    expect(tsconfig.app?.path).toBe("tsconfig.app.json")
    expect(resolvePathAlias(root, tsconfig, "@/components/ui")).toBe("src/components/ui")
    expect(resolvePathAlias(root, tsconfig, "~ui")).toBe("src/ui/index.ts")
    expect(resolvePathAlias(root, tsconfig, "react")).toBeUndefined()
  })

  it("records every config file it read: references and each extends chain, from a package too", async () => {
    await write("tsconfig.base.json", '{ "extends": "@acme/tsconfig/react.json" }')
    await write("node_modules/@acme/tsconfig/package.json", '{ "name": "@acme/tsconfig" }')
    await write("node_modules/@acme/tsconfig/react.json", '{ "compilerOptions": { "jsx": "react-jsx" } }')
    await write("app/tsconfig.json", '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }')
    await write("app/tsconfig.app.json", '{ "extends": "../tsconfig.base.json", "include": ["src"] }')
    await write("app/src/main.tsx", "export {}")
    const tsconfig = readTsconfig(join(root, "app"))
    expect(tsconfig.configs.map((config) => config.path)).toEqual(["tsconfig.json", "tsconfig.app.json"])
    expect(tsconfig.read.toSorted()).toEqual([
      "../node_modules/@acme/tsconfig/react.json",
      "../tsconfig.base.json",
      "tsconfig.app.json",
      "tsconfig.json"
    ])
  })

  it("writes a file's import through the alias that reaches furthest into it", async () => {
    await write(
      "tsconfig.json",
      '{ "compilerOptions": { "paths": { "@/*": ["./src/*"], "@ui/*": ["./src/components/ui/*"], "~ui": ["./src/ui/index.ts"] } }, "include": ["src"] }'
    )
    const tsconfig = readTsconfig(root)
    expect(importAlias(root, tsconfig, "src/routes/orders/order-list.tsx")).toBe("@/routes/orders/order-list")
    expect(importAlias(root, tsconfig, "src/components/ui/button.tsx")).toBe("@ui/button")
    expect(importAlias(root, tsconfig, "src/ui/index.ts")).toBe("~ui")
    expect(importAlias(root, tsconfig, "other/outside.tsx")).toBeUndefined()
  })
})

describe("checkedChanges", () => {
  it("adds what only the checker found, confirms undecided ones it agrees with, and drops the rest", () => {
    const sources = {
      Select: { path: "src/components/ui/select.tsx", export: "Select" },
      selectVariants: { path: "src/components/ui/select.tsx", export: "SelectVariants" },
      Button: { path: "src/components/ui/button.tsx", export: "Button", as: "function" as const },
      ForAdmins: { path: "src/legacy/access.tsx", export: "ForAdmins", as: "function" as const },
      "nova/Card": { path: "@acme/nova", export: "Card", library: "nova" }
    }
    const changes = checkedChanges(sources, [
      { name: "Select", path: "src/components/ui/select.tsx", export: "Select", as: "exotic" },
      { name: "Button", path: "src/components/ui/button.tsx", export: "Button", as: "forwardRef" },
      { name: "ForAdmins", path: "src/components/access.tsx", export: "ForAdmins", as: "function" }
    ])
    expect(changes.confirmed).toEqual({
      Select: { path: "src/components/ui/select.tsx", export: "Select", as: "exotic" }
    })
    expect(changes.removed).toEqual(["selectVariants"])
    // The name is taken by a component the parse found, which keeps it.
    expect(changes.added).toEqual({
      "components/ForAdmins": { path: "src/components/access.tsx", export: "ForAdmins", as: "function", lazy: true }
    })
  })

  it("settles only the files the checker read again", () => {
    const sources = {
      Select: { path: "src/components/ui/select.tsx", export: "Select" },
      Tabs: { path: "src/components/ui/tabs.tsx", export: "Tabs" }
    }
    const changes = checkedChanges(sources, [], new Set(["src/components/ui/tabs.tsx"]))
    expect(changes.removed).toEqual(["Tabs"])
  })
})

describe("leftOutChanges", () => {
  it("replaces what the checker left out of the files it read again, and keeps the rest", () => {
    const entry = (name: string, path: string, reason: string) => ({ name, path, export: name, reason })
    const before = [
      entry("Theme", "src/theme.tsx", "a context, which passes a value down rather than drawing anything"),
      entry("Format", "src/format.ts", "not a function")
    ]
    const helper = { ...entry("Helper", "src/format.ts", "its type is any"), undecided: true as const }
    expect(leftOutChanges(before, new Set(["src/format.ts"]), [helper])).toEqual([helper, before[0]])
  })
})

describe("correctedSources", () => {
  const sources = {
    Button: { path: "src/components/ui/button.tsx", export: "Button", as: "function" as const },
    Toaster: { path: "src/components/ui/sonner.tsx", export: "Toaster", as: "function" as const },
    "nova/Card": { path: "@acme/nova", export: "Card", library: "nova" }
  }

  it("drops what the person took off the list, and adds what they put on it, loading as it's drawn", () => {
    const corrected = correctedSources(sources, {
      exclude: [{ path: "src/components/ui/sonner.tsx", export: "Toaster" }],
      include: [
        { path: "src/promo.tsx", export: "PromoPrice" },
        { path: "src/pages/user-card.tsx", export: "default" },
        { path: "src/components/button.tsx", export: "Button" }
      ]
    })
    expect(corrected).toEqual({
      Button: sources.Button,
      "nova/Card": sources["nova/Card"],
      PromoPrice: { path: "src/promo.tsx", export: "PromoPrice", lazy: true, included: true },
      UserCard: { path: "src/pages/user-card.tsx", export: "default", lazy: true, included: true },
      "components/Button": { path: "src/components/button.tsx", export: "Button", lazy: true, included: true }
    })
  })

  it("leaves the list alone without corrections, and an included component isn't added twice", () => {
    expect(correctedSources(sources, undefined)).toBe(sources)
    const once = correctedSources(sources, { include: [{ path: "src/promo.tsx", export: "PromoPrice" }] })
    expect(correctedSources(once, { include: [{ path: "src/promo.tsx", export: "PromoPrice" }] })).toEqual(once)
  })

  it("keeps an included component through the type checker, which doesn't confirm it", () => {
    const included = {
      PromoPrice: { path: "src/promo.tsx", export: "PromoPrice", lazy: true, included: true as const }
    }
    expect(checkedChanges(included, []).removed).toEqual([])
  })
})

describe("files changing", () => {
  const own = (path: string, name: string, extra: Partial<ParsedComponent> = {}): ParsedComponent => ({
    name,
    path,
    export: name,
    as: "function",
    uiKit: false,
    ...extra
  })

  it("keeps ids, drops what's gone, and adds what's new", () => {
    const sources = {
      OrderTable: { path: "src/orders/table.tsx", export: "OrderTable", as: "function" as const, lazy: true },
      OrderRow: { path: "src/orders/table.tsx", export: "OrderRow", as: "function" as const, lazy: true },
      Old: { path: "src/old.tsx", export: "Old", as: "function" as const, lazy: true },
      Button: { path: "src/components/ui/button.tsx", export: "Button", as: "function" as const }
    }
    const read = new Map([
      ["src/orders/table.tsx", [own("src/orders/table.tsx", "OrderTable", { as: "memo" })]],
      ["src/old.tsx", undefined],
      ["src/orders/filters.tsx", [own("src/orders/filters.tsx", "Filters")]]
    ])
    const changes = filesChanged(sources, read)
    expect(changes.removed).toEqual(["OrderRow", "Old"])
    expect(changes.added).toEqual(["Filters"])
    expect(changes.sources).toEqual({
      OrderTable: { path: "src/orders/table.tsx", export: "OrderTable", as: "memo", lazy: true },
      Button: sources.Button,
      Filters: { path: "src/orders/filters.tsx", export: "Filters", as: "function", lazy: true }
    })
  })

  it("follows a component moved to another file by its name, which keeps its id", () => {
    const sources = { StatCard: { path: "src/stat-card.tsx", export: "StatCard", as: "function" as const, lazy: true } }
    const read = new Map([
      ["src/stat-card.tsx", undefined],
      ["src/cards/stat-card.tsx", [own("src/cards/stat-card.tsx", "StatCard")]]
    ])
    expect(filesChanged(sources, read).sources).toEqual({
      StatCard: { path: "src/cards/stat-card.tsx", export: "StatCard", as: "function", lazy: true }
    })
  })

  it("leaves undecided exports to the type checker", () => {
    const sources = {
      ForAdmins: { path: "src/access.tsx", export: "ForAdmins", as: "exotic" as const, lazy: true }
    }
    const read = new Map([
      [
        "src/access.tsx",
        [own("src/access.tsx", "ForAdmins", { as: undefined }), own("src/access.tsx", "IfCanOpen", { as: undefined })]
      ],
      ["src/components/ui/select.tsx", [own("src/components/ui/select.tsx", "Select", { as: undefined, uiKit: true })]]
    ])
    const changes = filesChanged(sources, read)
    expect(changes.sources).toEqual({
      ForAdmins: { path: "src/access.tsx", export: "ForAdmins", lazy: true },
      Select: { path: "src/components/ui/select.tsx", export: "Select" }
    })
  })

  it("reads changed files again, and treats ones no longer in the app as gone", async () => {
    await write("src/orders/table.tsx", "export function OrderTable() {}\nexport const Row = Base.Row")
    await write("src/main.tsx", "createRoot(root).render(<App />)\nexport function App() {}")
    const read = await readChangedFiles(root, renderer, ["src/orders/table.tsx", "src/main.tsx"], undefined, [
      "src/orders/table.tsx",
      "src/main.tsx",
      "src/deleted.tsx",
      "src/orders/table.tsx"
    ])
    expect(read.get("src/orders/table.tsx")?.map((component) => [component.name, component.as])).toEqual([
      ["OrderTable", "function"],
      ["Row", undefined]
    ])
    expect(read.get("src/main.tsx")).toBeUndefined()
    expect(read.has("src/deleted.tsx")).toBe(true)
  })

  it("finds the files that import a changed one, by path or alias", async () => {
    await write("tsconfig.json", '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } }, "include": ["src"] }')
    await write("src/components/ui/button.tsx", "export function Button() {}")
    await write("src/a.tsx", 'import { Button } from "./components/ui/button"')
    await write("src/b.tsx", 'import { Button } from "@/components/ui/button.js"')
    await write("src/c.tsx", 'export { Button } from "./components/ui"')
    await write("src/components/ui/index.ts", 'export * from "./button"')
    await write("src/d.tsx", 'import { Card } from "./components/ui/card"')
    const files = ["src/a.tsx", "src/b.tsx", "src/c.tsx", "src/d.tsx", "src/components/ui/button.tsx"]
    const tsconfig = readTsconfig(root)
    expect(await importersOf(root, files, ["src/components/ui/button.tsx"], tsconfig)).toEqual([
      "src/a.tsx",
      "src/b.tsx"
    ])
    expect(await importersOf(root, files, ["src/components/ui/index.ts"], tsconfig)).toEqual(["src/c.tsx"])
  })
})
