import type { Found, SearchAnswer } from "@parity-app/connectors"
import type { UpdateState } from "@parity-app/processes"
import { describe, expect, it, vi } from "vite-plus/test"
import { signedOut } from "../shared/account.ts"
import type { ThemeSource } from "../shared/ipc-checks.ts"
import type { TelemetryState } from "../shared/protocol.ts"
import { type CloseReplies, type HostNeeds, hostHandlers, type PickerOptions } from "./host-handlers.ts"

/** A Parity window, as far as a handler knows one: something to hand back to the app. */
interface TestWindow {
  id: number
}

/** Who sent something any page may send. */
interface Sender {
  page: "parity" | "render"
}

const window: TestWindow = { id: 7 }
const noKey: SearchAnswer = { problem: { code: "no-key", message: "This copy has no key" } }
const telemetryOn: TelemetryState = { level: "all", setting: "all", installId: "install" }

/** The app the handlers need, doing nothing and answering as an idle one would, apart from what a test changes. */
function app(changes: Partial<HostNeeds<Sender, TestWindow>> = {}): HostNeeds<Sender, TestWindow> {
  return {
    account: {
      state: () => signedOut,
      signIn: () => Promise.resolve(),
      reopen: () => Promise.resolve(),
      cancel: () => undefined,
      signOut: () => Promise.resolve(),
      switchOrganization: () => Promise.resolve(),
      use: () => Promise.resolve()
    },
    connectors: {
      states: () => [],
      search: () => Promise.resolve(noKey),
      recent: () => Promise.resolve([]),
      result: () => undefined,
      placed: () => Promise.resolve()
    },
    buildInfo: () => Promise.resolve({ version: "0.3.0", channel: "beta" }),
    telemetry: {
      get: () => telemetryOn,
      setLevel: () => telemetryOn,
      apply: () => undefined,
      secrets: () => [],
      record: () => undefined
    },
    reports: {
      prepare: () => Promise.resolve({}),
      send: () => Promise.resolve("feedback"),
      takeLastCrash: () => undefined
    },
    updates: {
      state: () => undefined,
      check: () => Promise.resolve(),
      setBeta: () => undefined,
      restart: () => undefined
    },
    pickPath: () => Promise.resolve(undefined),
    savePath: () => Promise.resolve(undefined),
    showItem: () => undefined,
    openExternal: () => Promise.resolve(),
    copiedFiles: () => Promise.resolve([]),
    openInEditor: () => Promise.resolve({ opened: "VS Code" }),
    installCli: () => Promise.resolve({ folder: "C:/bin", onPath: true, newTerminal: false }),
    quit: () => undefined,
    toggleDevTools: () => undefined,
    theme: { get: () => "dark", set: () => undefined, remember: () => undefined },
    metrics: () => Promise.resolve([]),
    console: { announce: () => undefined, read: () => [], clear: () => undefined },
    closing: () => undefined,
    ...changes
  }
}

const photo: Found = {
  connector: "unsplash",
  id: "1",
  kind: "photos",
  title: "Desk",
  image: { url: "https://images.example/1.jpg" },
  link: "https://images.example/1",
  credit: [{ name: "Ana" }]
}

describe("connectors", () => {
  it("searches as the window", async () => {
    const search = vi.fn<HostNeeds<Sender, TestWindow>["connectors"]["search"]>(() => Promise.resolve(noKey))
    const handlers = hostHandlers(app({ connectors: { ...app().connectors, search } }))
    const request = { query: "desk", kind: "photos" } as const
    expect(await handlers.connectorsSearch({ connector: "unsplash", request }, window)).toBe(noKey)
    expect(search).toHaveBeenCalledExactlyOnceWith("unsplash", request, "window")
  })

  it("counts a placement only for a result main gave, as the window's", async () => {
    const placed = vi.fn<HostNeeds<Sender, TestWindow>["connectors"]["placed"]>(() => Promise.resolve())
    const where = { project: "D:/shop", file: "screens.par", design: "pricing" }

    const handlers = hostHandlers(
      app({ connectors: { ...app().connectors, placed, result: (_connector, id) => (id === "1" ? photo : undefined) } })
    )

    await handlers.connectorsPlaced({ connector: "unsplash", id: "made-up", ...where }, window)
    expect(placed).not.toHaveBeenCalled()
    await handlers.connectorsPlaced({ connector: "unsplash", id: "1", ...where }, window)
    expect(placed).toHaveBeenCalledExactlyOnceWith(photo, { ...where, from: "window" })
  })
})

describe("updates", () => {
  /** The handlers over an update session in `state`, with what acting on it did. */
  function updating(state: UpdateState | undefined) {
    const openExternal = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve())
    const restart = vi.fn<(asked: TestWindow) => void>()
    const handlers = hostHandlers(app({ openExternal, updates: { ...app().updates, state: () => state, restart } }))

    return { handlers, openExternal, restart }
  }

  it("says updates are off until the app has an update session", async () => {
    expect(await updating(undefined).handlers.updateState(undefined, window)).toEqual({
      phase: "disabled",
      beta: false
    })
    const checking: UpdateState = { phase: "checking", beta: true }
    expect(await updating(checking).handlers.updateState(undefined, window)).toBe(checking)
  })

  it("opens the release's page for an update to install by hand", async () => {
    const { handlers, openExternal, restart } = updating({ phase: "manual", beta: true, version: "1.2.0-beta.1+mac" })
    await handlers.updateAct(undefined, window)
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/betterapps-hq/parity/releases/tag/v1.2.0-beta.1%2Bmac"
    )
    expect(restart).not.toHaveBeenCalled()
  })

  it("restarts the window that asked into an update that's ready, and does nothing before one is", async () => {
    const ready = updating({ phase: "ready", beta: false, version: "1.2.0" })
    await ready.handlers.updateAct(undefined, window)
    expect(ready.restart).toHaveBeenCalledExactlyOnceWith(window)
    expect(ready.openExternal).not.toHaveBeenCalled()

    const downloading = updating({ phase: "checking", beta: false })
    await downloading.handlers.updateAct(undefined, window)
    expect(downloading.restart).not.toHaveBeenCalled()
    expect(downloading.openExternal).not.toHaveBeenCalled()
  })
})

describe("telemetry", () => {
  it("applies the level it saves", async () => {
    const off: TelemetryState = { level: "off", setting: "off", installId: "another" }
    const apply = vi.fn<(state: TelemetryState) => void>()
    const handlers = hostHandlers(app({ telemetry: { ...app().telemetry, setLevel: () => off, apply } }))
    expect(await handlers.telemetryLevel("off", window)).toBe(off)
    expect(apply).toHaveBeenCalledExactlyOnceWith(off)
  })

  it("passes on what a page recorded with who sent it, and gives any page the secrets to scrub", async () => {
    const record = vi.fn<HostNeeds<Sender, TestWindow>["telemetry"]["record"]>()
    const handlers = hostHandlers(app({ telemetry: { ...app().telemetry, record, secrets: () => ["hunter2"] } }))
    const render: Sender = { page: "render" }
    const envelope = { name: "frame.rendered" }
    await handlers.record(envelope, render)
    expect(record).toHaveBeenCalledExactlyOnceWith(envelope, render)
    expect(await handlers.telemetrySecrets(undefined, render)).toEqual(["hunter2"])
  })
})

describe("the system's dialogs", () => {
  it("open over the window that asked", async () => {
    const pickPath = vi.fn<(over: TestWindow, options: PickerOptions) => Promise<string | undefined>>(() =>
      Promise.resolve("D:/shop")
    )

    const savePath = vi.fn<HostNeeds<Sender, TestWindow>["savePath"]>(() => Promise.resolve("D:/shop/copy.par"))
    const handlers = hostHandlers(app({ pickPath, savePath }))

    expect(await handlers.pickFolder(undefined, window)).toBe("D:/shop")
    expect(await handlers.pickFolder("Export to", window)).toBe("D:/shop")
    expect(await handlers.pickProjectFile(undefined, window)).toBe("D:/shop")
    expect(pickPath.mock.calls).toEqual([
      [window, { title: "Open project", properties: ["openDirectory", "createDirectory"] }],
      [window, { title: "Export to", properties: ["openDirectory", "createDirectory"] }],
      [
        window,
        {
          title: "Open project file",
          properties: ["openFile"],
          filters: [{ name: "Parity project", extensions: ["par"] }]
        }
      ]
    ])

    expect(await handlers.saveDialog({ title: "Save a copy" }, window)).toBe("D:/shop/copy.par")
    expect(savePath).toHaveBeenCalledExactlyOnceWith(window, { title: "Save a copy" })
  })
})

describe("the theme", () => {
  it("changes only to another, and stays changed when it can't be remembered", async () => {
    let now: ThemeSource = "dark"
    const remember = vi.fn<(theme: ThemeSource) => void>()

    const theme = {
      get: () => now,
      set: (next: ThemeSource) => {
        now = next
      },
      remember
    }

    const handlers = hostHandlers(app({ theme }))
    await handlers.setTheme("dark", window)
    expect(remember).not.toHaveBeenCalled()
    await handlers.setTheme("light", window)
    expect(now).toBe("light")
    expect(remember).toHaveBeenCalledExactlyOnceWith("light")

    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    remember.mockImplementation(() => {
      throw new Error("EPERM")
    })
    await handlers.setTheme("system", window)
    expect(now).toBe("system")
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })
})

describe("what a window tells", () => {
  it("announces a console message's frame for the window that sent it (PAR-147)", async () => {
    const announce = vi.fn<HostNeeds<Sender, TestWindow>["console"]["announce"]>()
    const handlers = hostHandlers(app({ console: { ...app().console, announce } }))
    await handlers.consoleAnnounce({ level: "warning", design: "app.par#pricing", state: "default" }, window)
    expect(announce).toHaveBeenCalledExactlyOnceWith(window, "warning", { design: "app.par#pricing", state: "default" })
  })

  it("settles the close its window is deciding on, and nothing for a window that's gone", async () => {
    const pending = vi.fn<() => void>()
    const ready = vi.fn<() => void>()
    const cancel = vi.fn<() => void>()
    const replies: CloseReplies = { pending, ready, cancel }
    const handlers = hostHandlers(app({ closing: (asked) => (asked === window ? replies : undefined) }))
    await handlers.closePending(undefined, window)
    await handlers.closeCancel(undefined, window)
    expect(pending).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(ready).not.toHaveBeenCalled()

    await handlers.closeReady(undefined, { id: 8 })
    expect(ready).not.toHaveBeenCalled()
    await handlers.closeReady(undefined, window)
    expect(ready).toHaveBeenCalledOnce()
  })
})
