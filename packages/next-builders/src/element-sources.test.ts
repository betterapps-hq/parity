import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vite-plus/test"
import {
  elementSourcesConfigFile,
  elementSourcesConfigSource,
  elementSourcesLoaderFile,
  elementSourcesLoaderSource,
  taggedNextSource
} from "./element-sources.ts"
import { guestAppFiles } from "./guest-app.ts"

const root = join(tmpdir(), "shop")
const card = 'export function Card() {\n  return <section className="card" />\n}\n'

describe("the project's JSX tagged for Next", () => {
  it("tags the project's own JSX with its path from the root", () => {
    const tagged = taggedNextSource(root, join(root, "src/components/Card.tsx"), card)

    expect(tagged?.code).toContain('data-parity-source={"src/components/Card.tsx:2:10"}')
    expect(tagged?.map.sources).toEqual(["src/components/Card.tsx"])
  })

  it("leaves packages, files outside the project, the guest app's own and modules that aren't JSX alone", () => {
    expect(taggedNextSource(root, join(root, "node_modules/ui/Card.tsx"), card)).toBeUndefined()
    expect(taggedNextSource(root, join(root, "../other/Card.tsx"), card)).toBeUndefined()
    expect(taggedNextSource(root, join(root, ".next/parity/app/(project)/page.tsx"), card)).toBeUndefined()
    expect(taggedNextSource(root, join(root, "src/lib/util.ts"), card)).toBeUndefined()
  })

  it("is in the guest app, whose config runs the loader first on JSX, after the project's own rules and hook", async () => {
    const files = guestAppFiles({
      root: "D:/work/app",
      next: "D:/work/app/node_modules/next",
      origin: "http://127.0.0.1:4000",
      guestSource: "",
      styles: [],
      packageStyles: []
    })

    expect(files.find((file) => file.path === elementSourcesLoaderFile)?.text).toBe(elementSourcesLoaderSource)
    expect(files.find((file) => file.path === "next.config.mjs")?.text).toContain(
      "rulesWithElementSources(rulesWithTailwindBase(project.turbopack?.rules))"
    )

    const folder = await mkdtemp(join(tmpdir(), "parity-element-sources-"))
    const module = join(folder, elementSourcesConfigFile)
    await writeFile(module, elementSourcesConfigSource("http://127.0.0.1:4000"))
    const { rulesWithElementSources, webpackWithElementSources } = await import(pathToFileURL(module).href)

    const loader = {
      loader: join(folder, elementSourcesLoaderFile),
      options: { endpoint: "http://127.0.0.1:4000/__parity/element-sources" }
    }

    expect(rulesWithElementSources({ "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" } })).toEqual({
      "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" },
      "*.tsx": { loaders: [loader] },
      "*.jsx": { loaders: [loader] }
    })
    // Loaders run last to first, so the tagger, last, sees the project's JSX before the project's own loader compiles it.
    expect(rulesWithElementSources({ "*.tsx": { loaders: ["own-loader"] } })["*.tsx"]).toEqual({
      loaders: ["own-loader", loader]
    })

    const conditioned = [
      { condition: "browser", loaders: ["browser-loader"] },
      { condition: { not: "browser" }, loaders: [] }
    ]

    expect(rulesWithElementSources({ "*.jsx": conditioned })["*.jsx"]).toEqual([
      { condition: "browser", loaders: ["browser-loader", loader] },
      { condition: { not: "browser" }, loaders: [loader] }
    ])

    const config = { module: { rules: [{ test: "own" }] } }
    const hooked = webpackWithElementSources((given: typeof config) => given)(config, {})

    expect(hooked.module.rules[0]).toMatchObject({ enforce: "pre", use: [loader] })
    expect(hooked.module.rules[1]).toEqual({ test: "own" })
  })
})
