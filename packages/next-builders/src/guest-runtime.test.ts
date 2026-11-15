import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { copyGuestRuntime, replaceSpecifier } from "./guest-runtime.ts"

let root: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-next-runtime-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function write(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

describe("the renderer's runtime, copied into the guest app", () => {
  it("changes an import's specifier wherever a static, dynamic or re-export names it, and nothing else", () => {
    const source = [
      'import { a } from "./a.ts"',
      "export * from './a.ts'",
      'const lazy = import("./a.ts")',
      'import "./a.ts"',
      'const text = "./a.ts"'
    ].join("\n")

    expect(replaceSpecifier(source, "./a.ts", "./1-a.ts").split("\n")).toEqual([
      'import { a } from "./1-a.ts"',
      "export * from './1-a.ts'",
      'const lazy = import("./1-a.ts")',
      'import "./1-a.ts"',
      'const text = "./a.ts"'
    ])
  })

  it("follows its relative imports, leaves packages to the project, and gives it where the project is served", async () => {
    await write({
      "renderer/guest.ts": [
        'import { createElement } from "react"',
        'import { helper } from "./helper"',
        "export const base = new URL(import.meta.url).origin",
        "export { createElement, helper }"
      ].join("\n"),
      "renderer/helper.ts": 'export { deep } from "./nested/deep.ts"\nexport const helper = 1\n',
      "renderer/nested/deep.ts": "export const deep = 2\n"
    })

    const guestApp = join(root, "app/.next/parity")
    const entry = await copyGuestRuntime(join(root, "renderer/guest.ts"), guestApp, "http://127.0.0.1:4000/")
    const folder = join(guestApp, "renderer")

    expect(entry).toBe("renderer/0-guest.ts")
    expect((await readdir(folder)).sort()).toEqual(["0-guest.ts", "1-helper.ts", "2-deep.ts"])

    const guest = await readFile(join(folder, "0-guest.ts"), "utf8")
    expect(guest).toContain('import { createElement } from "react"')
    expect(guest).toContain('import { helper } from "./1-helper.ts"')
    expect(guest).toContain('new URL("http://127.0.0.1:4000/").origin')
    expect(await readFile(join(folder, "1-helper.ts"), "utf8")).toContain('from "./2-deep.ts"')
  })
})
