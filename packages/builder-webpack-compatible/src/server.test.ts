import { mkdtemp, rm, writeFile } from "node:fs/promises"
import type { Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { freePort, serveGuest } from "./server.ts"

let folder: string
let server: Server | undefined

afterEach(async () => {
  server?.closeAllConnections()
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()))
  await rm(folder, { recursive: true, force: true })
})

/** Serves a build folder with `main.js` in it, and the app's page, which `reload` tells to reload. */
async function served() {
  folder = await mkdtemp(join(tmpdir(), "parity-guest-server-"))
  await writeFile(join(folder, "main.js"), "window.main = true")
  const port = await freePort()
  const reloads = new Set<() => void>()

  server = await serveGuest({
    port,
    output: folder,
    allowedOrigins: ["*"],
    ready: () => Promise.resolve(),
    module: () => Promise.resolve(undefined),
    page: {
      html: () => Promise.resolve('<html><head></head><body><div id="root"></div></body></html>'),
      listen(reload) {
        reloads.add(reload)

        return () => reloads.delete(reload)
      }
    }
  })

  return { origin: `http://127.0.0.1:${port}`, reload: () => reloads.forEach((reload) => reload()), reloads }
}

describe("serveGuest", () => {
  it("serves the app's page at a route's path, and the build's files by name", async () => {
    const { origin } = await served()

    for (const path of ["/", "/settings", "/projects/42"]) {
      const page = await fetch(`${origin}${path}`)
      expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(await page.text()).toContain('<div id="root"></div>')
    }

    expect(await (await fetch(`${origin}/main.js`)).text()).toBe("window.main = true")
    expect((await fetch(`${origin}/missing.js`)).status).toBe(404)
  })

  it("tells an open page to reload, until it goes", async () => {
    const { origin, reload, reloads } = await served()
    const events = await fetch(`${origin}/@parity/page-events`)
    expect(events.headers.get("content-type")).toBe("text/event-stream")
    const reader = events.body!.getReader()
    const text = new TextDecoder()
    expect(text.decode((await reader.read()).value)).toBe(": listening\n\n")

    reload()
    expect(text.decode((await reader.read()).value)).toBe("data: reload\n\n")

    await reader.cancel()
    await expect.poll(() => reloads.size).toBe(0)
  })
})
