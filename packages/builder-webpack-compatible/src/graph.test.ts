import { describe, expect, it } from "vite-plus/test"
import type { BundlerCompilation, BundlerConnection, BundlerModule } from "./bundler.ts"
import { changedComponents, loadedFiles, providedExports } from "./graph.ts"

/** A compilation of modules by file, each importing the files listed with it. */
function compilation(
  imports: Record<string, string[]>,
  exports: Record<string, true | string[]> = {}
): BundlerCompilation {
  const modules = new Map<string, BundlerModule>(Object.keys(imports).map((file) => [file, { resource: file }]))

  const module = (file: string) => {
    if (!modules.has(file)) {
      modules.set(file, { resource: file })
    }

    return modules.get(file)!
  }

  const connections: BundlerConnection[] = Object.entries(imports).flatMap(([from, files]) =>
    files.map((file) => ({ originModule: module(from), module: module(file), dependency: { type: "esm import" } }))
  )

  return {
    modules: modules.values(),
    entries: new Map(),
    chunks: [],
    moduleGraph: {
      getIncomingConnections: (target) => connections.filter((connection) => connection.module === target),
      getOutgoingConnections: (origin) => connections.filter((connection) => connection.originModule === origin),
      getProvidedExports: (target) => exports[target.resource!] ?? null,
      getModule: () => null
    }
  }
}

const root = "/app"

describe("changedComponents", () => {
  it("gives the components a changed file reaches through their imports", () => {
    const graph = compilation({
      "/app/entry.js": ["/app/src/button.tsx", "/app/src/card.tsx"],
      "/app/src/button.tsx": ["/app/src/label.ts"],
      "/app/src/card.tsx": [],
      "/app/src/label.ts": []
    })

    expect(changedComponents(graph, root, ["/app/src/label.ts"], ["src/button.tsx", "src/card.tsx"])).toEqual([
      "src/button.tsx"
    ])
  })

  it("matches a changed file named with backslashes and component paths written with ./", () => {
    const graph = compilation({ "/app/src/button.tsx": [] })

    expect(changedComponents(graph, root, ["\\app\\src\\button.tsx"], ["./src/button.tsx"])).toEqual([
      "./src/button.tsx"
    ])
  })

  it("gives nothing for a file the build doesn't have", () => {
    expect(changedComponents(compilation({}), root, ["/app/src/other.ts"], ["src/button.tsx"])).toEqual([])
  })
})

describe("loadedFiles", () => {
  it("lists the project files a component loads, without packages", () => {
    const graph = compilation({
      "/app/src/button.tsx": ["/app/src/label.ts", "/app/node_modules/react/index.js"],
      "/app/src/label.ts": ["/app/src/button.css"]
    })

    expect(loadedFiles(graph, root, ["src/button.tsx"])).toEqual(["src/button.css", "src/button.tsx", "src/label.ts"])
  })

  it("can't say for a file the build hasn't reached", () => {
    expect(loadedFiles(compilation({}), root, ["src/button.tsx"])).toBeUndefined()
  })
})

describe("providedExports", () => {
  it("names a module's exports, and nothing where the bundler can't tell", () => {
    const graph = compilation(
      { "/app/src/button.tsx": [], "/app/src/legacy.js": [] },
      { "/app/src/button.tsx": ["Button", "default"], "/app/src/legacy.js": true }
    )

    expect(providedExports(graph, "/app/src/button.tsx")).toEqual(["Button", "default"])
    expect(providedExports(graph, "/app/src/legacy.js")).toBeUndefined()
  })
})
