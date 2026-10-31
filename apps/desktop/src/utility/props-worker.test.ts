import { mkdir, mkdtemp, rm, stat, unlink, utimes, writeFile } from "node:fs/promises"
import type * as Os from "node:os"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { ComponentInfo } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { answer } from "./props-worker.ts"

// The worker won't build a program below a gigabyte of free memory, and a CI runner (macOS counts cached memory as
// used) can report less, which would make these tests depend on the machine. These projects are a few files.
vi.mock("node:os", async (original) => ({
  ...(await original<typeof Os>()),
  freemem: () => 8 * 2 ** 30
}))

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

/** Rewrites a file and puts its modification time back, as a write within one tick of a coarse clock leaves it. */
async function rewriteInSameTick(path: string, content: string) {
  const file = join(root, path)
  const { atime, mtime } = await stat(file)
  await writeFile(file, content)
  await utimes(file, atime, mtime)
}

/** Every test builds TypeScript programs, each a second or so, more on a busy machine. */
const programTimeout = 30_000

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

describe(
  "the props worker after the project's config changes",
  () => {
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

    it("reads a referenced config deleted, asked about, then restored the way a fresh checker does", async () => {
      await write("tsconfig.json", JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }))
      await write("tsconfig.app.json", tsconfig("./a/*"))
      expect(props()).toEqual(["variant"])

      await unlink(join(root, "tsconfig.app.json"))
      expect(props()).toEqual(freshProps())
      await write("tsconfig.app.json", tsconfig("./b/*"))
      const warm = props()
      expect(warm).toEqual(["size"])
      expect(freshProps()).toEqual(warm)
    })

    it("reads a tsconfig deleted, asked about, then restored the way a fresh checker does", async () => {
      await write("tsconfig.json", tsconfig("./a/*"))
      expect(props()).toEqual(["variant"])

      await unlink(join(root, "tsconfig.json"))
      expect(props()).toEqual(freshProps())
      await write("tsconfig.json", tsconfig("./b/*"))
      const warm = props()
      expect(warm).toEqual(["size"])
      expect(freshProps()).toEqual(warm)
    })

    it("reads a tsconfig added to a project without one the way a fresh checker does", async () => {
      const before = props()
      expect(before).not.toContain("size")

      await write("tsconfig.json", tsconfig("./b/*"))
      const warm = props()
      expect(warm).toEqual(["size"])
      expect(freshProps()).toEqual(warm)
    })

    it("sees a tsconfig rewritten within one tick of the clock", async () => {
      await write("tsconfig.json", tsconfig("./a/*"))
      expect(props()).toEqual(["variant"])

      await rewriteInSameTick("tsconfig.json", tsconfig("./b/*"))
      expect(props()).toEqual(["size"])
    })
  },
  programTimeout
)

describe(
  "the props worker after the dependencies change",
  () => {
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

    it("sees a lockfile rewritten within one tick of the clock, at the same size", async () => {
      const lockfiles = ["package-lock.json"]
      expect(props(lockfiles)).toEqual(["tone"])
      await write("node_modules/kit/index.d.ts", kit("pressed"))

      await rewriteInSameTick(
        "package-lock.json",
        '{ "lockfileVersion": 3, "packages": { "node_modules/kit": { "version": "2.0.0" } } }'
      )
      expect(props(lockfiles)).toEqual(["pressed"])
    })
  },
  programTimeout
)
