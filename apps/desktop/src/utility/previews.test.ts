import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { type CodeSnapshot, codeSnapshot } from "@parity-app/project"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { PreviewJob, RenderJob } from "../shared/protocol.ts"
import type { componentPreviews, PreviewProjects } from "./previews.ts"

// The offscreen window, which needs Electron, stands in; the store and the keys are the real ones.
const open = vi.hoisted(() => ({
  root: "",
  snapshots: new Map<string, Promise<CodeSnapshot>>(),
  draws: [] as string[],
  draw: (_job: RenderJob): Promise<unknown> => Promise.resolve(undefined)
}))

/** The open project, served at each address in `open.snapshots`. */
const project: PreviewProjects = {
  codeServedAt: (_projectId, guestUrl) => {
    const code = open.snapshots.get(guestUrl)
    return code && { code, fingerprint: code.then(({ fingerprint }) => fingerprint), sources: {} }
  },
  previewProject: () => ({
    root: open.root,
    stylesheets: ["src/index.css"],
    sources: {
      Button: { path: "src/Button.tsx", export: "Button" },
      Badge: { path: "src/Badge.tsx", export: "Badge" }
    }
  })
}

vi.mock("./render.ts", () => ({
  renderPreview: (job: RenderJob) => {
    open.draws.push(JSON.stringify(job.tree))
    return open.draw(job)
  }
}))

let store: string
let previews: ReturnType<typeof componentPreviews>

/** The previews as the service makes them when it starts, reading where the store is from the environment. */
async function startService(): Promise<ReturnType<typeof componentPreviews>> {
  vi.resetModules()
  // The service's telemetry, recording into `sink`, as `start-telemetry.ts` starts it.
  sink.clear()
  ;(await import("../shared/tracing.ts")).traceWith(
    createTelemetry({
      events: registeredEvents,
      context: { process: "service", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )
  return (await import("./previews.ts")).componentPreviews(project)
}

const sink = createTestSink()

/** A PNG the offscreen window gives, of a size, as base64; the store keeps it as a WebP. */
async function picture(width: number, height: number): Promise<string> {
  const png = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .png()
    .toBuffer()
  return png.toString("base64")
}

const drawn = async () => ({
  pictures: { thumb: await picture(240, 40), large: await picture(600, 100), width: 600, height: 100 }
})

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(open.root, path)), { recursive: true })
  await writeFile(join(open.root, path), contents)
}

/** The project served at a new address after files changed, as a reopened project is. */
function serve(guestUrl: string): void {
  open.snapshots.set(guestUrl, codeSnapshot(open.root, "guest"))
}

function preview(component: string, guestUrl = "http://localhost:5001"): PreviewJob {
  return {
    component,
    job: {
      projectId: "D:/shop",
      guestUrl,
      theme: [],
      tree: [{ kind: "component", nodeId: "p1", component, props: {}, slots: {} }],
      mode: { width: 656, viewport: { width: 1280, height: 800 }, classNames: [], attributes: {} },
      scale: 2
    }
  }
}

beforeEach(async () => {
  open.root = await mkdtemp(join(tmpdir(), "parity-previews-project-"))
  store = await mkdtemp(join(tmpdir(), "parity-previews-store-"))
  open.snapshots.clear()
  open.draws = []
  open.draw = drawn
  await write("package.json", "{}")
  await write("src/index.css", "body { margin: 0 }")
  await write("src/lib/utils.ts", "export const cn = () => ''")
  await write("src/Button.tsx", `import { cn } from "./lib/utils"\nexport const Button = () => null`)
  await write("src/Badge.tsx", "export const Badge = () => null")
  serve("http://localhost:5001")
  vi.stubEnv("PARITY_BITMAP_DIR", store)
  previews = await startService()
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(open.root, { recursive: true, force: true })
  await rm(store, { recursive: true, force: true })
})

describe("component previews", () => {
  it("are drawn once, and a reopen with nothing changed draws none", async () => {
    const made = await previews.makePreview(preview("Button"), "visible")
    expect(made.image).toMatchObject({ width: 600, height: 100 })
    expect(open.draws).toHaveLength(1)

    // Parity started again: the project's guest is at a new address, its code the same.
    previews = await startService()
    serve("http://localhost:5002")
    const [found] = await previews.lookupPreviews([preview("Button", "http://localhost:5002")])
    expect(found?.image).toEqual(made.image)
    await previews.makePreview(preview("Button", "http://localhost:5002"), "idle")
    expect(open.draws).toHaveLength(1)
  })

  it("are made again after an edit only for the components that import what changed", async () => {
    await previews.makePreview(preview("Button"), "idle")
    await previews.makePreview(preview("Badge"), "idle")
    await write("src/lib/utils.ts", "export const cn = () => 'x'")
    const later = new Date(Date.now() + 1000)
    await utimes(join(open.root, "src/lib/utils.ts"), later, later)
    serve("http://localhost:5002")

    const [button, badge] = await previews.lookupPreviews([
      preview("Button", "http://localhost:5002"),
      preview("Badge", "http://localhost:5002")
    ])
    expect(badge?.image).toBeDefined()
    // Until it's made again, Button's last picture stands in for it.
    expect(button?.image).toBeUndefined()
    expect(button?.last).toMatchObject({ width: 600, height: 100 })
  })

  it("keep a component that fails to draw as failing, so the same code isn't drawn again", async () => {
    open.draw = () => Promise.resolve({ error: "Button needs a ThemeProvider" })
    expect(await previews.makePreview(preview("Button"), "idle")).toMatchObject({
      error: "Button needs a ThemeProvider"
    })
    expect(await previews.makePreview(preview("Button"), "idle")).toMatchObject({
      error: "Button needs a ThemeProvider"
    })
    expect(open.draws).toHaveLength(1)
  })

  it("keep one that drew nothing to see as that, across a restart, and draw it again once its code changes", async () => {
    await previews.makePreview(preview("Badge"), "idle")
    open.draw = () => Promise.resolve({ empty: true })
    expect(await previews.makePreview(preview("Button"), "idle")).toMatchObject({ empty: true })
    expect((await previews.makePreview(preview("Button"), "idle")).image).toBeUndefined()

    previews = await startService()
    serve("http://localhost:5002")
    const [found] = await previews.lookupPreviews([preview("Button", "http://localhost:5002")])
    expect(found).toMatchObject({ empty: true })
    expect(open.draws).toHaveLength(2)

    // It keeps no picture, so none stands in for it once it's drawn again.
    await write("src/Button.tsx", "export const Button = () => 'Buy'")
    const later = new Date(Date.now() + 1000)
    await utimes(join(open.root, "src/Button.tsx"), later, later)
    serve("http://localhost:5003")
    const [changed] = await previews.lookupPreviews([preview("Button", "http://localhost:5003")])
    expect(changed).not.toHaveProperty("empty")
    expect(changed).not.toHaveProperty("last")
  })

  it("try again later when the offscreen window couldn't finish one", async () => {
    open.draw = () => Promise.reject(new Error("The render window closed"))
    await expect(previews.makePreview(preview("Button"), "idle")).rejects.toThrow("The render window closed")
    open.draw = drawn
    expect((await previews.makePreview(preview("Button"), "idle")).image).toBeDefined()
    expect(open.draws).toHaveLength(2)
  })

  it("draw a preview asked for twice at once only once", async () => {
    await Promise.all([
      previews.makePreview(preview("Badge"), "visible"),
      previews.makePreview(preview("Badge"), "idle")
    ])
    expect(open.draws).toHaveLength(1)
  })

  it("leave out a preview whose code the project hasn't served", async () => {
    expect(await previews.lookupPreviews([preview("Button", "http://localhost:5999")])).toEqual([])
  })
})

describe("component previews' telemetry", () => {
  it("records each preview made, with its size and how long it took", async () => {
    await previews.makePreview(preview("Button"), "visible")
    expect(sink.named("preview.made")[0]?.attributes).toMatchObject({ component: "Button", width: 600, height: 100 })
    expect(sink.named("preview.made")[0]?.attributes["bytes"]).toBeGreaterThan(0)
  })

  it("records why one couldn't be made", async () => {
    open.draw = () => Promise.resolve({ error: "Button needs a ThemeProvider" })
    await previews.makePreview(preview("Button"), "idle")
    open.draw = () => Promise.resolve({ empty: true })
    await previews.makePreview(preview("Badge"), "idle")
    expect(sink.named("preview.failed").map(({ attributes }) => attributes)).toMatchObject([
      { component: "Button", reason: "render threw", message: "Button needs a ThemeProvider" },
      { component: "Badge", reason: "drew nothing" }
    ])
  })

  it("counts the previews found kept and not, once for each lookup, a kept failure as found", async () => {
    const { cacheUse } = await import("./cache-use.ts")
    await previews.lookupPreviews([preview("Button")])
    await previews.makePreview(preview("Button"), "idle")
    open.draw = () => Promise.resolve({ empty: true })
    await previews.makePreview(preview("Badge"), "idle")
    await previews.lookupPreviews([preview("Button"), preview("Badge")])
    expect(cacheUse.report()?.previews).toEqual({ hits: 2, misses: 1, hitRate: 0.667 })
  })
})
