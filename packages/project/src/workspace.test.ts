import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { discoverProject } from "./index.ts"
import { findWorkspace, pnpmPackages } from "./workspace.ts"

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

const manifest = (fields: Record<string, unknown>) => JSON.stringify(fields)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-workspace-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("reading a monorepo's packages", () => {
  it("reads pnpm-workspace.yaml's package globs", () => {
    expect(
      pnpmPackages(
        "packages:\n  - apps/*\n  - \"packages/*\" # shared\n  - '!packages/legacy'\ncatalog:\n  react: ^19\n"
      )
    ).toEqual(["apps/*", "packages/*", "!packages/legacy"])
  })

  it("finds the workspace above the app, by pnpm or package.json workspaces", async () => {
    await write("package.json", manifest({ name: "monorepo", workspaces: { packages: ["apps/*", "packages/*"] } }))
    await write("apps/web/package.json", manifest({ name: "web" }))
    await write("packages/ui/package.json", manifest({ name: "@acme/ui" }))
    await write("packages/scratch/notes.txt", "not a package")

    const workspace = await findWorkspace(join(root, "apps/web"))

    expect(workspace?.root).toBe(root)
    expect([...(workspace?.packages.keys() ?? [])].sort()).toEqual(["@acme/ui", "web"])
  })

  it("isn't in a workspace whose patterns leave the app out", async () => {
    await write("pnpm-workspace.yaml", "packages:\n  - packages/*\n")
    await write("tools/app/package.json", manifest({ name: "app" }))

    expect(await findWorkspace(join(root, "tools/app"))).toBeUndefined()
  })

  it("lists each package the app depends on as a section, read from source", async () => {
    await write("pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n  - '!packages/legacy'\n")
    await write(
      "apps/web/package.json",
      manifest({
        name: "web",
        dependencies: { "@acme/ui": "workspace:*", "@acme/utils": "workspace:*", "@acme/legacy": "workspace:*" }
      })
    )
    await write("apps/web/src/app.tsx", "export function App() {}")
    // Its entry is built output, so the source next to it is read instead.
    await write(
      "packages/ui/package.json",
      manifest({
        name: "@acme/ui",
        version: "1.2.0",
        exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }
      })
    )
    await write(
      "packages/ui/src/index.ts",
      [
        'export * from "./button.js"',
        'export { Card as Panel, type CardProps } from "./card"',
        'export type { Theme } from "./theme"',
        'export * from "./forms"',
        'export * from "react-aria-components"'
      ].join("\n")
    )
    await write("packages/ui/src/button.tsx", "export function Button() {}\nexport const Toggle = Base.Toggle")
    await write("packages/ui/src/card.tsx", "export function Card() {}\nexport function CardHeader() {}")
    await write("packages/ui/src/theme.tsx", "export function Theme() {}")
    await write("packages/ui/src/forms/index.ts", 'export * from "./field"')
    await write("packages/ui/src/forms/field.tsx", "export function Field() {}")
    // A package of helpers has nothing to place.
    await write("packages/utils/package.json", manifest({ name: "@acme/utils", main: "src/index.ts" }))
    await write("packages/utils/src/index.ts", "export function formatDate() {}")
    await write("packages/legacy/package.json", manifest({ name: "@acme/legacy", main: "index.tsx" }))
    await write("packages/legacy/index.tsx", "export function Old() {}")

    const project = await discoverProject(join(root, "apps/web"), renderer, {
      dependencies: { "@acme/ui": "workspace:*", "@acme/utils": "workspace:*", "@acme/legacy": "workspace:*" }
    })

    expect(project.libraries).toEqual([
      {
        id: "ui",
        name: "@acme/ui",
        kind: "components",
        description: "A package in this workspace",
        package: "@acme/ui",
        importName: "@acme/ui",
        version: "1.2.0",
        stylesImported: true,
        workspace: "../../packages/ui"
      }
    ])
    const fromUi = Object.fromEntries(
      Object.entries(project.components).filter(([, source]) => source.library === "ui")
    )
    expect(fromUi).toEqual({
      "ui/Button": {
        path: "@acme/ui",
        export: "Button",
        library: "ui",
        declaration: "../../packages/ui/src/button.tsx",
        as: "function"
      },
      "ui/Panel": {
        path: "@acme/ui",
        export: "Panel",
        library: "ui",
        declaration: "../../packages/ui/src/card.tsx",
        as: "function"
      },
      "ui/Field": {
        path: "@acme/ui",
        export: "Field",
        library: "ui",
        declaration: "../../packages/ui/src/forms/field.tsx",
        as: "function"
      }
    })
    expect(project.components.App).toBeDefined()
    expect(project.notes).toContain("a workspace at ../.., with components from @acme/ui")
  })

  it("says so when none of the app's workspace packages export components", async () => {
    await write("package.json", manifest({ name: "monorepo", workspaces: ["apps/*", "packages/*"] }))
    await write("apps/web/package.json", manifest({ name: "web" }))
    await write("packages/utils/package.json", manifest({ name: "@acme/utils", main: "src/index.ts" }))
    await write("packages/utils/src/index.ts", "export function formatDate() {}")

    const project = await discoverProject(join(root, "apps/web"), renderer, {
      dependencies: { "@acme/utils": "workspace:*" }
    })

    expect(project.libraries).toEqual([])
    expect(project.notes).toContain("a workspace at ../.., though none of the app's packages from it export components")
  })
})
