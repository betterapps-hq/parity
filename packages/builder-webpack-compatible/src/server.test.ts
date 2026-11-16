import { mkdtemp, rm, writeFile } from "node:fs/promises"
import type { Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { freePort, serveGuest } from "./server.ts"

let folder: string
let server: Server | undefined

afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()))
  await rm(folder, { recursive: true, force: true })
})

/** Serves a build folder with `main.js` in it, and the app's page, at the build count `builds` gives. */
async function served() {
  folder = await mkdtemp(join(tmpdir(), "parity-guest-server-"))
  await writeFile(join(folder, "main.js"), "window.main = true")
  const port = await freePort()
  const builds = { changed: 0 }

  server = await serveGuest({
    port,
    output: folder,
    allowedOrigins: ["*"],
    ready: () => Promise.resolve(),
    module: () => Promise.resolve(undefined),
    page: {
      html: () => Promise.resolve('<html><head></head><body><div id="root"></div></body></html>'),
      version: () => builds.changed
    }
  })

  return { origin: `http://127.0.0.1:${port}`, builds }
}

/** How a frame loads a page, as Chromium says. */
const frameLoad = { headers: { "Sec-Fetch-Dest": "iframe", Accept: "text/html,*/*" } }

describe("serveGuest", () => {
  it("serves the app's page where a frame loads a route's path, a dot in its last part or not", async () => {
    const { origin } = await served()

    for (const path of ["/", "/settings", "/projects/42", "/users/alice.smith"]) {
      const page = await fetch(`${origin}${path}`, frameLoad)
      expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(await page.text()).toContain('<div id="root"></div>')
    }

    expect((await fetch(`${origin}/reports/v1.2`, { headers: { Accept: "text/html" } })).status).toBe(200)
  })

  it("serves the build's files by name, and a missing script as missing", async () => {
    const { origin } = await served()

    expect(await (await fetch(`${origin}/main.js`, frameLoad)).text()).toBe("window.main = true")
    expect((await fetch(`${origin}/missing.js`, { headers: { "Sec-Fetch-Dest": "script" } })).status).toBe(404)
    expect((await fetch(`${origin}/settings`)).status).toBe(404)
  })

  it("says how many builds have changed something, for a page to reload when it grows", async () => {
    const { origin, builds } = await served()
    expect(await (await fetch(`${origin}/@parity/page-version`)).text()).toBe("0")

    builds.changed = 2
    expect(await (await fetch(`${origin}/@parity/page-version`)).text()).toBe("2")
  })
})
