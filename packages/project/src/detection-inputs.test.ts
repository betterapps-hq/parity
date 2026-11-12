import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { detectionInputs } from "./detection-inputs.ts"

let root: string

/** The config files of the builders registered, as `BuilderAdapter.configFiles` gives them. */
const builderConfigs = ["vite.config.ts", "vite.config.mjs"]

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-detection-inputs-"))
  await write("package.json", JSON.stringify({ name: "app", dependencies: { react: "19.0.0" } }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("detectionInputs", () => {
  it("changes when components.json names a stylesheet in an app with no index.html", async () => {
    const before = await detectionInputs(root, builderConfigs)
    expect(before.files).toContain("components.json")

    await write("components.json", JSON.stringify({ tailwind: { css: "src/app/theme.css" } }))
    const after = await detectionInputs(root, builderConfigs)

    expect(after.key).not.toBe(before.key)
    expect(await detectionInputs(root, builderConfigs)).toEqual(after)
  })

  it("changes when a conventional stylesheet or a builder's config appears, and follows the entry index.html names", async () => {
    const before = await detectionInputs(root, builderConfigs)
    expect(before.files).toEqual(expect.arrayContaining(["src/styles.css", ...builderConfigs]))

    await write("src/styles.css", "@import 'tailwindcss';")
    const styled = await detectionInputs(root, builderConfigs)
    expect(styled.key).not.toBe(before.key)

    await write("vite.config.ts", "export default {}")
    expect((await detectionInputs(root, builderConfigs)).key).not.toBe(styled.key)

    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    expect((await detectionInputs(root, builderConfigs)).files).toContain("src/main.tsx")
  })

  it("follows whichever config files the builders name, and only those", async () => {
    const before = await detectionInputs(root, builderConfigs)
    await write("rsbuild.config.ts", "export default {}")
    expect((await detectionInputs(root, builderConfigs)).key).toBe(before.key)

    const withRsbuild = [...builderConfigs, "rsbuild.config.ts"]
    expect((await detectionInputs(root, withRsbuild)).files).toContain("rsbuild.config.ts")
    await rm(join(root, "rsbuild.config.ts"))
    const without = await detectionInputs(root, withRsbuild)
    await write("rsbuild.config.ts", "export default {}")
    expect((await detectionInputs(root, withRsbuild)).key).not.toBe(without.key)
  })

  it("changes with the dependencies, not with the rest of package.json or a stylesheet's contents", async () => {
    await write("src/styles.css", ":root { --a: red; }")
    const before = await detectionInputs(root, builderConfigs)

    await write(
      "package.json",
      JSON.stringify({ name: "app", scripts: { dev: "vite" }, dependencies: { react: "19.1.0" } })
    )
    await write("src/styles.css", ":root { --a: blue; }")
    expect((await detectionInputs(root, builderConfigs)).key).toBe(before.key)

    await write(
      "package.json",
      JSON.stringify({ name: "app", dependencies: { react: "19.1.0", "@base-ui/react": "1" } })
    )
    expect((await detectionInputs(root, builderConfigs)).key).not.toBe(before.key)
  })

  it("fails while package.json is missing or half-written, rather than reading as a change", async () => {
    await write("package.json", '{ "name": "ap')
    await expect(detectionInputs(root, builderConfigs)).rejects.toThrow("package.json")
    await rm(join(root, "package.json"))
    await expect(detectionInputs(root, builderConfigs)).rejects.toThrow("There's no package.json")
  })

  it("fails while components.json is half-written, though one that isn't there is no failure", async () => {
    const before = await detectionInputs(root, builderConfigs)
    await write("components.json", '{ "tailwind": { "css": "src/sty')
    await expect(detectionInputs(root, builderConfigs)).rejects.toThrow("Couldn't load components")
    await rm(join(root, "components.json"))
    expect((await detectionInputs(root, builderConfigs)).key).toBe(before.key)
  })
})
