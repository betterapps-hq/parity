import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { checkedChanges, componentIds, type FoundComponent } from "./components.ts"
import { discoverProject } from "./index.ts"
import { readTsconfig, resolvePathAlias } from "./tsconfig.ts"

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

    const project = await discoverProject(root, renderer)
    expect(project.components).toEqual({
      Button: { path: "src/components/ui/button.tsx", export: "Button", as: "function" },
      OrderList: { path: "src/routes/orders/order-list.tsx", export: "OrderList", as: "function", lazy: true }
    })
    expect(project.notes).toContain("not read, since they mount the app: src/main.tsx")
  })

  it("reads every file under the root when there's no tsconfig", async () => {
    await write("src/pages/home.tsx", "export function Home() {}")
    await write("node_modules/pkg/index.tsx", "export function Installed() {}")
    const project = await discoverProject(root, renderer)
    expect(Object.keys(project.components)).toEqual(["Home"])
  })

  it("keeps undecided exports only in the UI kit folder, as it did before", async () => {
    await write("src/components/ui/select.tsx", "export const Select = Primitive.Root\nexport function SelectItem() {}")
    await write("src/components/access.tsx", "export const ForAdmins = Gate.Admins")
    const project = await discoverProject(root, renderer)
    expect(Object.keys(project.components).sort()).toEqual(["Select", "SelectItem"])
  })
})

describe("component ids", () => {
  const found = (path: string, name: string, uiKit = false): FoundComponent => ({ name, path, export: name, uiKit })

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
})
