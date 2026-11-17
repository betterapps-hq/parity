import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { addContainer } from "@parity-app/multiplayer"
import { changeProjectsData, type Projects, type ProjectsChange, type SavedTabs } from "@parity-app/settings"
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
import type * as WindowModules from "./window-modules.ts"
import type { ProjectSession } from "./workspace.ts"

// docs/editor.md, Opening and closing projects: a project closed while it opens, as one restored at launch can be,
// closes in the service once the service has it, so its builder doesn't run on with nothing to show it (PAR-427).

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

/** How the person answers the question about unsaved changes, and the projects each question named. */
interface UnsavedAnswers {
  answer: "save" | "discard" | "cancel"
  asked: string[][]
}

const unsaved = vi.hoisted(() => {
  const state: UnsavedAnswers = { answer: "discard", asked: [] }

  return state
})

vi.mock("./chrome/unsaved.ts", () => ({
  askAboutUnsaved: (names: string[]) => {
    unsaved.asked.push(names)

    return Promise.resolve(unsaved.answer)
  }
}))

/** A live room the tab's window modules join as the project opens, and lets the project open alone when it's told. */
const room = vi.hoisted(() => ({ joining: false, alone: (): void => undefined }))

vi.mock("./window-modules.ts", async (original) => {
  const real = await original<typeof WindowModules>()

  return {
    ...real,
    startTabModules: async (...args: Parameters<typeof real.startTabModules>) => {
      const modules = await real.startTabModules(...args)

      return room.joining
        ? {
            ...modules,
            joining: true,
            opening: () => new Promise<undefined>((resolve) => (room.alone = () => resolve(undefined)))
          }
        : modules
    }
  }
})

const { Workspace } = await import("./workspace.ts")
const { mediaFilesOf } = await import("./media/project-media.ts")

const info: ProjectInfo = {
  id: "/projects/app",
  root: "/projects/app",
  name: "app",
  renderer: { id: "react", name: "React" },
  guestUrl: "http://127.0.0.1:5000/guest",
  builder: { id: "vite", name: "Vite", toolVersion: "8" },
  theme: [],
  routes: [],
  entities: {},
  componentCount: 0,
  notes: [],
  status: [],
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

/** What main keeps for the window, as `state.json` does: the projects, the project it claims, and each it was told. */
interface MainKeeps {
  projects: Projects
  tabs: SavedTabs
  saved: SavedTabs[]
}

let kept: MainKeeps

beforeEach(() => {
  room.joining = false
  tracked.length = 0
  pictures.length = 0
  unsaved.answer = "discard"
  unsaved.asked.length = 0
  opens = []
  closes = []
  picturesKept = []
  checked = []
  folders = { missing: [] }
  detection.changed = false
  guest.loads.length = 0
  guest.failures.length = 0
  guest.released.length = 0
  kept = { projects: { recent: [], notes: {} }, tabs: { roots: [] }, saved: [] }
  vi.stubGlobal("window", {
    canvasHost: {
      // Main, keeping the projects and the project as `projects.json` and `state.json` would.
      saved: () => ({ values: {}, projects: kept.projects }),
      projects: {
        change: (change: ProjectsChange) => {
          kept.projects = changeProjectsData(kept.projects, change, Date.now())

          return Promise.resolve(kept.projects)
        },
        subscribe: () => () => undefined
      },
      state: {
        set: () => undefined,
        claimTabs: () => Promise.resolve(kept.tabs),
        saveTabs: (tabs: SavedTabs) => void kept.saved.push(tabs)
      },
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

        // The window modules the tab starts before its document opens: none here.
        if (method === "extensions.list") {
          return Promise.resolve({ extensions: [], logs: {} })
        }

        if (method === "start.check") {
          checked.push(params.roots!)

          return Promise.resolve(folders)
        }

        // Nothing else the project asks for answers, as nothing the test checks waits on it.
        return new Promise(() => undefined)
      })
    }
  })
})

afterEach(() => vi.unstubAllGlobals())

/** Lets the workspace's awaits run on. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** The workspace's project, when it's the one with `id`. */
function projectWith(workspace: InstanceType<typeof Workspace>, id: string) {
  const project = workspace.getProject()

  return project?.id === id ? project : undefined
}

describe("starting the workspace", () => {
  it("leaves a fresh install on Home", async () => {
    const workspace = new Workspace()
    await workspace.restore()
    expect(opens).toHaveLength(0)
    expect(workspace.getProject()).toBeUndefined()
  })

  it("reopens the project from last time", async () => {
    kept.tabs = { roots: [info.root], active: info.root }
    const workspace = new Workspace()
    await workspace.restore()
    expect(opens).toHaveLength(1)
    expect(workspace.getProject()?.id).toBe(info.root)
  })

  it("reopens only the project a window kept several of showed, as windows did before one project each", async () => {
    kept.tabs = { roots: ["/projects/other", info.root, "/projects/third"], active: info.root }
    const workspace = new Workspace()
    await workspace.restore()
    expect(opens).toHaveLength(1)
    expect(workspace.getProject()?.id).toBe(info.root)
  })

  it("opens only the project requested by the dev runner, and keeps none for next time", async () => {
    kept.tabs = { roots: ["/another/project"] }
    window.canvasHost.initialProject = info.root
    const workspace = new Workspace()
    await workspace.restore()
    expect(opens).toHaveLength(1)
    expect(workspace.getProject()?.id).toBe(info.root)
    await workspace.close()
    expect(kept.saved).toEqual([])
  })

  it("tells main its project once it has claimed one, and that there's none once it closes", async () => {
    const workspace = new Workspace()
    await workspace.restore()
    void workspace.open(info.root)
    expect(kept.saved.at(-1)).toEqual({ roots: [info.root], active: info.root })
    await workspace.close()
    expect(kept.saved.at(-1)).toEqual({ roots: [] })
  })
})

describe("recording a project as loaded (PAR-694)", () => {
  /** Whether each `project.loaded` was for a project the window opened as it started. */
  const restored = () =>
    tracked.filter(({ name }) => name === "project.loaded").map(({ attributes }) => attributes.restored)

  it("marks the project from last time as restored", async () => {
    kept.tabs = { roots: [info.root] }
    await new Workspace().restore()
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await settle()
    expect(restored()).toEqual([true])
  })

  it("marks a project the person opens as not restored", async () => {
    const opening = new Workspace().open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    expect(restored()).toEqual([false])
  })

  it("doesn't count a project as loaded when it closed while the guest loaded", async () => {
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

describe("opening in a live room (PAR-1276)", () => {
  it("says it's joining the live room while the room holds the opening, and that it opens alone if no one answers", async () => {
    room.joining = true
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await settle()

    expect(workspace.getProject()).toMatchObject({
      status: "loading",
      message: "Joining the live room…",
      progress: {
        steps: ["Starting Vite", "Loading components from Vite", "Joining the live room"],
        current: 2,
        note: "If no one answers, it opens without the room."
      }
    })

    room.alone()
    await opening
    expect(workspace.getProject()?.status).toBe("ready")
  })

  it("doesn't mention a room when no extension brings one", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    expect(workspace.getProject()?.progress).toEqual({
      steps: ["Starting Vite", "Loading components from Vite"],
      current: 1
    })
    guest.loads[0]!(loaded)
    await opening
  })
})

describe("checking the start page's folders (PAR-188)", () => {
  it("flags listed projects whose folders are gone, and keeps the example's folder", async () => {
    kept.projects = { recent: ["/apps/site", "/apps/gone"], notes: {} }
    folders = { missing: ["/apps/gone"], example: "/parity/examples/shadcn-vite" }
    const workspace = new Workspace()
    await workspace.restore()
    await settle()
    expect(checked).toEqual([["/apps/site", "/apps/gone"]])
    expect(workspace.getProjects().map(({ root, missing }) => ({ root, missing }))).toEqual([
      { root: "/apps/site", missing: undefined },
      { root: "/apps/gone", missing: true }
    ])
    expect(workspace.getExample()).toBe("/parity/examples/shadcn-vite")
  })

  it("checks again when the project closes and Home shows, as a folder may come back", async () => {
    kept.projects = { recent: ["/apps/drive"], notes: {} }
    folders = { missing: ["/apps/drive"] }
    const workspace = new Workspace()
    await workspace.restore()
    await settle()
    expect(workspace.getProjects()[0]?.missing).toBe(true)
    await openFully(workspace)
    folders = { missing: [] }
    await workspace.close()
    await settle()
    expect(workspace.getProjects().find(({ root }) => root === "/apps/drive")?.missing).toBeUndefined()
  })
})

describe("a closed project", () => {
  it("lets go of its editor, so a project React still holds keeps no canvas", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    // SAFETY: the workspace only holds the editor and lets it go; nothing here calls it.
    const editor = {} as NonNullable<ProjectSession["editor"]>
    workspace.setEditor(info.id, editor)
    const held = workspace.getProject()
    expect(held?.session?.editor).toBe(editor)
    await workspace.close(info.id)
    expect(held?.session?.editor).toBeUndefined()
  })
})

// docs/editor.md, The start page: a project's picture is taken as it opens and after saves, not again when its code
// changes or the service restarts, since its session stays the same object until it closes (PAR-1004).
describe("an open project's session", () => {
  const button = { id: "button", name: "Button", path: "src/Button.tsx", export: "Button" }

  async function opened() {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!({ ...info, sources: { button } })
    await settle()
    guest.loads[0]!(loaded)
    await opening

    return { workspace, session: projectWith(workspace, info.id)!.session! }
  }

  it("stays the same object when the project's code changes, keeping its media and its picture", async () => {
    const { workspace, session } = await opened()
    const media = mediaFilesOf(session)
    workspace.codeChanged(info.id, [button.path], 2)
    const after = projectWith(workspace, info.id)!.session!
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
    const after = projectWith(workspace, info.id)!.session!
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

  it("stops keeping the picture when it closes", async () => {
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
    expect(projectWith(workspace, info.id)!.session).not.toBe(session)
    expect(pictures).toEqual([
      { project: info.id, stopped: true },
      { project: info.id, stopped: false }
    ])
  })
})

describe("a project closed while it opens", () => {
  it("closes the project once the service has opened it", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    await workspace.close(info.root)
    expect(workspace.getProject()).toBeUndefined()
    opens[0]!(info)
    await opening
    expect(closes).toEqual([info.id])
    expect(guest.loads).toHaveLength(0)
    expect(workspace.getProject()).toBeUndefined()
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
    expect(workspace.getProject()).toBeUndefined()
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
    expect(projectWith(workspace, info.id)?.status).toBe("ready")
  })

  it("closes the project when it closes again too, before either open finished", async () => {
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
    expect(workspace.getProject()).toBeUndefined()
  })

  it("leaves the default project open for an open that asked again and doesn't know it yet", async () => {
    const workspace = new Workspace()
    const first = workspace.open(undefined)
    await workspace.close()
    const second = workspace.open(undefined)
    opens[0]!(info)
    await first
    expect(closes).toEqual([])
    opens[1]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await second
    expect(closes).toEqual([])
    expect(projectWith(workspace, info.id)?.status).toBe("ready")
  })

  it("closes it once the open meanwhile turns out to be another project", async () => {
    const workspace = new Workspace()
    const first = workspace.open(undefined)
    await workspace.close()
    const second = workspace.open(undefined)
    opens[0]!(info)
    await first
    expect(closes).toEqual([])
    opens[1]!({ ...info, id: "/projects/other", root: "/projects/other", name: "other" })
    await settle()
    expect(closes).toEqual([info.id])
    guest.loads[0]!(loaded)
    await second
    expect(projectWith(workspace, "/projects/other")?.status).toBe("ready")
  })

  it("closes the project when its guest fails to load after it closed", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    await workspace.close(info.id)
    guest.failures[0]!(new Error("The guest didn't load"))
    expect((await opening)?.status).toBe("error")
    expect(closes).toEqual([info.id])
    expect(workspace.getProject()).toBeUndefined()
  })

  it("closes the project a reopen started when it closes during the reopen", async () => {
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
    expect(workspace.getProject()).toBeUndefined()
  })

  it("doesn't open again when it closes while a reopen closes the project", async () => {
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
    expect(workspace.getProject()).toBeUndefined()
  })

  it("closes the project and lets go of its guest when it closes while a reopen loads the guest", async () => {
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
    expect(workspace.getProject()).toBeUndefined()
  })

  it("closes the project when a reopen's guest fails to load after it closed", async () => {
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
    expect(workspace.getProject()).toBeUndefined()
  })

  const restarted = { ...info, guestUrl: "http://127.0.0.1:5008/guest" }

  it("closes the project a reconnect reopened when it closed meanwhile (PAR-978)", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const reconnecting = workspace.reconnect()
    await workspace.close(info.id)
    expect(closes).toEqual([info.id])
    opens[1]!(restarted)
    await reconnecting
    expect(closes).toEqual([info.id, info.id])
    expect(guest.loads).toHaveLength(1)
    expect(workspace.getProject()).toBeUndefined()
  })

  it("closes the project and lets go of the guest a reconnect loaded when it closed meanwhile (PAR-978)", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const reconnecting = workspace.reconnect()
    opens[1]!(restarted)
    await settle()
    await workspace.close(info.id)
    guest.loads[1]!(loaded)
    await reconnecting
    expect(closes).toEqual([info.id, info.id])
    expect(guest.released).toEqual([info.guestUrl, restarted.guestUrl])
    expect(workspace.getProject()).toBeUndefined()
  })

  it("closes the project when a reconnect's guest fails to load after it closed (PAR-978)", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const reconnecting = workspace.reconnect()
    opens[1]!(restarted)
    await settle()
    await workspace.close(info.id)
    guest.failures[1]!(new Error("The guest didn't load"))
    await reconnecting
    expect(closes).toEqual([info.id, info.id])
    expect(workspace.getProject()).toBeUndefined()
  })

  it("leaves one project and one guest for a project closed and opened again during a reconnect (PAR-978)", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const reconnecting = workspace.reconnect()
    opens[1]!(restarted)
    await settle()
    await workspace.close(info.id)
    const reopening = workspace.open(info.root)
    opens[2]!(restarted)
    await settle()
    const fresh = { guest: { fresh: true }, sheet: {}, tokens: [] }
    guest.loads[2]!(fresh)
    await reopening
    guest.loads[1]!(loaded)
    await reconnecting
    expect(closes).toEqual([info.id])
    expect(guest.released).toEqual([info.guestUrl])
    const { session } = projectWith(workspace, info.id)!
    expect(session?.info.guestUrl).toBe(restarted.guestUrl)
    expect(session?.loaded).toBe(fresh)
  })

  it("draws the project from the latest reconnect when the service restarts again during one (PAR-978)", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const first = workspace.reconnect()
    const second = workspace.reconnect()
    const again = { ...info, guestUrl: "http://127.0.0.1:5016/guest" }
    opens[2]!(again)
    await settle()
    const latest = { guest: { latest: true }, sheet: {}, tokens: [] }
    guest.loads[1]!(latest)
    await second
    opens[1]!(restarted)
    await first
    expect(guest.loads).toHaveLength(2)
    const { session } = projectWith(workspace, info.id)!
    expect(session?.info.guestUrl).toBe(again.guestUrl)
    expect(session?.loaded).toBe(latest)
    expect(closes).toEqual([])
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
    expect(projectWith(workspace, info.id)?.status).toBe("ready")
  })

  it("checks detection again once a project told it changed while loading is ready (PAR-820)", async () => {
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

  it("reopens once when asked again while it reopens, so closing the project cancels it", async () => {
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
    expect(workspace.getProject()).toBeUndefined()
  })

  it("leaves a project opened again while a reopen saved alone", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    const { saver } = projectWith(workspace, info.id)!.session!
    let saved!: () => void
    vi.spyOn(saver, "hasUnsaved").mockReturnValueOnce(true)
    vi.spyOn(saver, "flush").mockReturnValueOnce(new Promise<void>((resolve) => (saved = resolve)))
    const reloading = workspace.reload(info.id)
    await workspace.close(info.id)
    const reopening = workspace.open(info.root)
    opens[1]!(info)
    await settle()
    guest.loads[1]!(loaded)
    await reopening
    const reopened = projectWith(workspace, info.id)!.session
    saved()
    await reloading
    expect(opens).toHaveLength(2)
    expect(projectWith(workspace, info.id)!.session).toBe(reopened)
  })

  it("keeps a project that finished opening, until it's closed", async () => {
    const workspace = new Workspace()
    const opening = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.loads[0]!(loaded)
    await opening
    expect(projectWith(workspace, info.id)?.status).toBe("ready")
    expect(closes).toEqual([])
    await workspace.close(info.id)
    expect(closes).toEqual([info.id])
  })
})

// docs/editor.md, One project per window, and Home: what the window remembers about each project (PAR-605, PAR-1241).

/** Storage that keeps what's set, as the window's does. */
/** Opens the test's project and lets it finish. */
async function openFully(workspace: InstanceType<typeof Workspace>): Promise<void> {
  const opening = workspace.open(info.root)
  opens.at(-1)!(info)
  await settle()
  guest.loads.at(-1)!(loaded)
  await opening
}

describe("one project per window", () => {
  const other = { ...info, id: "/projects/other", root: "/projects/other", name: "other" }

  it("opens a project in place of the open one, which closes and lets go of its guest", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const opening = workspace.open(other.root)
    expect(closes).toEqual([info.id])
    expect(guest.released).toEqual([info.guestUrl])
    expect(workspace.getProject()?.id).toBe(other.root)
    opens[1]!(other)
    await settle()
    guest.loads[1]!(loaded)
    await opening
    expect(workspace.getProject()?.status).toBe("ready")
  })

  it("asks to save the open project first, and keeps it when that's cancelled", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const { session } = workspace.getProject()!
    vi.spyOn(session!.saver, "hasUnsaved").mockReturnValue(true)
    unsaved.answer = "cancel"
    expect(await workspace.open(other.root)).toBeUndefined()
    expect(unsaved.asked).toEqual([["app"]])
    expect(opens).toHaveLength(1)
    expect(closes).toEqual([])
    expect(workspace.getProject()?.session).toBe(session)
  })

  it("closes the open project once its changes are let go, then opens the other", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    vi.spyOn(workspace.getProject()!.session!.saver, "hasUnsaved").mockReturnValue(true)
    const opening = workspace.open(other.root)
    await settle()
    expect(closes).toEqual([info.id])
    opens[1]!(other)
    await settle()
    guest.loads[1]!(loaded)
    expect((await opening)?.id).toBe(other.id)
  })

  it("closes a project still opening when another opens, in the service once that says it's another", async () => {
    const workspace = new Workspace()
    const first = workspace.open(info.root)
    const second = workspace.open(other.root)
    opens[0]!(info)
    await first
    expect(closes).toEqual([])
    opens[1]!(other)
    await settle()
    expect(closes).toEqual([info.id])
    guest.loads[0]!(loaded)
    await second
    expect(projectWith(workspace, other.id)?.status).toBe("ready")
  })

  it("stays on the open project when it's opened again", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const project = workspace.getProject()
    expect(await workspace.open(info.root)).toBe(project)
    expect(opens).toHaveLength(1)
  })

  it("opens a project again that couldn't open", async () => {
    const workspace = new Workspace()
    const failing = workspace.open(info.root)
    opens[0]!(info)
    await settle()
    guest.failures[0]!(new Error("The guest didn't load"))
    expect((await failing)?.status).toBe("error")
    void workspace.open(info.root)
    expect(opens).toHaveLength(2)
    expect(workspace.getProject()?.status).toBe("loading")
  })

  it("shows Home once the project closes", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    await workspace.close()
    expect(workspace.getProject()).toBeUndefined()
  })

  it("shows an extension's page in the project's place, which goes when it closes or the project does", async () => {
    const workspace = new Workspace()
    await openFully(workspace)
    const page = { projectId: info.id, extension: "storybook", page: "storybook.setupGuide", title: "Storybook setup" }
    workspace.openPage({ ...page, projectId: "/projects/other" })
    expect(workspace.getPage()).toBeUndefined()
    workspace.openPage(page)
    expect(workspace.getPage()).toEqual(page)
    workspace.closePage()
    expect(workspace.getPage()).toBeUndefined()
    workspace.openPage(page)
    await workspace.close()
    expect(workspace.getPage()).toBeUndefined()
  })

  it("gives agents the project as the one tab, and none on Home", () => {
    const workspace = new Workspace()
    expect(workspace.summaries()).toEqual([])
    void workspace.open(info.root)
    expect(workspace.summaries()).toMatchObject([{ id: info.root, active: true, status: "loading" }])
  })

  it("remembers when a project opened, and keeps a starred one after it leaves the recent list", async () => {
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
    const workspace = new Workspace()
    await openFully(workspace)
    expect(picturesKept.at(-1)).toEqual([info.root])
    workspace.star(info.root, true)
    workspace.forgetRecent(info.root)
    expect(picturesKept.at(-1)).toEqual([info.root])
    workspace.star(info.root, false)
    expect(picturesKept.at(-1)).toEqual([])
  })
})

// docs/editor.md, Reopening loads the project afresh: a builder started again on a new port has the project draw its
// guest from there (PAR-433).
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

  it("draws the project from its guest at the new address, and lets go of the old one", async () => {
    const workspace = await opened()
    const { tokens } = projectWith(workspace, info.id)!.session!
    const moving = workspace.moveGuest(info.id, moved)
    expect(guest.loads).toHaveLength(2)
    const fresh = { guest: { fresh: true }, sheet: {}, tokens: [] }
    guest.loads[1]!(fresh)
    expect(await moving).toBe(true)
    const { session } = projectWith(workspace, info.id)!
    expect(session!.info.guestUrl).toBe(moved)
    expect(session!.loaded).toBe(fresh)
    expect(session!.tokens).not.toBe(tokens)
    expect(guest.released).toEqual([info.guestUrl])
  })

  it("does nothing when the guest is where the project already loads it from", async () => {
    const workspace = await opened()
    expect(await workspace.moveGuest(info.id, info.guestUrl)).toBe(true)
    expect(guest.loads).toHaveLength(1)
    expect(guest.released).toEqual([])
  })

  it("keeps the project on its old guest, and says it didn't move, when the new address doesn't load", async () => {
    const workspace = await opened()
    const moving = workspace.moveGuest(info.id, moved)
    guest.failures[1]!(new Error("The builder isn't preloadAnswers"))
    expect(await moving).toBe(false)
    expect(projectWith(workspace, info.id)!.session!.info.guestUrl).toBe(info.guestUrl)
    expect(guest.released).toEqual([])
  })

  it("draws a project that was still loading from where its guest moved, once it's ready", async () => {
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
    expect(projectWith(workspace, info.id)!.session!.info.guestUrl).toBe(moved)
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
      expect(projectWith(workspace, info.id)!.session!.info.guestUrl).toBe(latest)
      expect(projectWith(workspace, info.id)!.session!.loaded.guest).toEqual({ later: true })
      expect([...guest.released].sort()).toEqual([info.guestUrl, moved].sort())
    })
  }

  it("lets go of the moved guest when the project reopens while it loads", async () => {
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
    expect(projectWith(workspace, info.id)!.session!.info.guestUrl).toBe(reopened.guestUrl)
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
    root: { type: "layout", id: "root", children: [] }
  }

  const save = { action: "save", from: "key" as const, enabled: true, layers: 0, designs: 0 }

  /** Saves an added design with Save, giving where `command.ran` sat and what the save recorded. */
  async function saveWith(answer: () => Promise<undefined>) {
    sink.clear()
    saving.answer = answer
    const workspace = new Workspace()
    await openFully(workspace)
    const { doc, saver } = projectWith(workspace, info.id)!.session!
    addContainer(doc, info.mainDocument, about)
    await tracedCommand(save, () => saver.flush()).catch(() => undefined)
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
