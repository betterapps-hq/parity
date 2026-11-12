import type { Handlers, NodeEmitter } from "@parity-app/channel"
import type { serviceCrash, serviceExit } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { MainMethods } from "../shared/service.ts"
import { onPage } from "./parity-page.ts"
import { createProjectService, type ServiceProcess } from "./project-service.ts"

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A forked service, which a test makes print and exit. */
interface FakeService extends ServiceProcess {
  killed: boolean
  print(text: string): void
  exit(exitCode: number): void
}

function fakeService(): FakeService {
  const output: ((text: string) => void)[] = []
  const exits: ((exitCode: number) => void)[] = []
  const messages: NodeEmitter = { on: () => undefined, postMessage: () => undefined }

  const service: FakeService = {
    messages,
    killed: false,
    onOutput: (listener) => void output.push(listener),
    onSpawn: () => undefined,
    onExit: (listener) => void exits.push(listener),
    kill() {
      service.killed = true
    },
    print(text) {
      for (const listener of output) {
        listener(text)
      }
    },
    exit(exitCode) {
      for (const listener of exits) {
        listener(exitCode)
      }
    }
  }

  return service
}

interface FakeWindow {
  name: string
  loading: boolean
  /** The page's address, when it isn't Parity's page as it opened. */
  url?: string
}

/** Parity's page in a development copy. */
const parityUrl = "http://localhost:5310/"

// SAFETY: the lifecycle passes handlers to the channel without calling them, and these tests never send it a request.
const handlers = {} as Handlers<MainMethods>

function setup({ missing }: { missing?: string } = {}) {
  const forked: FakeService[] = []
  const windows: FakeWindow[] = []
  const joined: [FakeService, string][] = []
  let quitting = false
  let clock = 0

  const telemetry = {
    started: vi.fn<(restarted: boolean) => void>(),
    spawned: vi.fn<() => void>(),
    exited: vi.fn<(exit: Parameters<typeof serviceExit>[0]) => void>(),
    crashed: vi.fn<(exit: Parameters<typeof serviceCrash>[0]) => void>()
  }

  const service = createProjectService<FakeService, FakeWindow>({
    fork() {
      const fresh = fakeService()
      forked.push(fresh)

      return fresh
    },
    handlers,
    windows: () => windows,
    loading: (window) => window.loading,
    parityPage: (window) => onPage(window.url ?? parityUrl, parityUrl),
    join: (to, window) => void joined.push([to, window.name]),
    quitting: () => quitting,
    missingEntry: () => missing,
    telemetry,
    now: () => clock
  })

  return {
    service,
    forked,
    windows,
    joined,
    telemetry,
    quit: () => {
      quitting = true
    },
    wait: (ms: number) => {
      clock += ms
    }
  }
}

describe("createProjectService", () => {
  it("starts a service for the first window that connects, and connects later ones to it", () => {
    const { service, forked, windows, joined } = setup()
    const first = { name: "first", loading: true }
    const second = { name: "second", loading: true }
    windows.push(first, second)
    service.connect(first)
    service.connect(second)
    expect(forked).toHaveLength(1)
    expect(joined).toEqual([
      [forked[0], "first"],
      [forked[0], "second"]
    ])
    expect(service.channel()).toBeDefined()
  })

  it("reconnects every window to a fresh service, but a page still loading only once it's loaded", () => {
    const { service, forked, windows, joined } = setup()
    const loaded = { name: "loaded", loading: true }
    windows.push({ name: "open", loading: false }, { name: "loading", loading: true }, loaded)
    service.start(loaded)
    expect(joined).toEqual([
      [forked[0], "open"],
      [forked[0], "loaded"]
    ])
  })

  it("gives a reload of Parity's page a fresh channel, and a page the window was taken to none", () => {
    const { service, forked, windows, joined } = setup()
    const window: FakeWindow = { name: "window", loading: true }
    windows.push(window)
    service.connect(window)
    // The person reloads the page, which keeps its query.
    window.url = `${parityUrl}?project=demo`
    service.connect(window)
    // A link in a design's code took the window to another site.
    window.url = "https://example.com/"
    service.connect(window)
    expect(joined).toEqual([
      [forked[0], "window"],
      [forked[0], "window"]
    ])
  })

  it("starts no service for a page that isn't Parity's, and leaves it out when one starts", () => {
    const { service, forked, windows, joined } = setup()
    const elsewhere = { name: "elsewhere", loading: false, url: "http://localhost:5310/render.html" }
    windows.push(elsewhere)
    service.connect(elsewhere)
    expect(forked).toHaveLength(0)
    windows.push({ name: "parity", loading: false })
    service.start()
    expect(joined).toEqual([[forked[0], "parity"]])
  })

  it("retires the running service when it starts a fresh one, and doesn't count its exit as a crash", () => {
    const { service, forked, telemetry } = setup()
    service.start()
    service.start()
    expect(forked[0]?.killed).toBe(true)
    forked[0]?.exit(1)
    expect(telemetry.crashed).not.toHaveBeenCalled()
    expect(telemetry.started.mock.calls).toEqual([[false], [true]])
    expect(service.channel()).toBeDefined()
    vi.runAllTimers()
    expect(forked).toHaveLength(2)
  })

  it("starts a crashed service again, backing off as it keeps crashing, and reconnects its windows", () => {
    const { service, forked, windows, joined } = setup()
    windows.push({ name: "window", loading: false })
    service.start()
    forked[0]?.exit(1)
    expect(service.channel()).toBeUndefined()
    vi.advanceTimersByTime(0)
    expect(forked).toHaveLength(2)
    forked[1]?.exit(1)
    vi.advanceTimersByTime(999)
    expect(forked).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(forked).toHaveLength(3)
    expect(joined.map(([to]) => forked.indexOf(to))).toEqual([0, 1, 2])
  })

  it("reports a crash with what the service printed last, and its script when it's missing", () => {
    const { service, forked, telemetry } = setup({ missing: "D:/parity/utility.mjs" })
    service.start()
    forked[0]?.print("Error: Cannot find module 'zod'\n")
    forked[0]?.exit(1)
    expect(telemetry.crashed).toHaveBeenCalledWith({
      exitCode: 1,
      output: "Error: Cannot find module 'zod'",
      expected: false,
      missing: "D:/parity/utility.mjs"
    })
    expect(console.error).toHaveBeenCalledWith(
      "Project service exited with code 1, since D:/parity/utility.mjs doesn't exist"
    )
  })

  it("leaves a service that ended cleanly stopped until a window connects", () => {
    const { service, forked, telemetry } = setup()
    service.start()
    forked[0]?.exit(0)
    vi.runAllTimers()
    expect(forked).toHaveLength(1)
    expect(telemetry.crashed).not.toHaveBeenCalled()
    service.connect({ name: "window", loading: false })
    expect(forked).toHaveLength(2)
  })

  it("doesn't start a service again once the app is quitting", () => {
    const { service, forked, quit, telemetry } = setup()
    service.start()
    quit()
    forked[0]?.exit(1)
    vi.runAllTimers()
    expect(forked).toHaveLength(1)
    expect(telemetry.exited).toHaveBeenCalledWith({ exitCode: 1, ranMs: 0, replaced: false, quitting: true })
  })

  it("calls off a waiting restart when the app quits during its back-off", () => {
    const { service, forked, quit } = setup()
    service.start()
    forked[0]?.exit(1)
    vi.advanceTimersByTime(0)
    forked[1]?.exit(1)
    quit()
    vi.runAllTimers()
    expect(forked).toHaveLength(2)
  })

  it("calls off a waiting restart when a window's load starts a service first", () => {
    const { service, forked } = setup()
    service.start()
    forked[0]?.exit(1)
    vi.advanceTimersByTime(0)
    forked[1]?.exit(1)
    service.connect({ name: "window", loading: false })
    vi.runAllTimers()
    expect(forked).toHaveLength(3)
  })

  it("says how long a service ran when it exits", () => {
    const { service, forked, telemetry, wait } = setup()
    service.start()
    wait(90_000)
    forked[0]?.exit(1)
    expect(telemetry.exited).toHaveBeenCalledWith({ exitCode: 1, ranMs: 90_000, replaced: true, quitting: false })
  })

  it("ends the running service when the app quits", () => {
    const { service, forked } = setup()
    service.start()
    service.stop()
    expect(forked[0]?.killed).toBe(true)
  })

  it("doesn't take the service it ended as the app quits for a crash, though Windows ends it with code 1", () => {
    const { service, forked, telemetry } = setup()
    service.start()
    service.stop()
    forked[0]?.exit(1)
    expect(telemetry.crashed).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })
})
