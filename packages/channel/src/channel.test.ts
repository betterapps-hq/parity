import { EventEmitter } from "node:events"
import { describe, expect, it } from "vite-plus/test"
import { type Checks, createChannel, type ErrorCodec, type Handlers } from "./channel.ts"
import { memoryPorts, nodePort } from "./ports.ts"

/** What the service end answers in these tests. */
interface ServiceSide {
  "notes.add": { params: { text: string }; result: { id: number } }
  "notes.slow": { params: undefined; result: string }
  "notes.fail": { params: { code: string }; result: never }
}

/** What the window end answers. */
interface WindowSide {
  "window.title": { params: undefined; result: string }
}

/** An error with a code, as core's `CodedError` carries one. */
class CodedFailure extends Error {
  readonly details: { code: string }

  constructor(message: string, details: { code: string }) {
    super(message)
    this.details = details
  }
}

/** Carries a code both ways, and refuses details without one, as the app's codec does with core's checks. */
const codedErrors: ErrorCodec = {
  encode: (error) => ({
    error: error instanceof Error ? error.message : String(error),
    ...(error instanceof CodedFailure ? { details: error.details } : {})
  }),
  decode: (message, details) => {
    const code = (details as { code?: unknown } | undefined)?.code
    return typeof code === "string" ? new CodedFailure(message, { code }) : new Error(message)
  }
}

const checks: Checks<ServiceSide> = {
  "notes.add": (params) => {
    const text = (params as { text?: unknown } | undefined)?.text
    if (typeof text !== "string") throw new CodedFailure("/text: expected a string", { code: "invalid_input" })
    return { text }
  },
  "notes.slow": () => undefined,
  "notes.fail": (params) => params as { code: string }
}

function connected(options: { checks?: boolean } = {}) {
  let later: () => void = () => undefined
  const added: string[] = []
  const handlers: Handlers<ServiceSide> = {
    "notes.add": ({ text }) => {
      added.push(text)
      return { id: added.length }
    },
    "notes.slow": () => new Promise((resolve) => (later = () => resolve("done"))),
    "notes.fail": ({ code }) => {
      throw new CodedFailure("That note is locked", { code })
    }
  }
  const service = createChannel<ServiceSide, WindowSide>({
    handlers,
    errors: codedErrors,
    ...(options.checks ? { checks } : {}),
    unknownMethod: (method) => new CodedFailure(`Unknown method ${method}`, { code: "invalid_input" }),
    disconnected: () => new Error("The canvas window closed")
  })
  const window = createChannel<WindowSide, ServiceSide>({
    errors: codedErrors,
    notServing: () => new Error("The canvas window isn't ready yet")
  })
  const [servicePort, windowPort] = memoryPorts()
  service.connect(servicePort)
  window.connect(windowPort)
  return { service, window, servicePort, windowPort, added, finishSlow: () => later() }
}

describe("createChannel", () => {
  it("matches each reply to its request, whichever answers first", async () => {
    const { window, finishSlow } = connected()
    const slow = window.request("notes.slow", undefined)
    const first = window.request("notes.add", { text: "One" })
    const second = window.request("notes.add", { text: "Two" })
    expect(await second).toEqual({ id: 2 })
    expect(await first).toEqual({ id: 1 })
    finishSlow()
    expect(await slow).toBe("done")
    expect(window.waiting).toBe(0)
  })

  it("asks both ways over one port", async () => {
    const { service, window } = connected()
    await expect(service.request("window.title", undefined)).rejects.toThrow("The canvas window isn't ready yet")
    window.serve({ "window.title": () => "Shop" })
    expect(await service.request("window.title", undefined)).toBe("Shop")
  })

  it("holds requests until it connects, then sends them in order", async () => {
    const window = createChannel<WindowSide, ServiceSide>()
    const first = window.request("notes.add", { text: "Before" })
    const second = window.request("notes.add", { text: "Also before" })
    expect(window.connected).toBe(false)
    const [servicePort, windowPort] = memoryPorts()
    const added: string[] = []
    createChannel<ServiceSide, WindowSide>({
      handlers: {
        "notes.add": ({ text }) => ({ id: added.push(text) }),
        "notes.slow": () => "",
        "notes.fail": () => undefined as never
      }
    }).connect(servicePort)
    window.connect(windowPort)
    expect(await Promise.all([first, second])).toEqual([{ id: 1 }, { id: 2 }])
    expect(added).toEqual(["Before", "Also before"])
  })

  it("fails what was sent when the port closes, and holds what's asked next for the next port", async () => {
    const { service, window, servicePort, windowPort } = connected()
    const waiting = service.request("window.title", undefined)
    windowPort.close?.()
    await expect(waiting).rejects.toThrow("The canvas window closed")
    expect(service.connected).toBe(false)
    expect(servicePort.sent).toHaveLength(1)

    const next = service.request("window.title", undefined)
    const [freshService, freshWindow] = memoryPorts()
    service.connect(freshService)
    window.serve({ "window.title": () => "Blog" })
    window.connect(freshWindow)
    expect(await next).toBe("Blog")
  })

  it("fails what the old port was asked when it moves to a new one, and asks the new one from then on", async () => {
    const window = createChannel<WindowSide, ServiceSide>({
      disconnected: () => new Error("The project service restarted")
    })
    const [silent] = memoryPorts()
    window.connect(silent)
    const lost = window.request("notes.add", { text: "Lost" })
    const { windowPort, added } = connected()
    window.connect(windowPort)
    await expect(lost).rejects.toThrow("The project service restarted")
    expect(await window.request("notes.add", { text: "Kept" })).toEqual({ id: 1 })
    expect(added).toEqual(["Kept"])
  })

  it("refuses a method the other end doesn't answer, with the codec's details", async () => {
    const { window } = connected()
    const asked = window.request("notes.delete" as "notes.add", { text: "x" })
    await expect(asked).rejects.toThrow("Unknown method notes.delete")
    await expect(asked).rejects.toMatchObject({ details: { code: "invalid_input" } })
  })

  it("never calls what an object inherits as though it were a method", async () => {
    const { window } = connected({ checks: true })
    await expect(window.request("constructor" as "notes.add", { text: "x" })).rejects.toThrow(
      "Unknown method constructor"
    )
    await expect(window.request("__proto__" as "notes.add", { text: "x" })).rejects.toThrow("Unknown method __proto__")
  })

  it("carries a coded error's details back to the caller", async () => {
    const { window } = connected()
    const failed = window.request("notes.fail", { code: "conflict" })
    await expect(failed).rejects.toBeInstanceOf(CodedFailure)
    await expect(failed).rejects.toMatchObject({ message: "That note is locked", details: { code: "conflict" } })
  })

  it("checks params where they arrive and refuses them before the handler runs", async () => {
    const { window, added } = connected({ checks: true })
    const refused = window.request("notes.add", { text: 3 } as unknown as { text: string })
    await expect(refused).rejects.toMatchObject({
      message: "/text: expected a string",
      details: { code: "invalid_input" }
    })
    expect(added).toEqual([])
    expect(await window.request("notes.add", { text: "Fine" })).toEqual({ id: 1 })
  })

  it("passes what its checks read to the handler, not what was sent", async () => {
    const seen: unknown[] = []
    const service = createChannel<ServiceSide, WindowSide>({
      checks: { ...checks, "notes.add": () => ({ text: "trimmed" }) },
      handlers: {
        "notes.add": (params) => ({ id: seen.push(params) }),
        "notes.slow": () => "",
        "notes.fail": () => undefined as never
      }
    })
    const window = createChannel<WindowSide, ServiceSide>()
    const [a, b] = memoryPorts()
    service.connect(a)
    window.connect(b)
    await window.request("notes.add", { text: "  trimmed  ", extra: true } as { text: string })
    expect(seen).toEqual([{ text: "trimmed" }])
  })

  it("ignores what isn't a channel message, and a reply nobody asked for", async () => {
    const { window, windowPort } = connected()
    for (const stray of [undefined, "hello", { type: "connect" }, { type: "response", id: 99, result: 1 }]) {
      windowPort.deliver(stray)
    }
    expect(await window.request("notes.add", { text: "Still works" })).toEqual({ id: 1 })
  })

  it("fails everything waiting and everything after once closed", async () => {
    const { window } = connected()
    const waiting = window.request("notes.slow", undefined)
    window.close(new Error("The window is closing"))
    await expect(waiting).rejects.toThrow("The window is closing")
    await expect(window.request("notes.add", { text: "Late" })).rejects.toThrow("The window is closing")
    expect(window.connected).toBe(false)
  })
})

describe("nodePort", () => {
  it("unwraps Electron's `{ data }` messages and fails what was sent when its close event says why", async () => {
    const emitter = Object.assign(new EventEmitter(), { posted: [] as unknown[], started: false })
    const port = nodePort(
      Object.assign(emitter, {
        postMessage: (message: unknown) => emitter.posted.push(message),
        start: () => {
          emitter.started = true
        }
      }),
      { wrapped: true, closedBy: { exit: (code) => new Error(`The service stopped with code ${String(code)}`) } }
    )
    const channel = createChannel<WindowSide, ServiceSide>()
    channel.connect(port)
    expect(emitter.started).toBe(true)
    const added = channel.request("notes.add", { text: "One" })
    expect(emitter.posted).toEqual([{ type: "request", id: 1, method: "notes.add", params: { text: "One" } }])
    emitter.emit("message", { data: { type: "response", id: 1, result: { id: 7 } } })
    expect(await added).toEqual({ id: 7 })

    const lost = channel.request("notes.slow", undefined)
    emitter.emit("exit", 9)
    await expect(lost).rejects.toThrow("The service stopped with code 9")
  })
})
