import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { ComponentInfo } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { answer } from "./props-worker.ts"

let root: string
let id = 0
/** Each write's modification time, a second past the last, so a change shows on a clock coarser than the test. */
let clock = Date.now() / 1000

async function write(path: string, content: string) {
  const file = join(root, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
  clock += 1
  await utimes(file, clock, clock)
}

const components = { Button: { path: "src/button.tsx", export: "Button", as: "function" as const } }

/** The Button's prop names, as the worker's warm checker for the project reads them. */
function props(lockfiles: string[] = []): string[] {
  const found = answer({ id: ++id, kind: "props", root, components, lockfiles }) as Record<string, ComponentInfo>
  return (found.Button?.props ?? []).map((prop) => prop.name)
}

/** The same, from a checker made afresh, as a reopened project or a worker started again gets. */
function freshProps(lockfiles: string[] = []): string[] {
  answer({ id: ++id, kind: "close", root })
  return props(lockfiles)
}

beforeEach(async () => {
  root = (await mkdtemp(join(tmpdir(), "canvas-props-worker-"))).replaceAll("\\", "/")
  await write("package.json", '{ "name": "app" }')
  await write("a/props.ts", 'export interface ButtonProps { variant?: "primary" | "ghost" }')
  await write("b/props.ts", 'export interface ButtonProps { size?: "sm" | "lg" }')
})

afterEach(async () => {
  answer({ id: ++id, kind: "close", root })
  await rm(root, { recursive: true, force: true })
})

const tsconfig = (paths: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    ...extra,
    compilerOptions: { jsx: "react-jsx", strict: true, paths: { "@lib/*": [paths] } },
    include: ["src", "a", "b"]
  })

describe("the props worker after the project's config changes", () => {
  beforeEach(async () => {
    await write(
      "src/button.tsx",
      'import type { ButtonProps } from "@lib/props"\nexport function Button(props: ButtonProps) { return null }'
    )
  })

  it("reads an alias moved in the tsconfig the way a fresh checker does", async () => {
    await write("tsconfig.json", tsconfig("./a/*"))
    expect(props()).toEqual(["variant"])

    await write("tsconfig.json", tsconfig("./b/*"))
    const warm = props()
    expect(warm).toEqual(["size"])
    expect(freshProps()).toEqual(warm)
  })

  it("reads an alias moved in an extends base the way a fresh checker does", async () => {
    await write("tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json", include: ["src", "a", "b"] }))
    await write("tsconfig.base.json", tsconfig("./a/*"))
    expect(props()).toEqual(["variant"])

    await write("tsconfig.base.json", tsconfig("./b/*"))
    const warm = props()
    expect(warm).toEqual(["size"])
    expect(freshProps()).toEqual(warm)
  })

  it("follows a referenced config that changes", async () => {
    await write("tsconfig.json", JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }))
    await write("tsconfig.app.json", tsconfig("./a/*"))
    expect(props()).toEqual(["variant"])

    await write("tsconfig.app.json", tsconfig("./b/*"))
    const warm = props()
    expect(warm).toEqual(["size"])
    expect(freshProps()).toEqual(warm)
  })
})

describe("the props worker after the dependencies change", () => {
  const kit = (prop: string) => `export interface ButtonProps { ${prop}?: boolean }`

  beforeEach(async () => {
    await write("tsconfig.json", tsconfig("./a/*"))
    await write(
      "package-lock.json",
      '{ "lockfileVersion": 3, "packages": { "node_modules/kit": { "version": "1.0.0" } } }'
    )
    await write("node_modules/kit/package.json", '{ "name": "kit", "types": "index.d.ts" }')
    await write("node_modules/kit/index.d.ts", kit("tone"))
    await write(
      "src/button.tsx",
      'import type { ButtonProps } from "kit"\nexport function Button(props: ButtonProps) { return null }'
    )
  })

  it("reads installed declarations again when the lockfile changes, as a fresh checker does", async () => {
    const lockfiles = ["package-lock.json"]
    expect(props(lockfiles)).toEqual(["tone"])
    await write("node_modules/kit/index.d.ts", kit("pressed"))
    // Installed packages are read once per lockfile: a package changes by being installed, which changes the lockfile.
    expect(props(lockfiles)).toEqual(["tone"])

    await write(
      "package-lock.json",
      '{ "lockfileVersion": 3, "packages": { "node_modules/kit": { "version": "2.0.0" } } }'
    )
    const warm = props(lockfiles)
    expect(warm).toEqual(["pressed"])
    expect(freshProps(lockfiles)).toEqual(warm)
  })

  it("reads them again when a lockfile appears", async () => {
    expect(props()).toEqual(["tone"])
    await write("node_modules/kit/index.d.ts", kit("pressed"))
    await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
    expect(props(["pnpm-lock.yaml"])).toEqual(["pressed"])
  })
})
