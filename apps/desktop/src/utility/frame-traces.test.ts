import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { codeSnapshot } from "@parity-app/project"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import type { RenderJob } from "../shared/protocol.ts"
import { frameTraces, type TraceProjects } from "./frame-traces.ts"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-traces-"))
  await write("package.json", "{}")
  await write("src/button.tsx", 'import { cn } from "./lib/utils"\nexport const Button = () => null\n')
  await write("src/lib/utils.ts", "export const cn = () => ''\n")
  await write("src/card.tsx", "export const Card = () => null\n")
  await write("src/index.css", '@import "./theme.css";\n')
  await write("src/theme.css", ":root { --primary: blue }\n")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function write(path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), text)
}

/** Moves a file's modification time on, as a checkout or a touch does, leaving its bytes alone. */
async function touch(path: string) {
  const later = new Date(Date.now() + 60_000)
  await utimes(join(root, path), later, later)
}

const job: RenderJob = {
  projectId: "shop",
  guestUrl: "http://localhost:5001/guest",
  theme: [],
  tree: [{ nodeId: "a", kind: "component", component: "Button", props: {}, slots: {} }],
  mode: { width: 320, height: 200, viewport: { width: 320, height: 200 }, classNames: [], attributes: {} },
  scale: 0.25
}

/** One open project, served from `root`, whose builder says `Button` loads `loaded` when given. */
async function projects(loaded?: string[]): Promise<TraceProjects> {
  const served = { code: codeSnapshot(root, "3:guest"), sources: {} }
  await served.code

  return {
    codeServedAt: () => served,
    previewProject: () => ({
      root,
      sources: {
        Button: { path: "src/button.tsx", export: "Button" },
        Card: { path: "src/card.tsx", export: "Card" }
      },
      stylesheets: ["src/index.css"]
    }),
    loadedFiles: () => Promise.resolve(loaded)
  }
}

describe("frame traces (PAR-994)", () => {
  it("lists the files a frame's components import, its stylesheets and theirs, and the shared config", async () => {
    const traced = await frameTraces(await projects()).trace(job)
    expect(Object.keys(traced!.files)).toEqual([
      "package.json",
      "src/button.tsx",
      "src/index.css",
      "src/lib/utils.ts",
      "src/theme.css"
    ])
  })

  it("adds what the builder says the components load to what the scan finds", async () => {
    const traced = await frameTraces(await projects(["src/button.tsx", "src/generated/icons.ts"])).trace(job)
    expect(Object.keys(traced!.files)).toContain("src/generated/icons.ts")
    expect(Object.keys(traced!.files)).toContain("src/lib/utils.ts")
  })

  it("says which files each component reads, leaving the stylesheets and config to every node (PAR-997)", async () => {
    const traced = await frameTraces(await projects(["src/button.tsx", "src/generated/icons.ts"])).trace(job)
    expect(traced!.components).toEqual({
      Button: ["src/button.tsx", "src/generated/icons.ts", "src/lib/utils.ts"]
    })
  })

  it("holds after a touch or a change to a file the frame doesn't read", async () => {
    const traces = frameTraces(await projects())
    const traced = (await traces.trace(job))!
    await touch("src/button.tsx")
    await write("src/card.tsx", "export const Card = () => 'changed'\n")
    expect(await traces.holds(job, traced)).toBe(true)
  })

  it("doesn't hold once a file the frame reads changes, however deep: an import or a stylesheet's import", async () => {
    const traces = frameTraces(await projects())
    const traced = (await traces.trace(job))!
    await write("src/lib/utils.ts", "export const cn = () => 'x'\n")
    await touch("src/lib/utils.ts")
    expect(await traces.holds(job, traced)).toBe(false)

    const again = (await traces.trace(job))!
    await write("src/theme.css", ":root { --primary: red }\n")
    await touch("src/theme.css")
    expect(await traces.holds(job, again)).toBe(false)
  })

  it("doesn't hold for another renderer, whose salt differs", async () => {
    const traced = (await frameTraces(await projects()).trace(job))!
    const other = await projects()
    const served = { code: codeSnapshot(root, "4:guest"), sources: {} }
    expect(await frameTraces({ ...other, codeServedAt: () => served }).holds(job, traced)).toBe(false)
  })
})
