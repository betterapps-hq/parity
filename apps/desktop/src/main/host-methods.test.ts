import { describe, expect, it } from "vite-plus/test"
import { type HostMethod, hostMethod, hostMethodNames } from "../shared/host-methods.ts"
import { answerWindows, type HostHandlers } from "./host-methods.ts"

/** Who sent a request: the Parity window's own page, a guest frame in it, or an offscreen render window's page. */
interface Sender {
  page: "parity" | "guest" | "render"
}

/** The Parity window, as the registration hands it to a handler. */
const parityWindow = { id: 1 }

const parity: Sender = { page: "parity" }
const guest: Sender = { page: "guest" }
const render: Sender = { page: "render" }

const file = process.platform === "win32" ? "C:\\work\\app\\src\\Button.tsx" : "/work/app/src/Button.tsx"

/** What a handler was given. */
interface Handled {
  method: HostMethod
  params: unknown
  from: unknown
}

/** A handler that takes whatever its method is given. Its answer stands in for any method's, so it's typed as none. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- whatever the registration passed, noted for the test
type Noting = (params: unknown, from: unknown) => never

/** `answerWindows` over a stand-in for `ipcMain`, with a handler for every method that notes what it was given. */
function main() {
  const handled: Handled[] = []
  const spans: { method: string; trace: unknown }[] = []
  const channels: string[] = []

  // oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- the wire, which carries anything
  let ask = (_event: Sender, _method?: unknown, _params?: unknown, _trace?: unknown): Promise<unknown> =>
    Promise.reject(new Error("Nothing answers asks"))

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the wire, which carries anything
  let tell = (_event: Sender, _method?: unknown, _params?: unknown, _trace?: unknown): void => undefined

  const noting = (method: HostMethod): Noting => {
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- whatever the registration passed, noted for the test
    return (params: unknown, from: unknown) => {
      handled.push({ method, params, from })

      // SAFETY: the registration passes an answer on unread, so a test can tell whose it was by this text.
      return `${method} answered` as never
    }
  }

  // SAFETY: `hostMethodNames` is every method, so each has a handler.
  const handlers: HostHandlers<Sender, typeof parityWindow> = Object.fromEntries(
    hostMethodNames.map((method) => [method, noting(method)])
  ) as Record<HostMethod, Noting>

  answerWindows<Sender, typeof parityWindow>({
    ipc: {
      handle: (channel, listener) => {
        channels.push(channel)
        ask = listener
      },
      on: (channel, listener) => {
        channels.push(channel)
        tell = listener
      }
    },
    handlers,
    appWindow: (event) => (event.page === "parity" ? parityWindow : undefined),
    around: (request, answer) => {
      spans.push(request)

      return answer()
    }
  })

  return {
    handled,
    spans,
    channels,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- what a page sends, which may be anything
    ask: (event: Sender, method?: unknown, params?: unknown, trace?: unknown) => ask(event, method, params, trace),
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- what a page sends, which may be anything
    tell: (event: Sender, method?: unknown, params?: unknown, trace?: unknown) => tell(event, method, params, trace)
  }
}

describe("who may ask", () => {
  it("leaves only what the render windows send open to every sender", () => {
    // Opening a method to every sender is a choice: it's made in `hostMethods` with `from: "any"`, and then here.
    expect(hostMethodNames.filter((method) => hostMethod(method)?.open)).toEqual(["record", "telemetrySecrets"])
  })

  it("refuses every other method from anything but the Parity window's own page", async () => {
    const { ask, tell, handled } = main()
    const gated = hostMethodNames.map((method) => hostMethod(method)!).filter(({ open }) => !open)
    expect(gated.length).toBe(hostMethodNames.length - 2)

    for (const sender of [guest, render]) {
      for (const { method } of gated.filter(({ oneWay }) => oneWay)) {
        tell(sender, method)
      }

      for (const { method } of gated.filter(({ oneWay }) => !oneWay)) {
        await expect(ask(sender, method)).rejects.toThrow(`Only the Parity window can ask for ${method}.`)
      }
    }

    expect(handled).toEqual([])
  })

  it("gives a handler the Parity window that asked", async () => {
    const { ask, handled } = main()
    expect(await ask(parity, "pickFolder", "Export to")).toBe("pickFolder answered")
    expect(handled).toEqual([{ method: "pickFolder", params: "Export to", from: parityWindow }])
  })

  it("gives an open method's handler the sender, whoever it is", async () => {
    const { ask, tell, handled } = main()
    expect(await ask(render, "telemetrySecrets")).toBe("telemetrySecrets answered")
    tell(guest, "record", { name: "app.started" })
    expect(handled).toEqual([
      { method: "telemetrySecrets", params: undefined, from: render },
      { method: "record", params: { name: "app.started" }, from: guest }
    ])
  })
})

describe("what may be asked", () => {
  it("hears windows on two channels, whatever the methods", () => {
    expect(main().channels).toEqual(["canvas:ask", "canvas:tell"])
  })

  it("refuses a method main doesn't have, and asking one that's only told", async () => {
    const { ask, handled, spans } = main()
    await expect(ask(parity, "readFile", "C:/secrets")).rejects.toThrow(
      new TypeError('Main has no method "readFile" to ask')
    )
    await expect(ask(parity, "toString")).rejects.toThrow('Main has no method "toString" to ask')
    await expect(ask(parity, 7)).rejects.toThrow("Main has no method 7 to ask")
    await expect(ask(parity, "closeReady")).rejects.toThrow('Main has no method "closeReady" to ask')
    expect(handled).toEqual([])
    // A name main doesn't know never names a span.
    expect(spans).toEqual([])
  })

  it("checks params before the handler, and names the field at fault (PAR-592)", async () => {
    const { ask, handled } = main()
    const request = { file, export: "Button", editor: "vscode" }
    expect(await ask(parity, "openInEditor", request)).toBe("openInEditor answered")
    expect(handled).toEqual([{ method: "openInEditor", params: request, from: parityWindow }])

    const refused = [
      [{ file: 42, editor: "vscode" }, "/file: expected a string"],
      [{ file: "--goto", editor: "vscode" }, "/file: expected an absolute path"],
      [{ file, editor: "notepad" }, '/editor: expected one of "auto", "system", "vscode"'],
      [{ file, editor: "zed", shell: true }, "/shell: unknown property"],
      ["open Button.tsx", "/: expected an object"],
      [{ file, line: 0, editor: "zed" }, "/line"]
    ] as const

    for (const [request, why] of refused) {
      await expect(ask(parity, "openInEditor", request)).rejects.toThrow(why)
    }

    await expect(ask(parity, "openInEditor", { file: 42, editor: "vscode" })).rejects.toThrow(TypeError)
    expect(handled).toHaveLength(1)
  })

  it("refuses anything sent with a method that takes nothing", async () => {
    const { ask, handled } = main()
    await expect(ask(parity, "quit", { force: true })).rejects.toThrow(TypeError)
    expect(handled).toEqual([])
  })

  it("runs a handler in its method's span, in the trace the window sent", async () => {
    const { ask, tell, spans } = main()
    const trace = { "sentry-trace": "4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1" }
    await ask(parity, "metrics", undefined, trace)
    tell(parity, "consoleAnnounce", { level: "warning", design: "Card" })
    expect(spans).toEqual([
      { method: "metrics", trace },
      { method: "consoleAnnounce", trace: undefined }
    ])
  })
})

describe("what a window tells", () => {
  it("reaches its handler, checked", () => {
    const { tell, handled } = main()
    tell(parity, "consoleAnnounce", { level: "warning", design: "Card" })
    tell(parity, "closeReady")
    expect(handled).toEqual([
      { method: "consoleAnnounce", params: { level: "warning", design: "Card" }, from: parityWindow },
      { method: "closeReady", params: undefined, from: parityWindow }
    ])
  })

  it("is dropped without a word when it isn't a method to tell, or isn't what the method takes", () => {
    const { tell, handled, spans } = main()
    // Word that isn't an announcement is ignored, and the message is kept as the project's (PAR-147).
    tell(parity, "consoleAnnounce", { level: "log", design: "Card" })
    tell(parity, "consoleAnnounce", "Card")
    tell(parity, "closeReady", { force: true })
    tell(parity, "quit")
    tell(parity, "shutDown")
    tell(parity)
    expect(handled).toEqual([])
    expect(spans).toEqual([])
  })
})
