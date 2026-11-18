import { describe, expect, it } from "vite-plus/test"
import { type Bounds, lensWindows, type LensWindowParts } from "./lens-windows.ts"

/** A window that closes as Electron's does: its close listeners can keep it open, then it's closed. */
class FakeWindow implements LensWindowParts {
  closed = false
  private readonly closing: ((keepOpen: () => void) => void)[] = []
  private readonly closedListeners: (() => void)[] = []

  constructor(private place: Bounds = { x: 100, y: 100, width: 1100, height: 720 }) {}

  destroyed = () => this.closed
  bounds = () => this.place
  onClose = (listener: (keepOpen: () => void) => void) => void this.closing.push(listener)
  onClosed = (listener: () => void) => void this.closedListeners.push(listener)

  moveTo(place: Bounds): void {
    this.place = place
  }

  close(): void {
    let kept = false

    for (const listener of this.closing) {
      listener(() => (kept = true))
    }

    if (kept) {
      return
    }

    this.closed = true

    for (const listener of this.closedListeners) {
      listener()
    }
  }
}

const screen = { x: 0, y: 0, width: 1920, height: 1080 }

function setUp(quitting = false) {
  const state = { quitting, quits: 0 }
  const list = lensWindows<FakeWindow>({ quitting: () => state.quitting, quit: () => (state.quits += 1) })

  return { list, state }
}

describe("lens windows", () => {
  it("closes an editor window's lens windows with it", () => {
    const { list } = setUp()
    const editor = new FakeWindow()
    const screens = new FakeWindow()
    const pages = new FakeWindow()
    list.add(screens, editor, "screens")
    list.add(pages, editor, "pages")

    expect(list.of(editor)).toEqual([screens, pages])
    expect(list.has(screens)).toBe(true)

    editor.close()

    expect([screens.closed, pages.closed]).toEqual([true, true])
    expect(list.of(editor)).toEqual([])
    expect(list.has(screens)).toBe(false)
  })

  it("closes them when the editor window's page loads again, leaving the editor window open", () => {
    const { list } = setUp()
    const editor = new FakeWindow()
    const screens = new FakeWindow()
    list.add(screens, editor, "screens")

    list.closeOf(editor)

    expect([screens.closed, editor.closed]).toEqual([true, false])
  })

  it("holds them open while the app quits, until their editor window has closed, then quits", () => {
    const { list, state } = setUp(true)
    const editor = new FakeWindow()
    const screens = new FakeWindow()
    list.add(screens, editor, "screens")

    // Quitting closes every window; the editor window's page is still deciding.
    screens.close()

    expect(screens.closed).toBe(false)

    editor.close()

    expect(screens.closed).toBe(true)
    expect(state.quits).toBe(1)
  })

  it("lets one close on its own when the app isn't quitting", () => {
    const { list, state } = setUp()
    const editor = new FakeWindow()
    const screens = new FakeWindow()
    list.add(screens, editor, "screens")

    screens.close()
    editor.close()

    expect(screens.closed).toBe(true)
    expect(state.quits).toBe(0)
  })

  it("puts a lens's window back where it last was, while that's on a screen", () => {
    const { list } = setUp()
    const editor = new FakeWindow()
    const first = new FakeWindow()
    list.add(first, editor, "screens")

    expect(list.placeOf("screens", [screen])).toBeUndefined()

    const there = { x: 300, y: 200, width: 900, height: 600 }
    first.moveTo(there)
    first.close()

    expect(list.placeOf("screens", [screen])).toEqual(there)
    expect(list.placeOf("pages", [screen])).toBeUndefined()
    // The screen it was on has gone: it opens where it's asked to instead.
    expect(list.placeOf("screens", [{ x: 1920, y: 0, width: 1920, height: 1080 }])).toBeUndefined()
  })

  it("doesn't put a window back where too little of its title bar would be on a screen to drag it by", () => {
    const { list } = setUp()
    const editor = new FakeWindow()
    const window = new FakeWindow()
    list.add(window, editor, "screens")
    window.moveTo({ x: 1860, y: 500, width: 900, height: 600 })
    window.close()

    expect(list.placeOf("screens", [screen])).toBeUndefined()
  })
})
