import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { detectionInputs } from "./detection-inputs.ts"

let root: string

/** The files the registered adapters watch, as `Adapter.watches` gives them. */
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
  it("changes with the stylesheets the builder says the app loads, and watches the files it read them from", async () => {
    const styles = { styles: ["src/style.css"], packageStyles: [], from: ["src/routes/__root.tsx"] }
    const before = await detectionInputs(root, builderConfigs, styles)
    expect(before.files).toEqual(["package.json", "src/routes/__root.tsx", ...builderConfigs])

    const more = { ...styles, packageStyles: ["@mantine/core/styles.css"] }
    expect((await detectionInputs(root, builderConfigs, more)).key).not.toBe(before.key)
    expect((await detectionInputs(root, builderConfigs)).key).not.toBe(before.key)
  })

  it("doesn't read components.json, a conventional stylesheet or index.html itself", async () => {
    const before = await detectionInputs(root, builderConfigs)
    await write("components.json", JSON.stringify({ tailwind: { css: "src/app/theme.css" } }))
    await write("src/index.css", "@import 'tailwindcss';")
    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    expect(await detectionInputs(root, builderConfigs)).toEqual(before)

    await write("vite.config.ts", "export default {}")
    expect((await detectionInputs(root, builderConfigs)).key).not.toBe(before.key)
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
    const styles = { styles: ["src/styles.css"], packageStyles: [], from: ["src/main.tsx"] }
    const before = await detectionInputs(root, builderConfigs, styles)

    await write(
      "package.json",
      JSON.stringify({ name: "app", scripts: { dev: "vite" }, dependencies: { react: "19.1.0" } })
    )
    await write("src/styles.css", ":root { --a: blue; }")
    expect((await detectionInputs(root, builderConfigs, styles)).key).toBe(before.key)

    await write(
      "package.json",
      JSON.stringify({ name: "app", dependencies: { react: "19.1.0", "@base-ui/react": "1" } })
    )
    expect((await detectionInputs(root, builderConfigs, styles)).key).not.toBe(before.key)
  })

  it("fails while package.json is missing or half-written, rather than reading as a change", async () => {
    await write("package.json", '{ "name": "ap')
    await expect(detectionInputs(root, builderConfigs)).rejects.toThrow("package.json")
    await rm(join(root, "package.json"))
    await expect(detectionInputs(root, builderConfigs)).rejects.toThrow("There's no package.json")
  })
})
