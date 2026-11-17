import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { generateLibrary } from "./index.ts"
import { buildkitStyles, presets } from "./presets.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/** A folder where shadcn-sync has built `@buildkitgg/shadcn`, as `syncedStyle` leaves one. */
async function syncedFolder(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "parity-synced-"))
  roots.push(root)
  const dir = join(root, "node_modules", "@buildkitgg", "shadcn")
  await mkdir(dir, { recursive: true })

  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@buildkitgg/shadcn",
      version: "0.2.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", import: "./index.js" }, "./tailwind.css": "./tailwind.css" }
    })
  )

  await writeFile(join(dir, "index.d.ts"), "export {}\n")
  await writeFile(join(dir, "index.js"), "export {}\n")
  await writeFile(join(dir, "tailwind.css"), ":root { --background: oklch(1 0 0); }\n")
  await writeFile(join(root, "shadcn-registry.json"), JSON.stringify({ style: "base-nova", shadcn: "4.23.0" }))

  return root
}

describe("a style shadcn-sync builds", () => {
  it("is generated with sync's settings for each of the eight styles", () => {
    for (const style of buildkitStyles) {
      expect(presets.get(`@buildkitgg/shadcn-baseui-${style}`)?.sync).toEqual({ base: "base", style })
    }
  })

  it("is described by its kit's name, with no range and sync's version", async () => {
    const root = await syncedFolder()

    const { manifest } = await generateLibrary({
      root,
      package: "@buildkitgg/shadcn",
      describedAs: "@buildkitgg/shadcn-baseui-nova",
      examples: false
    })

    expect(manifest.id).toBe("nova")
    expect(manifest.package).toEqual({ name: "@buildkitgg/shadcn-baseui-nova", version: "0.2.0" })
    expect(manifest.styles).toBe("tailwind.css")
    expect(manifest.decorators?.[0]).toEqual({
      wrap: { import: "@buildkitgg/shadcn-baseui-nova", component: "TooltipProvider" }
    })
  })

  it("keeps the tokens of the file it replaces, which describe them", async () => {
    const root = await syncedFolder()
    const tokens = { color: { background: { $type: "color", $value: "#ffffff", $description: "Page background." } } }

    const previous = {
      version: 4,
      id: "nova",
      name: "Shadcn Nova",
      package: { name: "@buildkitgg/shadcn-baseui-nova", version: "0.5.0", range: "^0.5.0" },
      tokens
    }

    const { manifest, report } = await generateLibrary({
      root,
      package: "@buildkitgg/shadcn",
      describedAs: "@buildkitgg/shadcn-baseui-nova",
      examples: false,
      previous
    })

    expect(manifest.tokens).toEqual(tokens)
    expect(report.notes).toContain(
      "Tokens are kept from the file it replaces; sync's stylesheet doesn't describe them."
    )
  })
})
