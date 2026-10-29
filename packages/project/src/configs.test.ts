import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { findConfig, loadConfig } from "./configs.ts"

let root: string

/** Writes a fixture folder: each key a path under the root, each value its text or JSON. */
async function fixture(files: Record<string, unknown>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), typeof content === "string" ? content : JSON.stringify(content))
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-configs-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("findConfig", () => {
  const main = { files: ["main"], extensions: ["ts", "mts", "cts", "js", "mjs", "cjs"], here: true }

  it.each(["main.ts", "main.mts", "main.cts", "main.js", "main.mjs", "main.cjs"])(
    "finds %s under any extension the tool accepts",
    async (name) => {
      await fixture({ [`.storybook/${name}`]: "export default {}\n" })
      expect(await findConfig(root, join(root, ".storybook"), main)).toBe(`.storybook/${name}`)
    }
  )

  it("stays in the folder when asked, and otherwise looks up", async () => {
    await fixture({ "main.ts": "export default {}\n", "app/.examplerc": "{}" })
    expect(await findConfig(root, join(root, "app"), main)).toBeUndefined()
    expect(await findConfig(root, join(root, "app/src"), { files: [".examplerc"], extensions: ["", "json"] })).toBe(
      "app/.examplerc"
    )
  })

  it("counts a package.json key only when it's there", async () => {
    await fixture({ "package.json": { name: "app" } })
    const source = { files: ["example.config"], packageKey: "example", here: true }
    expect(await findConfig(root, root, source)).toBeUndefined()
    await fixture({ "package.json": { name: "app", example: { theme: "dark" } } })
    expect(await findConfig(root, root, source)).toBe("package.json")
    expect(await loadConfig(root, root, source)).toEqual({ path: "package.json", value: { theme: "dark" } })
  })
})

describe("loadConfig", () => {
  it("reads JSON with comments", async () => {
    await fixture({ "components.json": '{\n  // the stylesheet\n  "tailwind": { "css": "src/index.css" }\n}\n' })
    const source = { files: ["components"], extensions: ["json"], here: true, jsonc: true }
    expect(await loadConfig(root, root, source)).toEqual({
      path: "components.json",
      value: { tailwind: { css: "src/index.css" } }
    })
  })

  it("runs a TypeScript config, as the tool would", async () => {
    await fixture({ "example.config.ts": "const size: number = 2\nexport default { size }\n" })
    expect(await loadConfig(root, root, { files: ["example.config"], here: true })).toEqual({
      path: "example.config.ts",
      value: { size: 2 }
    })
  })

  it("says which config it couldn't load", async () => {
    await fixture({ "components.json": "{ broken" })
    const source = { files: ["components"], extensions: ["json"], here: true, jsonc: true }
    await expect(loadConfig(root, root, source)).rejects.toThrow(/^Couldn't load components: /)
  })
})
