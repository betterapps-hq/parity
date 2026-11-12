import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import {
  type Attributes,
  createTelemetry,
  createTestSink,
  registeredEvents,
  type TraceContext
} from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { ProjectInfo, ServiceMethods } from "../shared/protocol.ts"
import type * as ReportError from "./report-error.ts"
import { preloadAnswers } from "./service.ts"
import { tracedCommand, traceWith } from "./tracing.ts"
import type { ProjectSession } from "./workspace.ts"

// docs/editor.md, Opening and closing projects: a tab closed while its project opens, as tabs restored at launch can
// be, closes the project once the service has it, so its builder doesn't run on with no tab (PAR-427).

const guest = vi.hoisted(() => {
  const loads: Array<(value: typeof loaded) => void> = []
  const failures: Array<(error: Error) => void> = []
  const released: string[] = []

  return { loads, failures, released }
})

vi.mock("./guest.ts", () => ({
  loadGuest: () =>
    new Promise((resolve, reject) => {
      guest.loads.push(resolve)
      guest.failures.push(reject)
    }),
  releaseGuest: (url: string) => guest.released.push(url),
  previewToken: () => undefined
}))

/** An event the workspace tracked. */
interface Tracked {
  name: string
  attributes: Attributes
  span?: TraceContext | undefined
}

const tracked = vi.hoisted(() => {
  const events: Tracked[] = []

  return events
})

vi.mock("./report-error.ts", async (original) => ({
  ...(await original<typeof ReportError>()),
  track: (name: string, attributes: Attributes, options?: { span?: TraceContext }) =>
    tracked.push({ name, attributes, span: options?.span })
}))

/** Each start page picture the workspace kept, by project, and whether it stopped. */
const pictures = vi.hoisted(() => {
  const kept: { project: string; stopped: boolean }[] = []

  return kept
})

vi.mock("./project-picture.ts", () => ({
  keepProjectPicture: (session: { id: string }) => {
    const keeping = { project: session.id, stopped: false }
    pictures.push(keeping)

    return () => {
      keeping.stopped = true
    }
  }
}))

const { homeTab, Workspace } = await import("./workspace.ts")
const { mediaFilesOf } = await import("./media/project-media.ts")

const info: ProjectInfo = {
  id: "/projects/app",
  root: "/projects/app",
  name: "app",
  renderer: { id: "react", name: "React" },
  guestUrl: "http://127.0.0.1:5000/guest",
  builder: { id: "vite", name: "Vite", toolVersion: "8" },
  theme: [],
  componentCount: 0,
  notes: [],
  detection: { packageManager: { id: "pnpm", name: "pnpm", agent: "pnpm", summary: "" }, tools: [] },
  documents: [],
  mainDocument: "app.par",
  modes: { settings: defaultModeSettings, custom: false },
  sources: {},
  libraries: []
}

const loaded = { guest: {}, sheet: {}, tokens: [] }

let opens: Array<(value: ProjectInfo) => void>
let closes: string[]

/** The projects whose pictures the service was told to keep, each time it was told. */
let picturesKept: string[][]

/** The projects whose folders the start page asked about, each time, and what the service answers. */
let checked: string[][]
let folders: ServiceMethods["start.check"]["result"]

/** How the service answers a design file's write. */
const saving = { answer: (): Promise<undefined> => Promise.resolve(undefined) }

/** Whether the service says what detection reads of a project changed since it opened. */
const detection = { changed: false }

beforeEach(() => {
  tracked.length = 0
  pictures.length = 0
  opens = []
  closes = []
  picturesKept = []
  checked = []
  folders = { missing: [] }
  detection.changed = false
  guest.loads.length = 0
  guest.failures.length = 0
  guest.released.length = 0
  vi.stubGlobal("window", {
    canvasHost: {
      ask: preloadAnswers((method, answerParams) => {
        // SAFETY: each method below reads only what its params have: `projectId` closing a project, `roots` the others.
        const params = answerParams as { projectId?: string; roots?: string[] }

        if (method === "project.open") {
          return new Promise((resolve) => opens.push(resolve))
        }

        if (method === "project.close") {
          closes.push(params.projectId!)

          return Promise.resolve(undefined)
        }

        if (method === "pictures.keepOnly") {
          picturesKept.push(params.roots!)

          return Promise.resolve(undefined)
        }

        if (method === "document.save") {
          return saving.answer()
        }

        if (method === "project.detectAgain") {
          return Promise.resolve(detection.changed)
        }

        if (method === "start.check") {
          checked.push(params.roots!)

          return Promise.resolve(folders)
        }

        // Nothing else the tab asks for answers, as nothing the test checks waits on it.
        return new Promise(() => undefined)
      })
    }
  })
})

afterEach(() => vi.unstubAllGlobals())

/** Lets the workspace's awaits run on. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("starting the workspace", () => {
  it("leaves a fresh install on Home", () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    const workspace = new Workspace()
    workspace.restore()
    expect(opens).toHaveLength(0)
    expect(workspace.getTabs()).toEqual([])
    expect(workspace.isHomeActive()).toBe(true)
  })

  it("stays on Home when that's where the window was, reopening the tabs behind it", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "parity.workspace" ? JSON.stringify({ roots: [info.root], active: homeTab }) : null
    })
    const workspace = new Workspace()
    workspace.restore()
    expect(opens).toHaveLength(1)
    expect(workspace.getTabs()[0]?.id).toBe(info.root)
    expect(workspace.isHomeActive()).toBe(true)
  })

  it("opens the project requested by the dev runner", () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    window.canvasHost.initialProject = info.root
    const workspace = new Workspace()
    workspace.restore()
    expect(opens).toHaveLength(1)
    expect(workspace.getTabs()).toHaveLength(1)
  })

  it("restores saved tabs ahead of the dev runner's default", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "parity.workspace" ? JSON.stringify({ roots: [info.root] }) : null)
    })
    window.canvasHost.initialProject = "/another/project"
    const workspace = new Workspace()
    workspace.restore()
    expect(opens).toHaveLength(1)
    expect(workspace.getTabs()[0]?.id).toBe(info.root)
  })
})

describe("recording a project as loaded (PAR-694)", () => {
  /** Whether each `project.loaded` was for a project the window opened as it started. */
  const restored = () =>
    tracked.filter(({ name }) => name === "project.loaded").map(({ attributes }) => attributes.restored)

  it("marks a tab from last time as restored", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "parity.workspace" ? JSON.stringify({ roots: [info.root] }) : null),
      setItem: () => undefined
    })
    new Workspace().restore()
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await settle()
    expect(restored()).toEqual([true])
  })

  it("marks a project the person opens as not restored", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined })
    const opening = new Workspace().open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    expect(restored()).toEqual([false])
  })

  it("doesn't count a project as loaded when its tab closed while the guest loaded", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    await workspace.close(info.id)
    guest.loads[0]!(loaded)
    await opening
    expect(restored()).toEqual([])
  })
})

describe("checking the start page's folders (PAR-188)", () => {
  it("flags listed projects whose folders are gone, and keeps the example's folder", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "parity.recent" ? JSON.stringify(["/apps/site", "/apps/gone"]) : null),
      setItem: () => undefined
    })
    folders = { missing: ["/apps/gone"], example: "/parity/examples/shadcn-vite" }
    const workspace = new Workspace()
    workspace.restore()
    await settle()
    expect(checked).toEqual([["/apps/site", "/apps/gone"]])
    expect(workspace.getProjects().map(({ root, missing }) => ({ root, missing }))).toEqual([
      { root: "/apps/site", missing: undefined },
      { root: "/apps/gone", missing: true }
    ])
    expect(workspace.getExample()).toBe("/parity/examples/shadcn-vite")
  })

  it("checks again when Home shows, as a folder may come back", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "parity.recent" ? JSON.stringify(["/apps/drive"]) : null),
      setItem: () => undefined
    })
    folders = { missing: ["/apps/drive"] }
    const workspace = new Workspace()
    workspace.restore()
    await settle()
    expect(workspace.getProjects()[0]?.missing).toBe(true)
    workspace.activate("somewhere")
    folders = { missing: [] }
    workspace.activate(homeTab)
    await settle()
    expect(workspace.getProjects()[0]?.missing).toBeUndefined()
  })
})

describe("a closed tab", () => {
  it("lets go of its editor, so tabs React still holds keep no canvas", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    // SAFETY: the workspace only holds the editor and lets it go; nothing here calls it.
    const editor = {} as NonNullable<ProjectSession["editor"]>
    workspace.setEditor(info.id, editor)
    const held = workspace.getTabs()
    expect(held[0]?.session?.editor).toBe(editor)
    await workspace.close(info.id)
    expect(held[0]?.session?.editor).toBeUndefined()
  })
})

// docs/editor.md, The start page: a project's picture is taken as it opens and after saves, not again when its code
// changes or the service restarts, since its session stays the same object until its tab closes (PAR-1004).
describe("an open project's session", () => {
  const button = { id: "button", name: "Button", path: "src/Button.tsx", export: "Button" }

  async function opened() {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!({ ...info, sources: { button } })
    await settle()
    guest.loads[0]!(loaded)
    await opening

    return { workspace, session: workspace.getTab(info.id)!.session! }
  }

  it("stays the same object when the project's code changes, keeping its media and its picture", async () => {
    const { workspace, session } = await opened()
    const media = mediaFilesOf(session)
    workspace.codeChanged(info.id, [button.path], 2)
    const after = workspace.getTab(info.id)!.session!
    expect(after.versions).toEqual({ button: 2 })
    expect(after).toBe(session)
    expect(mediaFilesOf(after)).toBe(media)
    expect(pictures).toEqual([{ project: info.id, stopped: false }])
  })

  it("stays the same object through a reconnect, with the new guest and tokens in it", async () => {
    const { workspace, session } = await opened()
    const media = mediaFilesOf(session)
    const { tokens } = session
    const reconnecting = workspace.reconnect()
    opens[1]!({ ...info, guestUrl: "http://127.0.0.1:5008/guest" })
    await settle()
    const fresh = { guest: { fresh: true }, sheet: {}, tokens: [] }
    guest.loads[1]!(fresh)
    await reconnecting
    const after = workspace.getTab(info.id)!.session!
    expect(after).toBe(session)
    expect(after.loaded).toBe(fresh)
    expect(after.tokens).not.toBe(tokens)
    expect(mediaFilesOf(after)).toBe(media)
    expect(pictures).toEqual([{ project: info.id, stopped: false }])
  })

  it("tells whoever subscribed when a part changes", async () => {
    const { workspace, session } = await opened()
    const told = vi.fn<() => void>()
    session.subscribe(told)
    const parts = session.getParts()
    workspace.codeChanged(info.id, [button.path], 2)
    expect(told).toHaveBeenCalledOnce()
    expect(session.getParts()).not.toBe(parts)
  })

  it("stops keeping the picture when its tab closes", async () => {
    const { workspace } = await opened()
    await workspace.close(info.id)
    expect(pictures).toEqual([{ project: info.id, stopped: true }])
  })

  it("is a new session when the project reopens, which keeps a picture of its own", async () => {
    const { workspace, session } = await opened()
    const reloading = workspace.reload(info.id)
    await settle()
    opens[1]!(info)
    await settle()
    guest.loads[1]!(loaded)
    await reloading
    expect(workspace.getTab(info.id)!.session).not.toBe(session)
    expect(pictures).toEqual([
      { project: info.id, stopped: true },
      { project: info.id, stopped: false }
    ])
  })
})

describe("a tab closed while its project opens", () => {
  it("closes the project once the service has opened it", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    await workspace.close(info.root)
    expect(workspace.getTabs()).toEqual([])
    opens[0]!(info)
    await opening
    expect(closes).toEqual([info.id])
    expect(guest.loads).toHaveLength(0)
    expect(workspace.getTabs()).toEqual([])
  })

  it("closes the project and lets go of its guest when it closes while the guest loads", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    expect(guest.loads).toHaveLength(1)
    await workspace.close(info.id)
    guest.loads[0]!(loaded)
    await opening
    expect(closes).toEqual([info.id])
    expect(guest.released).toEqual([info.guestUrl])
    expect(workspace.getTabs()).toEqual([])
  })

  it("leaves a project open that opened again before the first open finished", async () => {
    const workspace = new Workspace()
    const first = workspace.open(info.root)
    await workspace.close(info.root)
    const second = workspace.open(info.root)
    opens[0]!(info)
    opens[1]!(info)
    await settle()

    for (const load of guest.loads) {
      load(loaded)
    }

    await Promise.all([first, second])
    expect(closes).toEqual([])
    expect(workspace.getTab(info.id)?.status).toBe("ready")
  })

  it("closes the project when the reopened tab closes too, before either open finished", async () => {
    const workspace = new Workspace()
    const first = workspace.open(info.root)
    await workspace.close(info.root)
    const second = workspace.open(info.root)
    await workspace.close(info.root)
    opens[0]!(info)
    opens[1]!(info)
    await Promise.all([first, second])
    expect(closes).not.toHaveLength(0)
    expect(closes.every((id) => id === info.id)).toBe(true)
    expect(guest.loads).toHaveLength(0)
    expect(workspace.getTabs()).toEqual([])
  })

  it("leaves the default project open for a tab that opened it again and doesn't know it yet", async () => {
    const workspace = new Workspace()
    const first = workspace.open(undefined)
    await workspace.close(workspace.getTabs()[0]!.id)
    const second = workspace.open(undefined)
    opens[0]!(info)
    await first
    expect(closes).toEqual([])
    opens[1]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await second
    expect(closes).toEqual([])
    expect(workspace.getTab(info.id)?.status).toBe("ready")
  })

  it("closes it once the tab opening meanwhile turns out to be another project", async () => {
    const workspace = new Workspace()
    const first = workspace.open(undefined)
    await workspace.close(workspace.getTabs()[0]!.id)
    const second = workspace.open(undefined)
    opens[0]!(info)
    await first
    expect(closes).toEqual([])
    opens[1]!({ ...info, id: "/projects/other", root: "/projects/other", name: "other" })
    await settle()
    expect(closes).toEqual([info.id])
    guest.loads[0]!(loaded)
    await second
    expect(workspace.getTab("/projects/other")?.status).toBe("ready")
  })

  it("closes the project when its guest fails to load after the tab closed", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    await workspace.close(info.id)
    guest.failures[0]!(new Error("The guest didn't load"))
    expect((await opening).status).toBe("error")
    expect(closes).toEqual([info.id])
    expect(workspace.getTabs()).toEqual([])
  })

  it("closes the project a reopen started when its tab closes during the reopen", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    const reloading = workspace.reload(info.id)
    await settle()
    expect(closes).toEqual([info.id])
    await workspace.close(info.id)
    opens[1]!(info)
    await reloading
    expect(closes).toEqual([info.id, info.id])
    expect(guest.loads).toHaveLength(1)
    expect(workspace.getTabs()).toEqual([])
  })

  it("doesn't open again when its tab closes while a reopen closes the project", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    const reloading = workspace.reload(info.id)
    await workspace.close(info.id)
    await reloading
    expect(opens).toHaveLength(1)
    expect(closes).toEqual([info.id])
    expect(workspace.getTabs()).toEqual([])
  })

  it("closes the project and lets go of its guest when its tab closes while a reopen loads the guest", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    const reloading = workspace.reload(info.id)
    await settle()
    opens[1]!(info)
    await settle()
    expect(guest.loads).toHaveLength(2)
    await workspace.close(info.id)
    guest.loads[1]!(loaded)
    await reloading
    expect(closes).toEqual([info.id, info.id])
    expect(guest.released).toEqual([info.guestUrl, info.guestUrl])
    expect(workspace.getTabs()).toEqual([])
  })

  it("closes the project when a reopen's guest fails to load after its tab closed", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    const reloading = workspace.reload(info.id)
    await settle()
    opens[1]!(info)
    await settle()
    await workspace.close(info.id)
    guest.failures[1]!(new Error("The guest didn't load"))
    await reloading
    expect(closes).toEqual([info.id, info.id])
    expect(workspace.getTabs()).toEqual([])
  })

  it("opens a project again when asked to detect it again only once what detection reads changed (PAR-820)", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening

    detection.changed = false
    await workspace.detectAgain(info.id)
    expect(closes).toEqual([])

    detection.changed = true
    const detecting = workspace.detectAgain(info.id)
    await vi.waitFor(() => expect(opens).toHaveLength(2))
    opens[1]!(info)
    await settle()
    guest.loads[1]!(loaded)
    await detecting
    expect(closes).toEqual([info.id])
    expect(workspace.getTab(info.id)?.status).toBe("ready")
  })

  it("checks detection again once a tab told it changed while loading is ready (PAR-820)", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    workspace.detectionChanged(info.id)
    detection.changed = true
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    await vi.waitFor(() => expect(closes).toEqual([info.id]))
    expect(opens).toHaveLength(2)
  })

  it("reopens once when asked again while it reopens, so closing the tab cancels it", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    const reloading = workspace.reload(info.id)
    await workspace.reload(info.id)
    await settle()
    expect(opens).toHaveLength(2)
    await workspace.close(info.id)
    opens[1]!(info)
    await reloading
    expect(closes).toEqual([info.id, info.id])
    expect(workspace.getTabs()).toEqual([])
  })

  it("leaves a tab opened again while a reopen saved alone", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    const { store } = workspace.getTab(info.id)!.session!
    let saved!: () => void
    vi.spyOn(store, "hasUnsaved").mockReturnValueOnce(true)
    vi.spyOn(store, "flush").mockReturnValueOnce(new Promise<void>((resolve) => (saved = resolve)))
    const reloading = workspace.reload(info.id)
    await workspace.close(info.id)
    const reopening = workspace.open(info.root)
    opens[1]!(info)
    await settle()
    guest.loads[1]!(loaded)
    await reopening
    const reopened = workspace.getTab(info.id)!.session
    saved()
    await reloading
    expect(opens).toHaveLength(2)
    expect(workspace.getTab(info.id)!.session).toBe(reopened)
  })

  it("keeps a project that finished opening, and closes it with its tab", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    expect(workspace.getTab(info.id)?.status).toBe("ready")
    expect(closes).toEqual([])
    await workspace.close(info.id)
    expect(closes).toEqual([info.id])
  })
})

// docs/editor.md, The start page: Home and new tabs, and what the window remembers about each project (PAR-605).

/** Storage that keeps what's set, as the window's does. */
function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>()

  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) }
}

/** Opens the test's project and lets it finish. */
async function openFully(workspace: InstanceType<typeof Workspace>): Promise<void> {
  const opening = workspace.open(info.root)
  opens.at(-1)!(info)
  await settle()
  guest.loads.at(-1)!(loaded)
  await opening
}

describe("Home and new tabs", () => {
  it("opens a project picked in a new tab in that tab, where the new tab was", () => {
    const workspace = new Workspace()
    workspace.newTab()
    const [first] = workspace.getTabs()
    workspace.newTab()
    workspace.activate(first!.id)
    void workspace.open(info.root)
    expect(workspace.getTabs().map((tab) => tab.id)).toEqual([info.root, "new-2"])
    expect(workspace.getActiveId()).toBe(info.root)
  })

  it("switches to a project that's already open, closing the new tab it was picked from", async () => {
    vi.stubGlobal("localStorage", memoryStorage())
    const workspace = new Workspace()
    await openFully(workspace)
    workspace.newTab()
    await workspace.open(info.root)
    expect(workspace.getTabs().map((tab) => tab.id)).toEqual([info.id])
    expect(workspace.getActiveId()).toBe(info.id)
  })

  it("opens a project in a tab of its own from Home", () => {
    const workspace = new Workspace()
    workspace.newTab()
    workspace.activate(homeTab)
    void workspace.open(info.root)
    expect(workspace.getTabs().map((tab) => tab.id)).toEqual(["new-1", info.root])
  })

  it("shows Home once the last tab closes", async () => {
    const workspace = new Workspace()
    workspace.newTab()
    expect(workspace.isHomeActive()).toBe(false)
    await workspace.close("new-1")
    expect(workspace.isHomeActive()).toBe(true)
  })

  it("leaves new tabs out of the tabs agents see", () => {
    const workspace = new Workspace()
    void workspace.open(info.root)
    workspace.newTab()
    expect(workspace.summaries().map((tab) => tab.id)).toEqual([info.root])
  })

  it("remembers when a project opened, and keeps a starred one after it leaves the recent list", async () => {
    vi.stubGlobal("localStorage", memoryStorage())
    const workspace = new Workspace()
    await openFully(workspace)
    expect(workspace.getProjects()).toEqual([
      { root: info.root, name: "app", opened: expect.any(Number), starred: false, recent: true }
    ])
    workspace.star(info.root, true)
    workspace.forgetRecent(info.root)
    const later = new Workspace()
    expect(later.getProjects()).toEqual([
      { root: info.root, name: "app", opened: expect.any(Number), starred: true, recent: false }
    ])
    later.star(info.root, false)
    expect(later.getProjects()).toEqual([])
  })

  it("lets go of a project's picture once the start page stops listing it (PAR-607)", async () => {
    vi.stubGlobal("localStorage", memoryStorage())
    const workspace = new Workspace()
    await openFully(workspace)
    expect(picturesKept.at(-1)).toEqual([info.root])
    workspace.star(info.root, true)
    workspace.forgetRecent(info.root)
    expect(picturesKept.at(-1)).toEqual([info.root])
    workspace.star(info.root, false)
    expect(picturesKept.at(-1)).toEqual([])
  })

  it("starts with no notes when the saved ones can't be read", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "parity.projects" ? JSON.stringify({ "/a": { starred: "yes" } }) : null)
    })
    expect(new Workspace().getProjects()).toEqual([])
  })
})

// docs/editor.md, Reopening loads the project afresh: a builder started again on a new port has the tab draw its guest
// from there (PAR-433).
describe("moveGuest", () => {
  const moved = "http://127.0.0.1:5002/guest"

  async function opened() {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening

    return workspace
  }

  it("draws the tab from its guest at the new address, and lets go of the old one", async () => {
    const workspace = await opened()
    const { tokens } = workspace.getTab(info.id)!.session!
    const moving = workspace.moveGuest(info.id, moved)
    expect(guest.loads).toHaveLength(2)
    const fresh = { guest: { fresh: true }, sheet: {}, tokens: [] }
    guest.loads[1]!(fresh)
    expect(await moving).toBe(true)
    const { session } = workspace.getTab(info.id)!
    expect(session!.info.guestUrl).toBe(moved)
    expect(session!.loaded).toBe(fresh)
    expect(session!.tokens).not.toBe(tokens)
    expect(guest.released).toEqual([info.guestUrl])
  })

  it("does nothing when the guest is where the tab already loads it from", async () => {
    const workspace = await opened()
    expect(await workspace.moveGuest(info.id, info.guestUrl)).toBe(true)
    expect(guest.loads).toHaveLength(1)
    expect(guest.released).toEqual([])
  })

  it("keeps the tab on its old guest, and says it didn't move, when the new address doesn't load", async () => {
    const workspace = await opened()
    const moving = workspace.moveGuest(info.id, moved)
    guest.failures[1]!(new Error("The builder isn't preloadAnswers"))
    expect(await moving).toBe(false)
    expect(workspace.getTab(info.id)!.session!.info.guestUrl).toBe(info.guestUrl)
    expect(guest.released).toEqual([])
  })

  it("draws a tab that was still loading from where its guest moved, once it's ready", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    // The service is told it didn't move, so the next restart tells the window again.
    expect(await workspace.moveGuest(info.id, moved)).toBe(false)
    guest.loads[0]!(loaded)
    await opening
    expect(guest.loads).toHaveLength(2)
    guest.loads[1]!({ guest: { fresh: true }, sheet: {}, tokens: [] })
    await settle()
    expect(workspace.getTab(info.id)!.session!.info.guestUrl).toBe(moved)
    expect(guest.released).toEqual([info.guestUrl])
  })

  for (const order of ["first", "last"] as const) {
    it(`draws from the latest move when an earlier one's guest loads ${order}`, async () => {
      const workspace = await opened()
      const latest = "http://127.0.0.1:5006/guest"
      const earlier = workspace.moveGuest(info.id, moved)
      const later = workspace.moveGuest(info.id, latest)
      const loadEarlier = () => guest.loads[1]!({ guest: { earlier: true }, sheet: {}, tokens: [] })
      const loadLater = () => guest.loads[2]!({ guest: { later: true }, sheet: {}, tokens: [] })

      if (order === "first") {
        loadEarlier()
      }

      loadLater()

      if (order === "last") {
        loadEarlier()
      }

      expect(await Promise.all([earlier, later])).toEqual([false, true])
      expect(workspace.getTab(info.id)!.session!.info.guestUrl).toBe(latest)
      expect(workspace.getTab(info.id)!.session!.loaded.guest).toEqual({ later: true })
      expect([...guest.released].sort()).toEqual([info.guestUrl, moved].sort())
    })
  }

  it("lets go of the moved guest when the tab reopens while it loads", async () => {
    const workspace = await opened()
    const moving = workspace.moveGuest(info.id, moved)
    const reloading = workspace.reload(info.id)
    await settle()
    const reopened = { ...info, guestUrl: "http://127.0.0.1:5004/guest" }
    opens[1]!(reopened)
    await settle()
    guest.loads[2]!(loaded)
    await reloading
    guest.loads[1]!({ guest: { stale: true }, sheet: {}, tokens: [] })
    expect(await moving).toBe(false)
    expect(workspace.getTab(info.id)!.session!.info.guestUrl).toBe(reopened.guestUrl)
    expect(guest.released).toEqual([info.guestUrl, moved])
  })
})

// docs/telemetry.md: a write's `document.saved` or `document.saveFailed` is in the trace it was asked in (PAR-752).
describe("recording a save", () => {
  const sink = createTestSink()
  traceWith(
    createTelemetry({
      events: registeredEvents,
      context: { process: "renderer", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )

  const about: ContainerSpec = {
    id: "about",
    name: "About",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }]
  }

  const save = { action: "save", from: "key" as const, enabled: true, layers: 0, designs: 0 }

  /** Saves an added design with Save, giving where `command.ran` sat and what the save recorded. */
  async function saveWith(answer: () => Promise<undefined>) {
    sink.clear()
    saving.answer = answer
    vi.stubGlobal("localStorage", memoryStorage())
    const workspace = new Workspace()
    await openFully(workspace)
    const { store } = workspace.getTab(info.id)!.session!
    store.addContainer(info.mainDocument, about)
    await tracedCommand(save, () => store.flush()).catch(() => undefined)
    const ran = sink.spans.find(({ name }) => name === "command.ran")

    return {
      command: { traceId: ran!.traceId, spanId: ran!.spanId },
      recorded: tracked.filter(({ name }) => name.startsWith("document.save"))
    }
  }

  it("records a write in the trace Save asked for it in", async () => {
    const { command, recorded } = await saveWith(() => Promise.resolve(undefined))
    expect(recorded).toMatchObject([{ name: "document.saved", attributes: { file: "app.par" }, span: command }])
  })

  it("records a failed write in that trace too", async () => {
    const { command, recorded } = await saveWith(() => Promise.reject(new Error("Disk full")))
    expect(recorded).toMatchObject([{ name: "document.saveFailed", attributes: { file: "app.par" }, span: command }])
  })
})
