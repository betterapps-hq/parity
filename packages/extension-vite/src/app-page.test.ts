import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { createServer as createHttpServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { PageModules } from "@parity-app/core"
import { createServer, normalizePath } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { appPageWraps, pageEntryPlace, pageFolders, serverPageEntry, wrappedImport } from "./app-page.ts"

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

const entry = '<script type="module" src="/@id/__x00__virtual:parity/page"></script>'

describe("pageEntryPlace", () => {
  it("puts the page entry just inside <head>, with or without attributes", () => {
    const plain = "<!DOCTYPE html><html><head><title>A</title>"
    const marked = '<html lang="en"><HEAD data-x="1"><meta>'

    expect(pageEntryPlace(plain)).toBe(plain.indexOf("<title>"))
    expect(pageEntryPlace(marked)).toBe(marked.indexOf("<meta>"))
  })

  it("waits while no <head> has come, and leaves a page that has the entry already", () => {
    expect(pageEntryPlace("<!DOCTYPE html><html><he")).toBe("later")
    expect(pageEntryPlace("<html><header>")).toBe("later")
    expect(pageEntryPlace(`<html><head>${entry}`)).toBe("none")
  })
})

describe("serverPageEntry", () => {
  /** What a server answering with `respond`, behind `serverPageEntry`, sends a page asking for HTML. */
  async function served(respond: (res: ServerResponse) => void, accept = "text/html"): Promise<string> {
    const server = createHttpServer((req, res) => serverPageEntry(req, res, () => respond(res)))
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

    try {
      // SAFETY: a server listening on a TCP port has an AddressInfo for its address.
      const { port } = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${port}/pricing`, { headers: { accept } })

      return await response.text()
    } finally {
      server.close()
    }
  }

  it("puts the entry in a server-rendered page streamed in pieces, as TanStack Start's on Cloudflare's is (PAR-1302)", async () => {
    const text = await served((res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.write("<!DOCTYPE html><html><he")
      res.write("ad><title>Ünïcode</title></head>")
      res.end("<body>Pricing</body></html>")
    })

    expect(text).toBe(`<!DOCTYPE html><html><head>${entry}<title>Ünïcode</title></head><body>Pricing</body></html>`)
  })

  it("drops a stated length the entry would make wrong", async () => {
    const page = "<html><head></head><body>Login</body></html>"

    const text = await served((res) => {
      res.writeHead(200, { "content-type": "text/html", "content-length": String(page.length) })
      res.end(page)
    })

    expect(text).toBe(`<html><head>${entry}</head><body>Login</body></html>`)
  })

  it("leaves what isn't HTML and a page with the entry already as they are", async () => {
    const json = await served((res) => {
      res.setHeader("content-type", "application/json")
      res.end('{"head":"<head>"}')
    })

    const marked = await served((res) => {
      res.setHeader("content-type", "text/html")
      res.end(`<html><head>${entry}</head></html>`)
    })

    expect(json).toBe('{"head":"<head>"}')
    expect(marked).toBe(`<html><head>${entry}</head></html>`)
  })

  it("leaves requests that don't ask for HTML alone", async () => {
    const text = await served((res) => {
      res.setHeader("content-type", "text/html")
      res.end("<html><head></head></html>")
    }, "*/*")

    expect(text).toBe("<html><head></head></html>")
  })
})
