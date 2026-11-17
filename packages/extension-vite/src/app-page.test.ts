import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { PageModules } from "@parity-app/core"
import { createServer, normalizePath } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { appPageWraps, pageFolders, wrappedImport } from "./app-page.ts"

const wrapper = "/parity/page/react-router--react-router.mjs"

const modules: PageModules = {
  runtime: "/parity/page-runtime.mjs",
  routers: [{ extension: "react-router", file: "/parity/page/react-router.mjs", export: "reactRouterPage" }],
  hydration: [],
  wraps: [{ extension: "react-router", package: "react-router", file: wrapper }]
}

const wraps = modules.wraps ?? []
const asIs = (path: string) => path

describe("wrappedImport", () => {
  it("serves a wrapped package to the app's own modules through Parity's module (PAR-1265)", () => {
    expect(wrappedImport("react-router", "/app/src/main.tsx", wraps, asIs)).toEqual({ file: wrapper })
    expect(wrappedImport("react-router", "/app/src/routes.tsx?v=3", wraps, asIs)).toEqual({ file: wrapper })
    expect(wrappedImport("react-router-dom", "/app/src/main.tsx", wraps, asIs)).toBeUndefined()
  })

  it("leaves packages' own imports of a wrapped package alone", () => {
    expect(wrappedImport("react-router", "/app/node_modules/some-library/index.js", wraps, asIs)).toBeUndefined()
  })

  it("sends the wrapping module's own import to the app's copy", () => {
    expect(wrappedImport("react-router", wrapper, wraps, asIs)).toBe("app")
  })

  it("wraps nothing without wrapped packages, as before the builder has the project's config", () => {
    expect(wrappedImport("react-router", "/app/src/main.tsx", [], asIs)).toBeUndefined()
  })
})

describe("pageFolders", () => {
  it("lets the server serve the wrapping modules' folders too", () => {
    expect(pageFolders(modules)).toEqual(["/parity", "/parity/page"])
  })
})

describe("appPageWraps", () => {
  let folder: string

  beforeEach(async () => {
    // The real path: Windows runners' tmpdir can use a short (8.3) name, which crashes libuv's watcher.
    folder = await realpath(await mkdtemp(join(tmpdir(), "parity-wraps-")))

    const files = {
      "app/package.json": JSON.stringify({ name: "fixture", type: "module" }),
      "app/main.js": 'import { createBrowserRouter } from "react-router"\nexport default createBrowserRouter\n',
      "app/node_modules/react-router/package.json": JSON.stringify({
        name: "react-router",
        type: "module",
        main: "index.js"
      }),
      "app/node_modules/react-router/index.js": "export const createBrowserRouter = () => ({})\n",
      "parity/wrap.js": 'export * from "react-router"\n'
    }

    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(folder, path)), { recursive: true })
      await writeFile(join(folder, path), content)
    }
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it("runs before Vite's own resolver, so the app's import reaches the wrapper and the wrapper the app's copy", async () => {
    const wrapper = normalizePath(join(folder, "parity/wrap.js"))
    const root = normalizePath(join(folder, "app"))

    const given: PageModules = {
      runtime: join(folder, "parity/page-runtime.js"),
      routers: [],
      hydration: [],
      wraps: [{ extension: "react-router", package: "react-router", file: wrapper }]
    }

    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
      plugins: [appPageWraps(() => given, normalizePath)]
    })

    try {
      const resolve = (id: string, importer: string) =>
        server.environments.client.pluginContainer.resolveId(id, importer)

      expect((await resolve("react-router", `${root}/main.js`))?.id).toBe(wrapper)
      expect((await resolve("react-router", wrapper))?.id).toBe(`${root}/node_modules/react-router/index.js`)
    } finally {
      await server.close()
    }
  }, 30_000)
})
