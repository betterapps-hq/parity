import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { BuilderSession } from "@parity-app/core"
import { turbopackBuilder } from "@parity-app/extension-turbopack/builder"
import { detectContext, discoverProject, readPackage } from "@parity-app/project"
import { afterAll, describe, expect, it } from "vite-plus/test"
import { renderers } from "./extensions.ts"

/*
 * The Turbopack builder started on the `nextjs-turbopack` example app, as the desktop app starts it: Next compiles the
 * guest app, and the builder serves a guest module whose runtime, chunks and stylesheets all load. It runs where the
 * Fixtures workflow has installed the example apps and set PARITY_FIXTURES (PAR-1225), on the app itself, since
 * Turbopack builds nothing outside the project's folder.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/nextjs-turbopack")
const rendererGuestPath = fileURLToPath(import.meta.resolve("@parity-app/extension-react/guest"))
const startedIn = process.cwd()
let session: BuilderSession | undefined

// Next takes a while to close on Windows.
afterAll(async () => {
  await session?.close()
  // The builder runs Next from the project's folder, as `next dev` does.
  process.chdir(startedIn)

  // The guest app and what Next built stay in the app's `.next`, which git ignores. Closing Next leaves Turbopack's
  // watcher running in this process, and removing them here sends it looking for cache files the removal has already
  // deleted, which aborts the worker (PAR-1224).
}, 180_000)

describe.skipIf(!process.env.PARITY_FIXTURES)("the Turbopack builder on nextjs-turbopack", { timeout: 300_000 }, () => {
  it("serves a guest module whose runtime, chunks and stylesheets load", async () => {
    const pkg = (await readPackage(root))?.manifest

    if (!pkg) {
      throw new Error(`fixtures/nextjs-turbopack isn't there`)
    }

    const project = detectContext(root, pkg)
    const renderer = renderers[0]!
    const config = await discoverProject(root, renderer, pkg, { styles: turbopackBuilder.styles!(project) })

    expect(await turbopackBuilder.detect(project)).toMatchObject({ found: true, config: "next.config.ts" })
    expect(config.styles).toEqual(["src/app/globals.css"])

    session = await turbopackBuilder.start({ root, config, renderer, rendererGuestPath, allowedOrigins: [] })

    const guest = await fetch(session.guestUrl)
    const source = await guest.text()

    expect(guest.status).toBe(200)
    expect(source).toContain("export default createGuest(")

    // The runtime without what would start Next's router, the page's and the guest's chunks, and the stylesheets.
    const urls = [...new Set(source.match(/http:\/\/127\.0\.0\.1:\d+\/[^"\s]+/g) ?? [])].filter(
      (url) => !url.endsWith("/")
    )

    const runtime = urls.find((url) => url.includes("/__parity/runtime.js"))

    expect(runtime).toBeDefined()
    expect(urls.filter((url) => url.endsWith(".js")).length).toBeGreaterThan(1)

    const loaded = await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url)

        return { url, status: response.status, text: await response.text() }
      })
    )

    expect(loaded.filter(({ status }) => status !== 200)).toEqual([])
    expect(loaded.find(({ url }) => url === runtime)?.text).not.toContain('"otherChunks"')

    // Tailwind looked for class names in the project, so the dashboard's classes are compiled.
    const css = loaded.filter(({ url }) => url.includes(".css")).map(({ text }) => text)

    expect(css.join("\n")).toContain("grid-cols-3")
  })
})
