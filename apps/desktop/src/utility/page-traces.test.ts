import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { codeSnapshot } from "@parity-app/project"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import type { PageJob } from "../shared/protocol.ts"
import { type PageTraceProjects, pageTraces } from "./page-traces.ts"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-page-traces-"))
  await write("package.json", "{}")
  await write("src/routes/__root.tsx", "export const Route = {}\n")
  await write("src/routes/pricing.tsx", 'import { plans } from "../data/plans"\nexport const Route = {}\n')
  await write("src/data/plans.ts", "export const plans = []\n")
  await write("src/other.ts", "export const other = 1\n")
  await write("src/index.css", ":root { --primary: blue }\n")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function write(path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), text)
}

const job: PageJob = {
  kind: "page",
  projectId: "shop",
  route: "/pricing",
  path: "/pricing",
  state: "base",
  mode: { width: 390, viewport: { width: 390, height: 844 }, classes: [], attributes: {} },
  scale: 0.25
}

/** One open project served from `root`, whose builder says the pricing route loads `loaded` when given. */
function projects(loaded?: string[]): PageTraceProjects {
  const code = codeSnapshot(root, "3:guest")

  return {
    pageProject: () => ({
      root,
      routes: [
        { id: "__root__", file: "src/routes/__root.tsx" },
        { id: "/pricing", file: "src/routes/pricing.tsx", parent: "__root__" }
      ],
      folderRoutes: false,
      stylesheets: ["src/index.css"],
      code
    }),
    loadedFiles: () => Promise.resolve(loaded)
  }
}

describe("page traces (PAR-1200)", () => {
  it("lists the route's files, what they import and load, the stylesheets and the shared config", async () => {
    const traced = await pageTraces(projects([])).trace(job)
    expect(Object.keys(traced!.files)).toEqual([
      "package.json",
      "src/data/plans.ts",
      "src/index.css",
      "src/routes/__root.tsx",
      "src/routes/pricing.tsx"
    ])
  })

  it("lists the whole project where the builder can't say what the route loads", async () => {
    const traced = await pageTraces(projects()).trace(job)
    expect(Object.keys(traced!.files)).toContain("src/other.ts")
  })

  it("has none when a file it lists changed after the copy's page started loading", async () => {
    const copy = { origin: "http://shop.localhost:5173", loadedAt: Date.now() - 60_000, landed: true, pageHeight: 900 }
    const frozen = { ...copy, root: { classes: [], attributes: [], style: "" }, body: {}, sheets: [] }
    expect(await pageTraces(projects([])).trace({ ...job, copy: frozen })).toBeUndefined()
    expect(
      await pageTraces(projects([])).trace({ ...job, copy: { ...frozen, loadedAt: Date.now() + 60_000 } })
    ).toBeDefined()
  })

  it("holds until a file it lists changes, and a file it doesn't list leaves it holding", async () => {
    const traces = pageTraces(projects([]))
    const traced = (await traces.trace(job))!
    await write("src/other.ts", "export const other = 2\n")
    expect(await traces.holds(job, traced)).toBe(true)
    await write("src/data/plans.ts", "export const plans = [1]\n")
    expect(await traces.holds(job, traced)).toBe(false)
  })

  it("stops holding when a file it would now list is added, as a public asset the page draws by URL", async () => {
    const traced = (await pageTraces(projects([])).trace(job))!
    await write("public/logo.svg", "<svg />")
    expect(Object.keys((await pageTraces(projects([])).trace(job))!.files)).toContain("public/logo.svg")
    expect(await pageTraces(projects([])).holds(job, traced)).toBe(false)
  })
})
