import { mkdir, mkdtemp, rm, stat, unlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { reactFinder } from "./finder.ts"
import { type ProgramCache, programCache } from "./program-cache.ts"

let root: string

/** Each test's cache. Memory is reported as plentiful, so the tests don't depend on the machine they run on. */
let programs: ProgramCache

/** Each write's modification time, a second past the last, so a change shows on a clock coarser than the test. */
let clock = Date.now() / 1000

async function write(path: string, content: string, base = root) {
  const file = join(base, path)
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

/** The Button's prop names, as the project's warm program reads them. */
function props(lockfiles: string[] = []): string[] {
  const found = programs.props({ root, components, lockfiles })

  return (found.Button?.props ?? []).map((prop) => prop.name)
}

/** The same, from a program made afresh, as a reopened project or a worker started again gets. */
function freshProps(lockfiles: string[] = []): string[] {
  programs.close(root)

  return props(lockfiles)
}

beforeEach(async () => {
  root = (await mkdtemp(join(tmpdir(), "parity-program-cache-"))).replaceAll("\\", "/")
  programs = programCache(reactFinder, { freeMb: () => 8 * 1024 })
  await write("package.json", '{ "name": "app" }')
  await write("a/props.ts", 'export interface ButtonProps { variant?: "primary" | "ghost" }')
  await write("b/props.ts", 'export interface ButtonProps { size?: "sm" | "lg" }')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const tsconfig = (paths: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    ...extra,
    compilerOptions: { jsx: "react-jsx", strict: true, paths: { "@lib/*": [paths] } },
    include: ["src", "a", "b"]
  })

describe(
  "a project's program",
  () => {
    const files = ["src/button.tsx"]

    beforeEach(async () => {
      await write("tsconfig.json", tsconfig("./a/*"))
      await write(
        "src/button.tsx",
        'import type { ButtonProps } from "@lib/props"\nexport function Button(props: ButtonProps) { return null }'
      )
    })

    it("is reused while its files, config and lockfiles are unchanged", () => {
      const first = programs.program({ root, files, lockfiles: [] })
      expect(programs.program({ root, files, lockfiles: [] })).toBe(first)
      expect(programs.check({ root, files, lockfiles: [] }).components.map((found) => found.name)).toEqual(["Button"])
      expect(programs.program({ root, files, lockfiles: [] })).toBe(first)
    })

    it("is made again when a file it read changes", async () => {
      const first = programs.program({ root, files, lockfiles: [] })
      await write("a/props.ts", 'export interface ButtonProps { tone?: "loud" }')
      expect(programs.program({ root, files, lockfiles: [] })).not.toBe(first)
      expect(props()).toEqual(["tone"])
    })

    it("is made again when a request asks for a file it hasn't read", async () => {
      const first = programs.program({ root, files, lockfiles: [] })
      await write("src/card.tsx", "export function Card() { return null }")
      const next = programs.program({ root, files: ["src/card.tsx"], lockfiles: [] })
      expect(next).not.toBe(first)
      expect(next.getSourceFile(`${root}/src/button.tsx`)).toBeDefined()
    })

    it("is made again when the config changes", async () => {
      const first = programs.program({ root, files, lockfiles: [] })
      await write("tsconfig.json", tsconfig("./b/*"))
      expect(programs.program({ root, files, lockfiles: [] })).not.toBe(first)
    })

    it("is made again when a lockfile changes", async () => {
      await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
      const first = programs.program({ root, files, lockfiles: ["pnpm-lock.yaml"] })
      await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n\nimporters: {}\n")
      expect(programs.program({ root, files, lockfiles: ["pnpm-lock.yaml"] })).not.toBe(first)
    })

    it("isn't built when too little memory is free", () => {
      const starved = programCache(reactFinder, { freeMb: () => 100 })
      expect(() => starved.program({ root, files, lockfiles: [] })).toThrow(/100 MB of memory is free/)
    })
  },
  programTimeout
)

describe(
  "the projects a cache keeps",
  () => {
    const others: string[] = []

    afterEach(async () => {
      for (const other of others.splice(0)) {
        await rm(other, { recursive: true, force: true })
      }
    })

    async function project(): Promise<string> {
      const dir = (await mkdtemp(join(tmpdir(), "parity-program-cache-"))).replaceAll("\\", "/")
      others.push(dir)
      await write("src/button.tsx", "export function Button() { return null }", dir)

      return dir
    }

    it("let the least recently used go past the limit", async () => {
      const [first, second, third] = [await project(), await project(), await project()]
      const files = ["src/button.tsx"]
      programs.program({ root: first, files, lockfiles: [] })
      programs.program({ root: second, files, lockfiles: [] })
      programs.program({ root: first, files, lockfiles: [] })
      expect(programs.roots()).toEqual([first, second])

      programs.program({ root: third, files, lockfiles: [] })
      expect(programs.roots()).toEqual([third, first])
    })

    it("let a closed project go", async () => {
      const other = await project()
      programs.program({ root: other, files: ["src/button.tsx"], lockfiles: [] })
      programs.close(other)
      expect(programs.roots()).toEqual([])
    })
  },
  programTimeout
)

describe(
  "a project's program after its config changes",
  () => {
    beforeEach(async () => {
      await write(
        "src/button.tsx",
        'import type { ButtonProps } from "@lib/props"\nexport function Button(props: ButtonProps) { return null }'
      )
    })

    it("reads an alias moved in the tsconfig the way a fresh program does", async () => {
      await write("tsconfig.json", tsconfig("./a/*"))
      expect(props()).toEqual(["variant"])

      await write("tsconfig.json", tsconfig("./b/*"))
      const warm = props()
      expect(warm).toEqual(["size"])
      expect(freshProps()).toEqual(warm)
    })

    it("reads an alias moved in an extends base the way a fresh program does", async () => {
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

    it("reads a referenced config deleted, asked about, then restored the way a fresh program does", async () => {
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

    it("reads a tsconfig deleted, asked about, then restored the way a fresh program does", async () => {
      await write("tsconfig.json", tsconfig("./a/*"))
      expect(props()).toEqual(["variant"])

      await unlink(join(root, "tsconfig.json"))
      expect(props()).toEqual(freshProps())
      await write("tsconfig.json", tsconfig("./b/*"))
      const warm = props()
      expect(warm).toEqual(["size"])
      expect(freshProps()).toEqual(warm)
    })

    it("reads a tsconfig added to a project without one the way a fresh program does", async () => {
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
  "a project's program after the dependencies change",
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

    it("reads installed declarations again when the lockfile changes, as a fresh program does", async () => {
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
