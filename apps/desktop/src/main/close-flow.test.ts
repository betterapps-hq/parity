import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { type ClosingWindow, createCloseFlow } from "./close-flow.ts"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** A window that closes as Electron's does: `close` asks its listeners, and is destroyed unless one keeps it open. */
function fakeWindow(id = 1, { crashed = false } = {}) {
  const closing: ((keepOpen: () => void) => void)[] = []
  const closed: (() => void)[] = []
  let destroyed = false

  const window = {
    id,
    asked: 0,
    crashed: () => crashed,
    destroyed: () => destroyed,
    ask() {
      window.asked++
    },
    close() {
      if (destroyed) {
        return
      }

      let kept = false

      for (const listener of closing) {
        listener(() => {
          kept = true
        })
      }

      if (!kept) {
        destroyed = true

        for (const listener of closed) {
          listener()
        }
      }
    },
    onClose: (listener: (keepOpen: () => void) => void) => void closing.push(listener),
    onClosed: (listener: () => void) => void closed.push(listener)
  } satisfies ClosingWindow & { asked: number }

  return window
}

function setup({ installs = true, session = true } = {}) {
  const quit = vi.fn<() => void>()
  const quitCancelled = vi.fn<() => void>()
  const install = vi.fn<(onFailure?: () => void) => boolean>(() => installs)
  const fail = vi.fn<(cause: unknown) => void>()
  const flow = createCloseFlow({ quit, quitCancelled, updates: () => (session ? { install, fail } : undefined) })

  return { flow, quit, quitCancelled, install, fail }
}

/** How a close starts: the person closes the window, the app quits, or the person restarts to install an update. */
type Start = "close" | "quit" | "update"

/**
 * What the page does about it. The preload says at once that it's deciding, then that the window may close or that it
 * calls the close off; a page still deciding says nothing more, and a hung or loading one says nothing at all.
 */
type Reply = "ready" | "pending" | "cancel" | "silent"

interface Case {
  start: Start
  reply: Reply
  /** Whether the update session installs, or there's none yet. */
  installs?: boolean | "no session"
  closed: boolean
  quit: boolean
  installed: boolean
  failed: boolean
  /** Whether the app is still quitting afterwards. */
  quitting: boolean
  cancelled: boolean
}

const cases: Case[] = [
  // The person closes the window.
  {
    start: "close",
    reply: "ready",
    closed: true,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: false
  },
  {
    start: "close",
    reply: "silent",
    closed: true,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: false
  },
  {
    start: "close",
    reply: "pending",
    closed: false,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: false
  },
  {
    start: "close",
    reply: "cancel",
    closed: false,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: true
  },
  // The app quits.
  {
    start: "quit",
    reply: "ready",
    closed: true,
    quit: true,
    installed: false,
    failed: false,
    quitting: true,
    cancelled: false
  },
  {
    start: "quit",
    reply: "silent",
    closed: true,
    quit: true,
    installed: false,
    failed: false,
    quitting: true,
    cancelled: false
  },
  {
    start: "quit",
    reply: "pending",
    closed: false,
    quit: false,
    installed: false,
    failed: false,
    quitting: true,
    cancelled: false
  },
  {
    start: "quit",
    reply: "cancel",
    closed: false,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: true
  },
  // The person restarts to install an update, which quits the app itself.
  {
    start: "update",
    reply: "ready",
    closed: false,
    quit: false,
    installed: true,
    failed: false,
    quitting: false,
    cancelled: false
  },
  {
    start: "update",
    reply: "ready",
    installs: false,
    closed: false,
    quit: false,
    installed: true,
    failed: false,
    quitting: false,
    cancelled: true
  },
  {
    start: "update",
    reply: "ready",
    installs: "no session",
    closed: false,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: true
  },
  {
    start: "update",
    reply: "silent",
    closed: false,
    quit: false,
    installed: false,
    failed: true,
    quitting: false,
    cancelled: false
  },
  {
    start: "update",
    reply: "pending",
    closed: false,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: false
  },
  {
    start: "update",
    reply: "cancel",
    closed: false,
    quit: false,
    installed: false,
    failed: false,
    quitting: false,
    cancelled: true
  }
]

describe("createCloseFlow", () => {
  it.each(cases)(
    "$start, page $reply, installs $installs: closed $closed, quit $quit",
    ({ start, reply, installs = true, ...expected }) => {
      const { flow, quit, quitCancelled, install, fail } = setup({
        installs: installs === true,
        session: installs !== "no session"
      })

      const window = fakeWindow()
      flow.watch(window)

      if (start === "quit") {
        flow.quitStarted()
      }

      if (start === "update") {
        flow.restartForUpdate(window)
      } else {
        window.close()
      }

      expect(window.asked).toBe(1)
      const replies = flow.replies(window.id)

      if (reply !== "silent") {
        replies?.pending()
      }

      if (reply === "ready") {
        replies?.ready()
      } else if (reply === "cancel") {
        replies?.cancel()
      }

      vi.advanceTimersByTime(3000)

      expect({
        closed: window.destroyed(),
        quit: quit.mock.calls.length > 0,
        installed: install.mock.calls.length > 0,
        failed: fail.mock.calls.length > 0,
        quitting: flow.quitting(),
        cancelled: quitCancelled.mock.calls.length > 0
      }).toEqual(expected)
    }
  )

  it("closes a crashed window at once, without asking its page", () => {
    const { flow } = setup()
    const window = fakeWindow(1, { crashed: true })
    flow.watch(window)
    window.close()
    expect(window.asked).toBe(0)
    expect(window.destroyed()).toBe(true)
  })

  it("asks once while the page decides, however often the window is closed", () => {
    const { flow } = setup()
    const window = fakeWindow()
    flow.watch(window)
    window.close()
    window.close()
    expect(window.asked).toBe(1)
  })

  it("asks again after the page calls a close off", () => {
    const { flow } = setup()
    const window = fakeWindow()
    flow.watch(window)
    window.close()
    flow.replies(window.id)?.cancel()
    window.close()
    expect(window.asked).toBe(2)
  })

  it("waits three seconds for a page to say it's deciding", () => {
    const { flow } = setup()
    const window = fakeWindow()
    flow.watch(window)
    window.close()
    vi.advanceTimersByTime(2999)
    expect(window.destroyed()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(window.destroyed()).toBe(true)
  })

  it("asks again when an update's install fails after the page said it could close", () => {
    const { flow, install, quitCancelled } = setup()
    const window = fakeWindow()
    flow.watch(window)
    flow.restartForUpdate(window)
    flow.replies(window.id)?.pending()
    flow.replies(window.id)?.ready()
    const [[failed]] = install.mock.calls
    failed?.()
    expect(quitCancelled).toHaveBeenCalledOnce()
    window.close()
    expect(window.asked).toBe(2)
  })

  it("closes an ordinary window after an update restart the page didn't answer", () => {
    const { flow, fail } = setup()
    const window = fakeWindow()
    flow.watch(window)
    flow.restartForUpdate(window)
    vi.advanceTimersByTime(3000)
    expect(fail).toHaveBeenCalledOnce()
    window.close()
    flow.replies(window.id)?.ready()
    expect(window.destroyed()).toBe(true)
  })

  it("forgets a window's replies once it's closed", () => {
    const { flow } = setup()
    const window = fakeWindow()
    flow.watch(window)
    window.close()
    flow.replies(window.id)?.ready()
    expect(flow.replies(window.id)).toBeUndefined()
  })

  it("quits once, when the last of the page's answers comes", () => {
    const { flow, quit } = setup()
    const window = fakeWindow()
    flow.watch(window)
    flow.quitStarted()
    window.close()
    const replies = flow.replies(window.id)
    replies?.ready()
    replies?.ready()
    vi.advanceTimersByTime(3000)
    expect(quit).toHaveBeenCalledOnce()
  })
})
