import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { BuilderSession, BuilderStartOptions, RendererAdapter, ServedRecord } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { viteBuilder } from "./index.ts"
import { moduleUrl } from "./served.ts"

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))

let root: string
let options: BuilderStartOptions

beforeEach(async () => {
  // The real path: macOS's tmpdir is under a /var link, and Windows runners' can use a short (8.3) name.
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-served-")))
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "fixture", type: "module" }),
    "guest.js": "export function createGuest(init) { return init }\n",
    "src/button.js": 'export const Button = () => "Save"\n'
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  await mkdir(join(root, "node_modules"))
  await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")
  options = {
    root,
    config: {
      styles: [],
      components: { Button: { path: "src/button.js", export: "Button" } },
      documents: [],
      libraries: []
    },
    renderer: { runtimePackages: [], runtimeImports: [] } as unknown as RendererAdapter,
    rendererGuestPath: join(root, "guest.js"),
    allowedOrigins: []
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Loads the guest and the button as a page would, then closes the builder and returns what it served. */
async function open(start: BuilderStartOptions, load = ["/src/button.js"]) {
  const session = await viteBuilder.start(start)
  const port = Number(new URL(session.guestUrl).port)
  for (const url of [session.guestUrl, ...load]) {
    const response = await fetch(new URL(url, session.guestUrl))
    expect(response.status).toBe(200)
    await response.text()
  }
  // Noted a little after each response is sent.
  const loaded = 1 + load.length
  await vi.waitFor(async () =>
    expect(Object.keys((await session.served!()).modules).length).toBeGreaterThanOrEqual(loaded)
  )
  return { session, port, close: () => closed(session) }
}

async function closed(session: BuilderSession): Promise<ServedRecord> {
  const served = await session.served!()
  await session.close()
  return JSON.parse(JSON.stringify(served)) as ServedRecord
}

describe("what the Vite builder served", () => {
  it("lists each module the pages loaded, the files it came from, and the files the whole build depends on", async () => {
    const first = await open(options)
    const record = await first.close()
    expect(Object.keys(record.modules)).toEqual(expect.arrayContaining(["\0virtual:canvas/guest", "/src/button.js"]))
    const button = join(root, "src/button.js").replaceAll("\\", "/")
    expect(record.modules["/src/button.js"]?.files).toEqual([button])
    expect(record.files[button]).toEqual({ mtime: expect.any(Number), size: 35 })
    expect(Object.keys(record.made)).toEqual(["virtual:canvas/guest"])
    expect(record.build).toContain(join(root, "package.json"))
    expect(record.build).toContain(join(root, "pnpm-lock.yaml"))
    expect(record.files[join(root, "pnpm-lock.yaml")]).toBeNull()
  }, 30_000)

  it("serves a reopened project on its last address when nothing it served has changed, and carries the record on", async () => {
    const first = await open(options)
    const record = await first.close()
    // The pages hold the button, so the next builder serves only what they hadn't loaded.
    const second = await open({ ...options, port: first.port, served: record }, [])
    expect(second.port).toBe(first.port)
    const carried = await second.close()
    expect(carried.modules["/src/button.js"]).toEqual(record.modules["/src/button.js"])
  }, 30_000)

  it("moves to a new address when a file the pages loaded has changed since", async () => {
    const first = await open(options)
    const record = await first.close()
    await writeFile(join(root, "src/button.js"), 'export const Button = () => "Save changes"\n')
    const second = await open({ ...options, port: first.port, served: record }, [])
    expect(second.port).not.toBe(first.port)
    await second.close()
  }, 30_000)

  it("moves to a new address when the guest would list other components", async () => {
    const first = await open(options)
    const record = await first.close()
    const config = { ...options.config, components: {} }
    const second = await open({ ...options, config, port: first.port, served: record }, [])
    expect(second.port).not.toBe(first.port)
    await second.close()
  }, 30_000)

  it("keeps its address when a file changed while open makes the same module again", async () => {
    const first = await open(options)
    const later = new Date(Date.now() + 5000)
    await utimes(join(root, "src/button.js"), later, later)
    const record = await first.close()
    const second = await open({ ...options, port: first.port, served: record }, [])
    expect(second.port).toBe(first.port)
    await second.close()
  }, 30_000)

  it("moves to a new address when a file changed while open makes a different module", async () => {
    const first = await open(options)
    await writeFile(join(root, "src/button.js"), 'export const Button = () => "Saved"\n')
    const record = await first.close()
    const second = await open({ ...options, port: first.port, served: record }, [])
    expect(second.port).not.toBe(first.port)
    await second.close()
  }, 30_000)
})

describe("moduleUrl", () => {
  it("reads a module named by id as Vite's graph names it", () => {
    expect(moduleUrl("/@id/__x00__virtual:canvas/guest")).toBe("\0virtual:canvas/guest")
    expect(moduleUrl("/@id/react")).toBe("react")
    expect(moduleUrl("/src/button.tsx?import")).toBe("/src/button.tsx?import")
  })
})
