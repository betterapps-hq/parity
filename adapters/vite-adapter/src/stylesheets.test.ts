import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { BuilderSession, CodeChange } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { viteBuilder } from "./index.ts"

// docs/editor.md, Stylesheet edits redraw frames (PAR-821): a real Vite server, with the project's stylesheet edited.

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))

let root: string
let session: BuilderSession | undefined

beforeEach(async () => {
  // The real path: Windows runners' tmpdir can use a short (8.3) name, which crashes libuv's watcher.
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-stylesheets-")))

  const files = {
    "package.json": JSON.stringify({ name: "fixture", type: "module" }),
    "guest.js": "export function createGuest(init) { return init }\n",
    "src/styles.css": '@import "./theme.css";\n.card { color: red; }\n',
    "src/theme.css": ":root { --primary: red; }\n"
  }

  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }

  await mkdir(join(root, "node_modules"), { recursive: true })
  await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")
})

afterEach(async () => {
  await session?.close()
  session = undefined
  // The optimizer can still be writing its folder just after the server closes.
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

/** Fetches a module the builder serves, as the canvas would. */
async function served(url: string): Promise<string> {
  const response = await fetch(new URL(url, session!.guestUrl))
  expect(response.status).toBe(200)

  return response.text()
}

/** The stylesheet a served guest imports as text. */
function stylesheetImport(guest: string): string {
  const url = [...guest.matchAll(/import\("([^"]+)"\)/g)].map((match) => match[1]!).find((id) => id.includes(".css"))
  expect(url).toBeDefined()

  return url!
}

describe("a stylesheet edited while the builder runs", () => {
  it("is said to change the guest's stylesheets, and a guest loaded from a new address imports it afresh", async () => {
    session = await viteBuilder.start({
      root,
      config: { styles: ["src/styles.css"], components: {}, documents: [], libraries: [] },
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

    const changes: CodeChange[] = []
    session.codeChanges?.((change) => changes.push(change))
    const first = stylesheetImport(await served(session.guestUrl))
    expect(await served(first)).toContain("red")

    // A file the stylesheet imports, as a Tailwind entry keeps its theme.
    await writeFile(join(root, "src/theme.css"), ":root { --primary: blue; }\n")
    await vi.waitFor(() => expect(changes.at(-1)).toMatchObject({ paths: [], styles: true }), { timeout: 10_000 })

    const stamp = changes.at(-1)!.stamp
    const restyled = session.restyledGuestUrl?.(stamp)
    expect(restyled).toBe(`${session.guestUrl}?styles=${stamp}`)
    const again = stylesheetImport(await served(restyled!))
    expect(again).not.toBe(first)
    expect(again).toContain(`t=${stamp}`)
    expect(await served(again)).toContain("blue")
  }, 30_000)
})
