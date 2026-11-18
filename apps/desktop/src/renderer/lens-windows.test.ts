import { describe, expect, it } from "vite-plus/test"
import { addLensWindow, onEachWindow, windowOf } from "./lens-windows.ts"

/** A window as far as listeners go: something to listen on, which says when its page goes. */
function fakeWindow(): Window {
  // SAFETY: the registry only listens on a window, which an `EventTarget` stands in for.
  return new EventTarget() as Window
}

describe("the windows the app draws in", () => {
  it("listens on the main window and each lens window, as they open and until they close", () => {
    const main = fakeWindow()
    const heard: Window[] = []
    const stopped: Window[] = []
    const early = fakeWindow()
    const forget = addLensWindow(early)

    const stop = onEachWindow((target) => {
      heard.push(target)

      return () => stopped.push(target)
    }, main)

    expect(heard).toEqual([main, early])

    const late = fakeWindow()
    addLensWindow(late)

    expect(heard).toEqual([main, early, late])

    // A lens window's page going takes it out, and undoes what was listening there.
    late.dispatchEvent(new Event("pagehide"))

    expect(stopped).toEqual([late])

    stop()

    expect(stopped).toEqual([late, main, early])

    // Forgotten, a lens window isn't listened on any more.
    forget()
    const after: Window[] = []
    onEachWindow((target) => void after.push(target), main)()

    expect(after).toEqual([main])
  })

  it("tells which window an event happened in", () => {
    const opened = fakeWindow()

    expect(windowOf({ view: opened })).toBe(opened)
  })
})
