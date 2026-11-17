import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { BuilderSession, PreparedBuilder } from "@parity-app/core"
import type * as Vite from "vite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { viteBuilder } from "./builder.ts"

// docs/editor.md, Vite as an extension, through its builder provider: its prebundled dependencies kept between opens
// (PAR-1196). A real Vite server, prepared, finding the app's stylesheets before it starts.

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))

declare global {
  /** Where the fixture's config hands over the server it's loaded into, so the test can watch its optimizer. */
  var parityPrepareTestServer: Vite.ViteDevServer | undefined
}

let root: string
let prepared: PreparedBuilder | undefined
let session: BuilderSession | undefined

beforeEach(async () => {
  // The real path: Windows runners' tmpdir can use a short (8.3) name.
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-prepare-")))

  const files = {
    "package.json": JSON.stringify({ name: "fixture", type: "module" }),
    "vite.config.mjs": `export default { plugins: [{ name: "fixture:server", configureServer(server) { globalThis.parityPrepareTestServer = server } }] }`,
    "guest.js": "export function createGuest(init) { return init }\n",
    "index.html": '<script type="module" src="/src/main.ts"></script>',
    "src/main.ts":
      'import { greeting } from "fake-ui"\nimport "./index.css"\nimport "./app.ts"\nexport default greeting',
    // Past the stylesheets' module, so only Vite's background compiles reach it while they're found.
    "src/app.ts": 'import { greeting } from "fake-ui"\nexport const app = greeting',
    "src/index.css": ":root { --primary: red; }",
    // A page nothing else imports, as a TanStack Start app's are without an index.html.
    "src/routes/about.tsx": 'import { greeting } from "fake-ui"\nexport const about = greeting',
    "node_modules/fake-ui/package.json": JSON.stringify({ name: "fake-ui", type: "module", main: "index.js" }),
    "node_modules/fake-ui/index.js": 'export const greeting = "hello"\n'
  }

  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }

  await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")
})

afterEach(async () => {
  await (session ?? prepared)?.close()
  session = undefined
  prepared = undefined
  globalThis.parityPrepareTestServer = undefined
  // The optimizer can still be writing its folder just after the server closes.
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe("a prepared Vite builder", () => {
  it("finds the app's stylesheets without asking the optimizer to bundle what they import, then starts it", async () => {
    prepared = await viteBuilder.prepare!({
      root,
      renderer: {
        id: "react",
        name: "React",
        guestModule: "",
        runtimePackages: [],
        runtimeImports: [],
        developmentStandIns: {}
      },
      rendererGuestPath: join(root, "guest.js"),
      allowedOrigins: []
    })

    const optimizer = globalThis.parityPrepareTestServer?.environments.client?.depsOptimizer
    expect(optimizer).toBeDefined()
    // Vite 6 and 7 bundle on this call at once, with the config as it is before the builder starts.
    const registered = vi.spyOn(optimizer!, "registerMissingImport")

    expect(await prepared.styles()).toMatchObject({ styles: ["src/index.css"] })
    // Nor does anything those modules start compiling in the background, once they're done (PAR-1223).
    await globalThis.parityPrepareTestServer?.environments.client?.waitForRequestsIdle()
    expect(registered).not.toHaveBeenCalled()

    session = await prepared.start({
      styles: ["src/index.css"],
      components: {},
      documents: [],
      libraries: [],
      routeFiles: ["src/routes/about.tsx"]
    })
    expect(optimizer!.options.noDiscovery).toBeFalsy()
    // The optimizer looks through the pages too, for what only they import (PAR-1203).
    expect(optimizer!.options.entries).toContain("src/routes/about.tsx")
    // Started, the app's modules import the package through the optimizer again.
    const main = await fetch(new URL("/src/main.ts", session.guestUrl))
    expect(await main.text()).toMatch(/\/\.vite-parity\/[0-9a-f]{10}\/deps\/fake-ui\.js/)
  }, 30_000)
})
