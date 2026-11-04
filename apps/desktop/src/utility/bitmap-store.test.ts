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
const png = Buffer.from("not really a png").toString("base64")

describe("the frame bitmap store", () => {
  it("gives back a kept bitmap for the same job and code, from another address", async () => {
    await store.storeBitmap("code-1", job("http://localhost:5001"), png)
    // A project opened again serves its guest at a new address, which isn't what the bitmap shows.
    expect(await store.storedBitmap("code-1", job("http://localhost:5002"))).toBe(png)
  })

  it("has none for other code or another frame", async () => {
    await store.storeBitmap("code-1", job("http://localhost:5001"), png)
    expect(await store.storedBitmap("code-2", job("http://localhost:5001"))).toBeUndefined()
    expect(await store.storedBitmap("code-1", job("http://localhost:5001", "Sign up"))).toBeUndefined()
  })

  it("leaves no partial file behind a write", async () => {
    await store.storeBitmap("code-1", job("http://localhost:5001"), png)
    const [project] = await readdir(folder)
    const names = await readdir(join(folder, project!))
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^[0-9a-f]{40}\.png$/)
  })

  it("sweeps away a project not used for over 30 days, and a partial file a write left", async () => {
    await store.storeBitmap("code-1", job("http://localhost:5001"), png)
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
    await store.storeBitmap("code-1", job("http://localhost:5001"), png)
    await store.clearBitmaps()
    expect(await store.storedBitmap("code-1", job("http://localhost:5001"))).toBeUndefined()
  })
})
