import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createServer } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { dependencySourceMap, dependencySourceMaps } from "./dependency-maps.ts"
import { freePort } from "./index.ts"

describe("dependencySourceMap", () => {
  const cacheDir = "D:/app/node_modules/.vite-parity"

  it("links a prebundled dependency and its chunks to the maps beside them", () => {
    expect(dependencySourceMap(`${cacheDir}/deps/tldraw.js?v=1a2b3c4d`, cacheDir)).toEqual({ link: "tldraw.js.map" })
    expect(dependencySourceMap(`${cacheDir}/deps/react-BecEzR_s.js`, `${cacheDir}/`)).toEqual({
      link: "react-BecEzR_s.js.map"
    })
    expect(dependencySourceMap("D:\\app\\node_modules\\.vite-parity\\deps\\@base-ui_react.js", cacheDir)).toEqual({
      link: "@base-ui_react.js.map"
    })
  })

  it("serves another script from node_modules with no map", () => {
    expect(
      dependencySourceMap("D:/app/node_modules/.pnpm/vite@8.3.5/node_modules/vite/dist/client/client.mjs", cacheDir)
    ).toEqual({})
    expect(dependencySourceMap("D:/app/node_modules/.vite/deps/tldraw.js?v=1", cacheDir)).toEqual({})
  })

  it("leaves the app's own code, workspace packages, styles and virtual modules their maps", () => {
    for (const id of [
      "D:/app/src/components/ui/button.tsx",
      "D:/canvas/packages/renderer-react/src/guest.ts",
      "D:/node_modules_app/src/main.ts",
      `${cacheDir}/deps/_metadata.json`,
      "D:/app/node_modules/tldraw/tldraw.css",
      "\0virtual:canvas/guest"
    ]) {
      expect(dependencySourceMap(id, cacheDir)).toBeUndefined()
    }
  })
})

describe("dependencySourceMaps", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "parity-maps-"))
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ name: "fixture", type: "module" }),
      "main.js":
        'import { greeting } from "bundled"\nimport { plain } from "plain"\nexport const message = greeting + plain\n',
      "node_modules/bundled/package.json": JSON.stringify({ name: "bundled", type: "module", main: "index.js" }),
      "node_modules/bundled/index.js": 'export const greeting = "hello"\n',
      "node_modules/plain/package.json": JSON.stringify({ name: "plain", type: "module", main: "index.js" }),
      // No imports, so nothing else changes its code.
      "node_modules/plain/index.js": "export const plain = 1\n"
    }
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), content)
    }
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("links prebundled dependencies' maps, drops other dependencies' and keeps the app's inline", async () => {
    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      cacheDir: "node_modules/.vite-test",
      server: { host: "127.0.0.1", port: await freePort(), strictPort: true, hmr: false },
      optimizeDeps: { include: ["bundled"], exclude: ["plain"], noDiscovery: true },
      plugins: [dependencySourceMaps()]
    })
    await server.listen()
    try {
      const origin = server.resolvedUrls!.local[0]
      const get = async (url: string | URL) => {
        const response = await fetch(new URL(url, origin))
        expect(response.status).toBe(200)
        return response.text()
      }
      const main = await get("/main.js")
      expect(main).toContain("//# sourceMappingURL=data:application/json;base64,")

      const bundledUrl = new URL(main.match(/"(\/node_modules\/\.vite-test\/deps\/bundled\.js\?v=\w+)"/)![1], origin)
      const bundled = await get(bundledUrl)
      expect(bundled).toContain('"hello"')
      expect(bundled).not.toContain("sourceMappingURL=data:")
      expect(bundled.trimEnd().endsWith("//# sourceMappingURL=bundled.js.map")).toBe(true)
      const map = JSON.parse(await get(new URL("bundled.js.map", bundledUrl))) as { version: number; sources: string[] }
      expect(map.version).toBe(3)
      expect(map.sources.some((source) => source.endsWith("bundled/index.js"))).toBe(true)

      const plain = await get(main.match(/"(\/node_modules\/plain\/index\.js[^"]*)"/)![1])
      expect(plain).toContain("export const plain = 1")
      expect(plain).not.toContain("sourceMappingURL")
    } finally {
      await server.close()
    }
  }, 30_000)
})
