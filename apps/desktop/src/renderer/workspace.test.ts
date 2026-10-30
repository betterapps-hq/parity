import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { ProjectInfo } from "../shared/protocol.ts"

// docs/editor.md, Opening and closing projects: a tab closed while its project opens, as tabs restored at launch can
// be, closes the project once the service has it, so its builder doesn't run on with no tab (PAR-427).

const guest = vi.hoisted(() => ({
  loads: [] as Array<(value: unknown) => void>,
  failures: [] as Array<(error: Error) => void>,
  released: [] as string[]
}))
vi.mock("./guest.ts", () => ({
  loadGuest: () =>
    new Promise((resolve, reject) => {
      guest.loads.push(resolve)
      guest.failures.push(reject)
    }),
  releaseGuest: (url: string) => guest.released.push(url),
  previewToken: () => undefined
}))

const { Workspace } = await import("./workspace.ts")

const info = {
  id: "/projects/app",
  root: "/projects/app",
  name: "app",
  guestUrl: "http://127.0.0.1:5000/guest",
  builder: { id: "vite", name: "Vite" },
  theme: [],
  documents: [],
  mainDocument: "app.par",
  modes: { settings: {}, custom: false },
  sources: {}
} as unknown as ProjectInfo
const loaded = { guest: {}, sheet: {}, tokens: [] }

let opens: Array<(value: ProjectInfo) => void>
let closes: string[]

beforeEach(() => {
  opens = []
  closes = []
  guest.loads.length = 0
  guest.failures.length = 0
  guest.released.length = 0
  vi.stubGlobal("window", {
    canvasHost: {
      request: (method: string, params: { projectId?: string }) => {
        if (method === "project.open") return new Promise((resolve) => opens.push(resolve))
        if (method === "project.close") {
          closes.push(params.projectId!)
          return Promise.resolve(undefined)
        }
        // Nothing else the tab asks for answers, as nothing the test checks waits on it.
        return new Promise(() => undefined)
      }
    }
  })
})
afterEach(() => vi.unstubAllGlobals())

/** Lets the workspace's awaits run on. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

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
    for (const load of guest.loads) load(loaded)
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
