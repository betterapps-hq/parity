import { describe, expect, it } from "vite-plus/test"
import { walkStyles } from "./app-styles.ts"
import type { BundlerCompilation, BundlerConnection, BundlerDependency, BundlerModule } from "./bundler.ts"
import { servedFile } from "./server.ts"

/** A compilation from its entries' files and each module's imports, `import()` ones marked with a leading `~`. */
function compilation(entries: string[], imports: Record<string, string[]>): BundlerCompilation {
  const modules = new Map<string, BundlerModule>()

  const module = (file: string) => {
    if (!modules.has(file)) {
      modules.set(file, { resource: file })
    }

    return modules.get(file)!
  }

  const connections: BundlerConnection[] = Object.entries(imports).flatMap(([from, files]) =>
    files.map((written) => {
      const file = written.replace(/^~/, "")

      return {
        originModule: module(from),
        module: module(file),
        dependency: { type: written.startsWith("~") ? "import()" : "esm import", request: file.split("/").at(-1) }
      }
    })
  )

  const dependencies = new Map<BundlerDependency, BundlerModule>(
    entries.map((file) => [{ type: "entry", request: file }, module(file)])
  )

  return {
    modules: modules.values(),
    entries: new Map([["main", { dependencies: [...dependencies.keys()] }]]),
    chunks: [],
    moduleGraph: {
      getIncomingConnections: (target) => connections.filter((connection) => connection.module === target),
      getOutgoingConnections: (origin) => connections.filter((connection) => connection.originModule === origin),
      getProvidedExports: () => null,
      getModule: (dependency) => dependencies.get(dependency) ?? null
    }
  }
}

describe("walkStyles", () => {
  it("finds the stylesheets the shallowest of the app's modules import, through a framework's modules", () => {
    const graph = compilation(["/app/node_modules/framework/client.js"], {
      "/app/node_modules/framework/client.js": ["/app/src/main.tsx"],
      "/app/src/main.tsx": ["/app/src/app.tsx", "/app/src/index.css", "/app/node_modules/react/index.js"],
      "/app/src/app.tsx": ["/app/src/app.css"]
    })

    expect(walkStyles(graph, "/app")).toEqual({
      found: [{ file: "/app/src/index.css", importer: "/app/src/main.tsx", depth: 1 }],
      read: ["/app/src/main.tsx"],
      specifiers: new Map([["/app/src/main.tsx\0index.css", "/app/src/index.css"]])
    })
  })

  it("leaves out CSS modules and what a page loads later", () => {
    const graph = compilation(["/app/src/main.tsx"], {
      "/app/src/main.tsx": ["/app/src/card.module.css", "~/app/src/page.tsx", "/app/src/root.tsx"],
      "/app/src/root.tsx": ["/app/src/theme.css"],
      "/app/src/page.tsx": ["/app/src/page.css"]
    })

    expect(walkStyles(graph, "/app").found).toEqual([
      { file: "/app/src/theme.css", importer: "/app/src/root.tsx", depth: 1 }
    ])
  })
})

describe("servedFile", () => {
  it("serves files in the output folder, and nothing outside it", () => {
    expect(servedFile("/out", "/main.js")?.replaceAll("\\", "/")).toMatch(/\/out\/main\.js$/)
    expect(servedFile("/out", "/../secret.txt")).toBeUndefined()
    expect(servedFile("/out", "/%2e%2e/secret.txt")).toBeUndefined()
    expect(servedFile("/out", "/")).toBeUndefined()
  })
})
