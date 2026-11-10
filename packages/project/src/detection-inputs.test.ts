import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { detectionInputs } from "./detection-inputs.ts"

let root: string

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
    const before = await detectionInputs(root)
    expect(before.files).toContain("components.json")

    await write("components.json", JSON.stringify({ tailwind: { css: "src/app/theme.css" } }))
    const after = await detectionInputs(root)

    expect(after.key).not.toBe(before.key)
    expect(await detectionInputs(root)).toEqual(after)
  })

  it("changes when a conventional stylesheet or a Vite config appears, and follows the entry index.html names", async () => {
    const before = await detectionInputs(root)
    expect(before.files).toEqual(expect.arrayContaining(["src/styles.css", "vite.config.ts"]))

    await write("src/styles.css", "@import 'tailwindcss';")
    const styled = await detectionInputs(root)
    expect(styled.key).not.toBe(before.key)

    await write("vite.config.ts", "export default {}")
    expect((await detectionInputs(root)).key).not.toBe(styled.key)

    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    expect((await detectionInputs(root)).files).toContain("src/main.tsx")
  })

  it("changes with the dependencies, not with the rest of package.json or a stylesheet's contents", async () => {
    await write("src/styles.css", ":root { --a: red; }")
    const before = await detectionInputs(root)

    await write(
      "package.json",
      JSON.stringify({ name: "app", scripts: { dev: "vite" }, dependencies: { react: "19.1.0" } })
    )
    await write("src/styles.css", ":root { --a: blue; }")
    expect((await detectionInputs(root)).key).toBe(before.key)

    await write(
      "package.json",
      JSON.stringify({ name: "app", dependencies: { react: "19.1.0", "@base-ui/react": "1" } })
    )
    expect((await detectionInputs(root)).key).not.toBe(before.key)
  })
})
