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
  code: Promise.resolve({ fingerprint, files: new Map<string, string>(), salt: "" }),
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

/** The start of a PNG of a size, which is all the store reads of one. */
function png24(width: number, height: number): Buffer {
  const header = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write("IHDR", 12, "latin1")
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  return header
}

const key = "a".repeat(40)
const newer = "b".repeat(40)
const pictures = () => ({ thumb: png24(240, 40), large: png24(600, 100) })

describe("the component preview store", () => {
  it("gives a preview's pictures as parity-preview addresses, with the large one's size", async () => {
    await store.storePreview("D:/shop", "ui/Button", { key }, pictures(), { width: 600, height: 100 })
    const image = await store.storedPreview("D:/shop", key)
    expect(image).toEqual({
      thumb: expect.stringMatching(new RegExp(`^parity-preview://[0-9a-f]{24}/${key}-thumb[.]png$`)),
      large: expect.stringMatching(new RegExp(`^parity-preview://[0-9a-f]{24}/${key}-large[.]png$`)),
      width: 600,
      height: 100
    })
  })

  it("keeps pictures and the index across a restart, so a reopen finds them without drawing", async () => {
    await store.storePreview("D:/shop", "ui/Button", { key }, pictures(), { width: 600, height: 100 })
    await store.storePreview("D:/shop", "ui/Card", { key: newer, error: "Card needs a CardProvider" })
    vi.resetModules()
    const restarted: typeof BitmapStore = await import("./bitmap-store.ts")
    expect(await restarted.storedPreview("D:/shop", key)).toMatchObject({ width: 600, height: 100 })
    expect([...(await restarted.previewIndex("D:/shop"))]).toEqual([
      ["ui/Button", { key }],
      ["ui/Card", { key: newer, error: "Card needs a CardProvider" }]
    ])
  })

  it("has none for a key it hasn't made", async () => {
    expect(await store.storedPreview("D:/shop", newer)).toBeUndefined()
  })

  it("keeps previews in the project's previews folder, with no partial file behind", async () => {
    await store.storePreview("D:/shop", "ui/Button", { key }, pictures(), { width: 600, height: 100 })
    const [project] = await readdir(folder)
    expect((await readdir(join(folder, project!, "previews"))).sort()).toEqual([
      `${key}-large.png`,
      `${key}-thumb.png`,
      "index.json"
    ])
  })

  it("sweeps previews with their project once it's unused for over 30 days", async () => {
    await store.storePreview("D:/shop", "ui/Button", { key }, pictures(), { width: 600, height: 100 })
    const [project] = await readdir(folder)
    const previews = join(folder, project!, "previews")
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    for (const name of await readdir(previews)) await utimes(join(previews, name), old, old)
    await store.sweepBitmaps()
    expect(await readdir(folder)).toEqual([])
    expect(await store.previewIndex("D:/shop")).toEqual(new Map())
  })

  it("keeps none once the bitmap cache is cleared", async () => {
    await store.storePreview("D:/shop", "ui/Button", { key }, pictures(), { width: 600, height: 100 })
    await store.clearBitmaps()
    expect(await store.storedPreview("D:/shop", key)).toBeUndefined()
    expect(await store.previewIndex("D:/shop")).toEqual(new Map())
  })
})
