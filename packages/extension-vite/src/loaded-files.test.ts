import { describe, expect, it } from "vite-plus/test"
import { type LoadedGraph, loadedFiles, type LoadedModule } from "./loaded-files.ts"

const root = "/work/shop"

/** A module graph from each file's imports, by URL; a file can have several modules, as `styles.css?inline` does. */
function graph(imports: Record<string, string[]>, extra: Record<string, string> = {}) {
  const modules = new Map<string, LoadedModule & { url: string }>()

  for (const url of [...Object.keys(imports), ...Object.keys(extra)]) {
    const file = extra[url] ?? `${root}${url}`
    modules.set(url, { url, file, staticImportedUrls: new Set(imports[url] ?? []) })
  }

  const loaded: LoadedGraph<LoadedModule & { url: string }> = {
    getModulesByFile(file) {
      const found = new Set([...modules.values()].filter((module) => module.file === file))

      return found.size > 0 ? found : undefined
    },
    getModuleByUrl: (url) => Promise.resolve(modules.get(url))
  }

  return loaded
}

describe("loadedFiles", () => {
  it("gives every project file a component loads, however deep, once each, sorted", async () => {
    const files = graph({
      "/src/button.tsx": ["/src/lib/utils.ts", "/src/icons.tsx"],
      "/src/icons.tsx": ["/src/lib/utils.ts"],
      "/src/lib/utils.ts": [],
      "/src/unused.tsx": []
    })

    expect(await loadedFiles(files, root, ["src/button.tsx"])).toEqual([
      "src/button.tsx",
      "src/icons.tsx",
      "src/lib/utils.ts"
    ])
  })

  it("leaves out packages and files outside the project, which the lockfile stands for", async () => {
    const files = graph(
      { "/src/button.tsx": ["/node_modules/.vite/deps/react.js", "/@fs/work/kit/card.tsx"] },
      {
        "/node_modules/.vite/deps/react.js": `${root}/node_modules/.vite/deps/react.js`,
        "/@fs/work/kit/card.tsx": "/work/kit/card.tsx"
      }
    )

    expect(await loadedFiles(files, root, ["src/button.tsx"])).toEqual(["src/button.tsx"])
  })

  it("follows a cycle without going round it again", async () => {
    const files = graph({ "/src/a.tsx": ["/src/b.tsx"], "/src/b.tsx": ["/src/a.tsx"] })
    expect(await loadedFiles(files, root, ["src/a.tsx"])).toEqual(["src/a.tsx", "src/b.tsx"])
  })

  it("can't say for a file Vite hasn't built", async () => {
    const files = graph({ "/src/button.tsx": [] })
    expect(await loadedFiles(files, root, ["src/button.tsx", "src/lazy.tsx"])).toBeUndefined()
  })
})
