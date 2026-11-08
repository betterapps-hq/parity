import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  type BuilderAdapter,
  type BuilderProcessSession,
  type ComponentSource,
  parseCanvasDocument
} from "@parity-app/core"
import { reactRenderer } from "@parity-app/renderer-react"
import { createTelemetry, createTestSink, registeredEvents, type TestSink } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { WindowMethods } from "../shared/protocol.ts"
import { traceWith } from "../shared/tracing.ts"
import type { SavedDetection } from "./detection-cache.ts"
import { restartProcess } from "./processes.ts"
import { type DetectionCache, openProjects, type ProjectAdapters, type WatchFolder } from "./projects.ts"
import type { TypeChecker } from "./props.ts"

// The project is a real folder; the builder's process, the type checker's worker and the folder's watcher stand in.

const sketch = {
  id: "sketch",
  name: "Sketch",
  kind: "frame",
  position: { x: 40, y: 80 },
  size: { width: 400, height: 300 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "note", text: "Idea" }] },
  states: [{ id: "default", name: "Default" }]
}
const parFile = (text: string) =>
  `${JSON.stringify({ version: 3, containers: [{ ...sketch, name: text }] }, null, 2)}\n`
const designs = (name: string) => parseCanvasDocument(JSON.parse(parFile(name)))

let folder: string
let root: string

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), contents)
}

/** A builder that serves at the port it's given, and what it was asked. */
function fakeBuilder() {
  const started: number[] = []
  const closed: string[] = []
  const crashes: Parameters<ProjectAdapters["startBuilder"]>[1]["onCrash"][] = []
  const builder: BuilderAdapter = {
    id: "fake",
    name: "Fake builder",
    detect: () => Promise.resolve({ found: true, version: "1.0.0", summary: "Fake builder 1.0.0" }),
    start: () => Promise.reject(new Error("started in its own process"))
  }
  const startBuilder: ProjectAdapters["startBuilder"] = (options, { onCrash }) => {
    const port = options.port!
    started.push(port)
    crashes.push(onCrash)
    const session: BuilderProcessSession = {
      guestUrl: `http://localhost:${port}/@parity/guest.js`,
      toolVersion: "1.0.0",
      close: () => {
        closed.push(session.guestUrl)
        return Promise.resolve()
      },
      setComponents: () => undefined,
      usage: () => Promise.resolve(undefined)
    }
    return { pid: 1, session: Promise.resolve(session) }
  }
  /** Crashes the builder started last, as its process stopping by itself does. */
  const crash = (exitCode: number, output: string) =>
    crashes.at(-1)?.(`Fake builder stopped by itself, with exit code ${exitCode}`, { exitCode, output })
  return { builder, startBuilder, started, closed, crash }
}

/** A watcher whose changes the test reports, as `fs.watch` reports them: names relative to the folder. */
function fakeWatcher() {
  const watching = new Map<string, (event: string, name: string | null) => void>()
  const watch: WatchFolder = (watched, _options, listener) => {
    watching.set(watched, listener)
    return { close: () => watching.delete(watched) }
  }
  return { watch, change: (name: string) => watching.get(root)?.("change", name), watching }
}

/** The detection cache, kept in memory by root. */
function memoryDetections(): DetectionCache & { kept: Map<string, SavedDetection> } {
  const kept = new Map<string, SavedDetection>()
  const fingerprintOf = (sources: Record<string, ComponentSource>) => JSON.stringify(sources)
  return {
    kept,
    saved: (at, _files, discovered) => {
      const fingerprint = fingerprintOf(discovered)
      const saved = kept.get(at)
      return Promise.resolve(saved?.fingerprint === fingerprint ? { fingerprint, saved } : { fingerprint })
    },
    save: (at, _files, _discovered, fingerprint, found) => {
      kept.set(at, { fingerprint, ...found })
      return Promise.resolve()
    }
  }
}

function setUp(environment: ProjectAdapters["environment"] = {}, unsupported?: ProjectAdapters["unsupported"]) {
  const builder = fakeBuilder()
  const watcher = fakeWatcher()
  const detections = memoryDetections()
  const checker = {
    inferComponents: vi.fn<TypeChecker["inferComponents"]>(() => Promise.resolve({})),
    checkComponents: vi.fn<TypeChecker["checkComponents"]>(() => Promise.resolve({ components: [], leftOut: [] })),
    closeChecker: vi.fn<TypeChecker["closeChecker"]>()
  }
  const fileChanged: WindowMethods["project.fileChanged"]["params"][] = []
  let port = 5100
  const projects = openProjects({
    renderers: [reactRenderer],
    builders: [builder.builder],
    styles: [],
    startBuilder: builder.startBuilder,
    watch: watcher.watch,
    checker,
    detections,
    ports: { free: () => Promise.resolve(port++), isFree: () => Promise.resolve(true) },
    listeners: {
      fileChanged: (change) => fileChanged.push(change),
      componentsChanged: () => undefined,
      codeChanged: () => undefined,
      guestMoved: () => Promise.resolve(true)
    },
    environment,
    unsupported
  })
  return { projects, builder, watcher, detections, checker, fileChanged }
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-projects-"))
  root = join(folder, "shop")
  await write(
    "package.json",
    JSON.stringify({ name: "shop", dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" } })
  )
  await write("tsconfig.json", JSON.stringify({ compilerOptions: { jsx: "react-jsx" }, include: ["src"] }))
  await write("src/Button.tsx", "export function Button() {\n  return <button>Buy</button>\n}\n")
  await write("shop.par", parFile("Sketch"))
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

describe("opening a project", () => {
  it("reads its project files and components, and serves its guest", async () => {
    const { projects } = setUp()
    const info = await projects.open(root)
    expect(info).toMatchObject({
      id: root,
      name: "shop",
      renderer: { id: "react" },
      builder: { id: "fake", toolVersion: "1.0.0" },
      guestUrl: "http://localhost:5100/@parity/guest.js",
      mainDocument: "shop.par",
      modes: { custom: false }
    })
    expect(info.documents).toEqual([{ path: "shop.par", document: expect.objectContaining({ version: 3 }) }])
    expect(Object.keys(info.sources)).toContain("Button")
    expect(projects.roots()).toEqual([root])
    // Asked again while it's open, it's the same project, served by the same builder.
    expect((await projects.open(root)).guestUrl).toBe(info.guestUrl)
  })

  it("saves what the type checker found, and a reopen with nothing changed takes it instead of checking again", async () => {
    const { projects, checker, detections } = setUp()
    await projects.open(root)
    await vi.waitFor(() => expect(detections.kept.has(root)).toBe(true))
    expect(checker.checkComponents).toHaveBeenCalledTimes(1)

    await projects.close(root)
    const info = await projects.open(root)
    expect(info.notes.join("\n")).toContain("as the type checker found them last time")
    expect(checker.checkComponents).toHaveBeenCalledTimes(1)
  })

  it("takes its root from the project Parity was started with, read when the projects are made", () => {
    const { projects } = setUp({ PARITY_PROJECT: root })
    expect(projects.rootFor(undefined)).toBe(root)
    expect(projects.rootFor(join(root, "designs", "shop.par"))).toBe(root)
  })
})

describe("what opening a project records", () => {
  let sink: TestSink

  beforeEach(() => {
    sink = createTestSink()
    traceWith(
      createTelemetry({
        events: registeredEvents,
        context: { process: "service", installId: "install", sessionId: "session" },
        sinks: [sink],
        check: true
      })
    )
  })

  const attributes = (name: string) => sink.named(name).map((event) => event.attributes)

  it("records the project, how long each step took and what it found, and detection as a span", async () => {
    await write("node_modules/react/package.json", JSON.stringify({ name: "react", version: "19.1.0" }))
    await write("node_modules/typescript/package.json", JSON.stringify({ name: "typescript", version: "5.9.2" }))
    const { projects } = setUp()
    await projects.open(root)

    expect(attributes("project.opened")).toEqual([
      {
        name: "shop",
        root,
        reopen: false,
        cached: false,
        framework: "react",
        builder: "fake",
        durationMs: expect.any(Number),
        detectionMs: expect.any(Number),
        builderMs: expect.any(Number),
        react: "19.1.0",
        typescript: "5.9.2",
        components: 1,
        designs: 1,
        tokens: 0,
        libraries: 0
      }
    ])
    expect(attributes("project.detected")).toEqual([{ root }])
    expect(attributes("builder.ready")).toEqual([
      { builder: "Fake builder", durationMs: expect.any(Number), restart: false }
    ])
  })

  it("records a reopen as Parity starts, and one that took the last detection", async () => {
    const { projects, detections } = setUp()
    await projects.open(root)
    await vi.waitFor(() => expect(detections.kept.has(root)).toBe(true))
    await projects.close(root)
    await projects.open(root, { reopen: true })

    expect(attributes("project.opened").map(({ reopen, cached }) => ({ reopen, cached }))).toEqual([
      { reopen: false, cached: false },
      { reopen: true, cached: true }
    ])
    expect(attributes("project.closed")).toEqual([{ name: "shop", root, openMs: expect.any(Number) }])
  })

  it("records a project that can't open, with the step that failed", async () => {
    const { projects } = setUp()
    await rm(join(root, "package.json"))
    await expect(projects.open(root)).rejects.toThrow("There's no package.json")

    expect(attributes("project.openFailed")).toEqual([
      {
        name: "shop",
        root,
        reopen: false,
        durationMs: expect.any(Number),
        step: "detection",
        message: `There's no package.json in ${root}`
      }
    ])
    expect(sink.named("project.opened")).toEqual([])
  })

  it("records a builder that crashed, with its exit code and output, and starting it again", async () => {
    const { projects, builder } = setUp()
    await projects.open(root)
    builder.crash(1, "Starting\nError: out of memory\n")
    await restartProcess({ id: `builder:${root}` })

    expect(attributes("builder.crashed")).toEqual([
      { builder: "Fake builder", exitCode: 1, output: "Starting\nError: out of memory" }
    ])
    expect(attributes("builder.restarted")).toEqual([
      { builder: "Fake builder", durationMs: expect.any(Number), outcome: "ok" }
    ])
    expect(attributes("builder.ready").map(({ restart }) => restart)).toEqual([false, true])
  })
})

describe("a project Parity doesn't support", () => {
  function recorded() {
    const sink = createTestSink()
    const telemetry = createTelemetry({
      events: registeredEvents,
      context: { process: "service", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
    const { projects } = setUp({}, (reason, detail) => telemetry.track("project.unsupported", { reason, detail }))
    return { projects, unsupported: () => sink.named("project.unsupported").map((event) => event.attributes) }
  }

  it("records that it has no package.json", async () => {
    const { projects, unsupported } = recorded()
    await rm(join(root, "package.json"))
    await expect(projects.open(root)).rejects.toThrow("There's no package.json")
    expect(unsupported()).toEqual([{ reason: "no_package", detail: `There's no package.json in ${root}` }])
  })

  it("records that no renderer supports its framework", async () => {
    const { projects, unsupported } = recorded()
    await write("package.json", JSON.stringify({ name: "shop", dependencies: { vue: "^3.0.0" } }))
    await expect(projects.open(root)).rejects.toThrow("No renderer supports shop")
    expect(unsupported()).toEqual([{ reason: "no_renderer", detail: "No renderer supports shop" }])
  })
})

describe("an open project's files", () => {
  it("tell the windows about a project file changed outside the canvas, but not about the canvas's own saves", async () => {
    const { projects, watcher, fileChanged } = setUp()
    await projects.open(root)

    await write("shop.par", parFile("Edited by an agent"))
    watcher.change("shop.par")
    await vi.waitFor(() => expect(fileChanged).toHaveLength(1))
    expect(fileChanged[0]?.document.containers[0]?.name).toBe("Edited by an agent")

    const saved = designs("Saved from the canvas")
    await projects.saveDocument({ projectId: root, path: "shop.par", document: saved })
    watcher.change("shop.par")
    // Longer than the watcher waits after a change.
    await new Promise((done) => setTimeout(done, 300))
    expect(fileChanged).toHaveLength(1)
    expect(await readFile(join(root, "shop.par"), "utf8")).toContain("Saved from the canvas")
  })

  it("aren't saved outside the project, even in a sibling folder whose name starts with the root's", async () => {
    const { projects } = setUp()
    await projects.open(root)
    const document = designs("Sketch")
    await expect(projects.saveDocument({ projectId: root, path: "../shop-old/shop.par", document })).rejects.toThrow(
      "is not a .par file inside the project"
    )
    await expect(projects.saveDocument({ projectId: root, path: "notes.txt", document })).rejects.toThrow(
      "is not a .par file inside the project"
    )
    await projects.saveDocument({ projectId: root, path: "more.par", document })
    expect((await projects.open(root)).documents.map((entry) => entry.path)).toContain("more.par")
  })
})

describe("closing and reopening a project", () => {
  it("stops its builder and watcher, and serves it again on a new port", async () => {
    const { projects, builder, watcher, checker } = setUp()
    const first = await projects.open(root)
    expect(watcher.watching.has(root)).toBe(true)

    await projects.close(root)
    expect(builder.closed).toEqual([first.guestUrl])
    expect(watcher.watching.has(root)).toBe(false)
    expect(checker.closeChecker).toHaveBeenCalledWith(root, true)
    expect(projects.roots()).toEqual([])
    expect(() => projects.get(root)).toThrow("No open project")

    const again = await projects.open(root)
    expect(again.guestUrl).not.toBe(first.guestUrl)
    expect(builder.started).toEqual([5100, 5101])
    expect(watcher.watching.has(root)).toBe(true)
  })
})
