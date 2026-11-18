import { describe, expect, it } from "vite-plus/test"
import { addLensWindow, focusedClipboard, onEachWindow, windowOf } from "./lens-windows.ts"

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

  it("copies and pastes through the focused lens window's clipboard, or else the main window's", () => {
    // A window as far as the clipboard goes: its navigator's, and whether its document has the focus.
    const lens = (focused: boolean): Window =>
      Object.assign(fakeWindow(), {
        closed: false,
        document: { hasFocus: () => focused },
        navigator: { clipboard: { focused } }
      })

    const unfocused = addLensWindow(lens(false))

    expect(focusedClipboard()).toBe(navigator.clipboard)

    const opened = lens(true)
    const focused = addLensWindow(opened)

    expect(focusedClipboard()).toBe(opened.navigator.clipboard)

    focused()
    unfocused()
  })
})
