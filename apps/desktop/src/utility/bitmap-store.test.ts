import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { RenderJob } from "../shared/protocol.ts"
import type * as BitmapStore from "./bitmap-store.ts"

let folder: string
let store: typeof BitmapStore

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-bitmaps-"))
  vi.stubEnv("PARITY_BITMAP_DIR", folder)
  vi.resetModules()
  store = await import("./bitmap-store.ts")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(folder, { recursive: true, force: true })
})

const job = (guestUrl: string, text = "Sign in"): RenderJob => ({
  projectId: "D:/shop",
  guestUrl,
  theme: [],
  tree: [{ nodeId: "a", type: "text", text }] as unknown as RenderJob["tree"],
  mode: { width: 320, height: 200, viewport: { width: 320, height: 200 } } as RenderJob["mode"],
  scale: 0.25
})
/** What a guest's address was served: its code, and the components it was served with. */
const code = (fingerprint: string, sources: Record<string, { path: string; export: string }> = {}) => ({
  fingerprint: Promise.resolve(fingerprint),
  sources
})

/** A PNG of one transparent pixel, as base64. */
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

describe("the frame bitmap store", () => {
  it("gives back a kept bitmap and its frame's height for the same job and code, from another address", async () => {
    await store.storeBitmap(code("code-1"), job("http://localhost:5001"), png, 812.5)
    // A project opened again serves its guest at a new address, which isn't what the bitmap shows.
    const kept = await store.storedBitmap(code("code-1"), job("http://localhost:5002"))
    expect(kept?.height).toBe(812.5)
    // The height is kept inside the PNG, which still begins as one.
    expect(Buffer.from(kept!.png, "base64").subarray(0, 8)).toEqual(Buffer.from(png, "base64").subarray(0, 8))
  })

  it("finds a bitmap whose guest was given a component in a session whose guest was served it", async () => {
    const card = { path: "src/card.tsx", export: "Card" }
    const drawsCard = (guestUrl: string, components?: RenderJob["components"]): RenderJob => ({
      ...job(guestUrl),
      tree: [{ kind: "component", nodeId: "a", component: "Card", props: {}, slots: {} }],
      ...(components ? { components } : {})
    })
    // The first session's type checker found Card after the guest loaded, so its jobs gave it to the guest.
    await store.storeBitmap(code("code-1"), drawsCard("http://localhost:5001", { Card: card }), png, 100)
    // The next session's guest is served it from the start.
    expect(await store.storedBitmap(code("code-1", { Card: card }), drawsCard("http://localhost:5002"))).toBeDefined()
    // Served from another file, it's another bitmap.
    const moved = code("code-1", { Card: { path: "src/cards.tsx", export: "Card" } })
    expect(await store.storedBitmap(moved, drawsCard("http://localhost:5002"))).toBeUndefined()
  })

  it("has none for a file without its frame's height, as an earlier version kept", async () => {
    await store.storeBitmap(code("code-1"), job("http://localhost:5001"), png, 100)
    const [project] = await readdir(folder)
    const [name] = await readdir(join(folder, project!))
    await writeFile(join(folder, project!, name!), Buffer.from(png, "base64"))
    expect(await store.storedBitmap(code("code-1"), job("http://localhost:5001"))).toBeUndefined()
  })

  it("has none for other code or another frame", async () => {
    await store.storeBitmap(code("code-1"), job("http://localhost:5001"), png, 100)
    expect(await store.storedBitmap(code("code-2"), job("http://localhost:5001"))).toBeUndefined()
    expect(await store.storedBitmap(code("code-1"), job("http://localhost:5001", "Sign up"))).toBeUndefined()
  })

  it("leaves no partial file behind a write", async () => {
    await store.storeBitmap(code("code-1"), job("http://localhost:5001"), png, 100)
    const [project] = await readdir(folder)
    const names = await readdir(join(folder, project!))
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^[0-9a-f]{40}\.png$/)
  })

  it("sweeps away a project not used for over 30 days, and a partial file a write left", async () => {
    await store.storeBitmap(code("code-1"), job("http://localhost:5001"), png, 100)
    const [project] = await readdir(folder)
    const [name] = await readdir(join(folder, project!))
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    await utimes(join(folder, project!, name!), old, old)
    await writeFile(join(folder, project!, "left.png.1.x.partial"), "x")
    await utimes(join(folder, project!, "left.png.1.x.partial"), old, old)
    await store.sweepBitmaps()
    expect(await readdir(folder)).toEqual([])
  })

  it("keeps nothing once cleared", async () => {
    await store.storeBitmap(code("code-1"), job("http://localhost:5001"), png, 100)
    await store.clearBitmaps()
    expect(await store.storedBitmap(code("code-1"), job("http://localhost:5001"))).toBeUndefined()
  })
})
