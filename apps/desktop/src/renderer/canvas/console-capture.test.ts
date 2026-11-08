import { describe, expect, it } from "vite-plus/test"
import type { ConsoleContext } from "../../shared/protocol.ts"
import { type CaptureTarget, callSite, captureConsole, frameContext } from "./console-capture.ts"

/** A frame's host as ModeView marks it, and an element inside it. */
const host = { dataset: { frame: "", design: "app.par#pricing", state: "yearly", mode: "desktop-light" } }
const button = { dataset: {} }

/** A window that runs what it's given when told: its console writes to `written`, its events go to `listeners`. */
function fakeWindow() {
  const written: string[] = []
  const listeners = new Map<string, (event: Event) => void>()
  const later: (() => void)[] = []
  const write =
    (level: string) =>
    (...args: unknown[]) =>
      written.push(`${level} ${args.join(" ")}`)
  const target: CaptureTarget = {
    console: {
      log: write("log"),
      info: write("info"),
      warn: write("warn"),
      error: write("error"),
      debug: write("debug")
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    setTimeout: (run) => later.push(run)
  }
  const dispatch = (type: string, path: object[]) =>
    listeners.get(type)!({ composedPath: () => path } as unknown as Event)
  const endTask = () => later.splice(0).forEach((run) => run())
  return { target, written, dispatch, endTask }
}

describe("which frame a console message comes from", () => {
  it("is the frame an event's path goes through, by its design, state and mode", () => {
    expect(frameContext([button, host, { dataset: {} }] as unknown as EventTarget[])).toEqual({
      design: "app.par#pricing",
      state: "yearly",
      mode: "desktop-light"
    })
    // The board around frames is marked with its design too, but isn't a frame.
    expect(frameContext([{ dataset: { design: "app.par#pricing" } }] as unknown as EventTarget[])).toBeUndefined()
    // The window and the document have no dataset.
    expect(frameContext([{}] as unknown as EventTarget[])).toBeUndefined()
  })

  it("is announced before each message written while a frame handles an event, and not after its task", () => {
    const announced: [string, ConsoleContext][] = []
    const { target, written, dispatch, endTask } = fakeWindow()
    captureConsole({ announce: (level, context) => announced.push([level, context]) }, target)
    target.console.log("before")
    dispatch("click", [button, host])
    target.console.warn("price missing")
    target.console.error("Cannot read price")
    endTask()
    target.console.log("after")
    expect(written).toEqual(["log before", "warn price missing", "error Cannot read price", "log after"])
    const pricing = { design: "app.par#pricing", state: "yearly", mode: "desktop-light" }
    expect(announced).toEqual([
      ["warning", pricing],
      ["error", pricing]
    ])
  })

  it("says where the frame's code called the console, past the wrapper's own frame", () => {
    const stack = [
      "Error",
      "    at wrapper (http://localhost:5199/assets/index.js:40:12)",
      "    at http://localhost:5199/assets/index.js:41:3",
      "    at onClick (http://127.0.0.1:5173/src/member-row.tsx?t=17:9:58)",
      "    at http://127.0.0.1:5173/node_modules/.vite/deps/react-dom.js:120:9"
    ].join("\n")
    expect(callSite(stack)).toEqual({ source: "http://127.0.0.1:5173/src/member-row.tsx?t=17", line: 9 })
    // Parity's own call has none, so the console's own source stands.
    expect(callSite(stack.split("\n").slice(0, 3).join("\n"))).toBeUndefined()
    expect(callSite(undefined)).toBeUndefined()
  })

  it("leaves the console alone for events outside frames, and leaves a wrapper added since in place", () => {
    const announced: string[] = []
    const { target, dispatch, endTask } = fakeWindow()
    captureConsole({ announce: (level) => announced.push(level) }, target)
    dispatch("keydown", [button])
    target.console.error("Parity's own")
    expect(announced).toEqual([])
    dispatch("keydown", [host])
    const theirs = () => undefined
    target.console.debug = theirs
    endTask()
    expect(target.console.debug).toBe(theirs)
  })
})
