import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { BuilderSession, ModuleStyles } from "@parity-app/core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { viteBuilder } from "./builder.ts"
import { collectedStyleModule, moduleStylesSource } from "./module-styles.ts"

// docs/editor.md, A project's stylesheets stay in its frames (PAR-1181): a real Vite server, whose stylesheet modules
// would add a `<style>` to Parity's page.

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))

let root: string
let session: BuilderSession

beforeAll(async () => {
  // The real path: Windows runners' tmpdir can use a short (8.3) name, which crashes libuv's watcher.
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-module-styles-")))

  const files = {
    "package.json": JSON.stringify({ name: "fixture", type: "module" }),
    "guest.js": "export function createGuest(init) { return init }\n",
    "src/styles.css": "body { font-family: serif; }\n",
    "src/card.css": ".card { color: red; }\n",
    "src/title.module.css": ".title { color: blue; }\n",
    "src/card.js":
      'import "./styles.css"\nimport "./card.css"\nimport title from "./title.module.css"\nexport const Card = () => title\n'
  }

  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }

  await mkdir(join(root, "node_modules"), { recursive: true })
  await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")

  session = await viteBuilder.start({
    root,
    config: {
      styles: ["src/styles.css"],
      components: { Card: { path: "src/card.js", export: "Card" } },
      documents: [],
      libraries: []
    },
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
}, 30_000)

afterAll(async () => {
  await session?.close()
  // The optimizer can still be writing its folder just after the server closes.
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

/** Fetches a module the builder serves, as the canvas would. */
async function served(url: string): Promise<string> {
  const response = await fetch(new URL(url, session.guestUrl))
  expect(response.status).toBe(200)

  return response.text()
}

/** The collector's source as served, imported on its own, as the page imports it once for the guest and every stylesheet. */
async function collector(): Promise<ModuleStyles & CollectorFunctions> {
  const source = await served("/@id/__x00__virtual:canvas/module-styles")

  // SAFETY: the collector's module exports these, as moduleStylesSource writes it.
  const module = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as {
    moduleStyles: ModuleStyles
  } & CollectorFunctions

  return { ...module.moduleStyles, updateStyle: module.updateStyle, removeStyle: module.removeStyle }
}

/** What a served stylesheet module calls on the collector, as Vite's client would be called. */
interface CollectorFunctions {
  updateStyle: (id: string, css: string) => void
  removeStyle: (id: string) => void
}

describe("a stylesheet a project's module imports", () => {
  it.each([
    ["a plain stylesheet", "/src/card.css", ".card { color: red; }"],
    ["a CSS module", "/src/title.module.css", "{ color: blue; }"]
  ])("goes to the guest's collector, not into the page through Vite's client: %s", async (_, url, css) => {
    const module = await served(url)
    expect(module).toContain(css)
    expect(module).toMatch(
      /import \{ updateStyle as __vite__updateStyle.*\} from "\/@id\/__x00__virtual:canvas\/module-styles"/
    )
    expect(module).not.toMatch(/updateStyle as __vite__updateStyle[^\n]*\/@vite\/client/)
  })

  it("is collected by the guest the canvas imports", async () => {
    expect(await served(session.guestUrl)).toContain("moduleStyles: modules[")
  })

  it("is kept until it's taken away, and the global stylesheets the guest already has are left out", async () => {
    const styles = await collector()
    const heard: string[][] = []
    const stop = styles.subscribe(() => heard.push(styles.sheets()))

    styles.updateStyle(`${root.replaceAll("\\", "/").toUpperCase()}/src/styles.css`, "body { font-family: serif; }")
    styles.updateStyle(`${root.replaceAll("\\", "/")}/src/card.css`, ".card { color: red; }")
    styles.updateStyle(`${root.replaceAll("\\", "/")}/src/card.css`, ".card { color: red; }")
    styles.updateStyle(`${root.replaceAll("\\", "/")}/src/card.css`, ".card { color: blue; }")
    styles.removeStyle(`${root.replaceAll("\\", "/")}/src/card.css`)
    stop()
    styles.updateStyle("/src/late.css", ".late {}")

    expect(heard).toEqual([[".card { color: red; }"], [".card { color: blue; }"], []])
  })
})

describe("collectedStyleModule", () => {
  it("leaves a module that doesn't add a stylesheet alone", () => {
    expect(collectedStyleModule('import { createHotContext } from "/@vite/client"')).toBeUndefined()
  })

  it("takes Vite's client from under a base path too", () => {
    const code =
      'import { updateStyle as __vite__updateStyle, removeStyle as __vite__removeStyle } from "/app/@vite/client"\n'

    expect(collectedStyleModule(code)).toBe(
      'import { updateStyle as __vite__updateStyle, removeStyle as __vite__removeStyle } from "virtual:canvas/module-styles"\n'
    )
  })
})

describe("moduleStylesSource", () => {
  it("names the global stylesheets it leaves out without case", () => {
    expect(moduleStylesSource(["D:/App/src/styles.css"])).toContain('["d:/app/src/styles.css"]')
  })
})
