import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { UpdateNotice } from "./UpdateToast.tsx"

interface Shown {
  id: string
  timeout: number
  onClose: () => void
  notice: UpdateNotice
  onAction: () => void
}

/** The app's toasts, which call a toast's `onClose` however it closes, as Base UI's do. */
const notifications = vi.hoisted(() => {
  const add = vi.fn<(kind: string, title: string, options: Shown) => string>((_kind, _title, options) => options.id)
  const close = vi.fn<(id: string) => void>(() => add.mock.lastCall?.[2].onClose())

  return { add, close }
})

vi.mock("../toasts.tsx", () => ({ notify: { show: notifications.add, close: notifications.close } }))

vi.mock("./UpdateToast.tsx", () => ({
  updateToast: (notice: UpdateNotice, onAction: () => void) => ({
    kind: "info",
    title: "",
    options: { notice, onAction }
  })
}))

const dialogs = vi.hoisted(() => ({ openDialog: vi.fn<() => void>() }))

vi.mock("./app-dialogs.ts", () => dialogs)

function latest(): Shown {
  const shown = notifications.add.mock.lastCall?.[2]

  if (!shown) {
    throw new Error("No update toast")
  }

  return shown
}

describe("update notifications", () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("keeps startup results quiet, but shows manual checking and its result without opening About", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({ phase: "checking", beta: false })
    updates.receiveUpdate({ phase: "current", beta: false })
    expect(notifications.add).not.toHaveBeenCalled()
    const check = vi.fn<() => Promise<void>>(async () => updates.receiveUpdate({ phase: "current", beta: false }))
    vi.stubGlobal("window", { canvasHost: { updates: { check } } })
    updates.checkForUpdates()
    expect(latest().notice).toEqual({ kind: "current", beta: false })
    expect(notifications.add.mock.calls[1]?.[2].id).toBe(notifications.add.mock.calls[0]?.[2].id)
    expect(latest().timeout).toBe(0)
    expect(dialogs.openDialog).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(check).toHaveResolved())
  })

  it("keeps a notice the person closed hidden until they check again", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.4.0" })
    latest().onClose()
    const calls = notifications.add.mock.calls.length
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.4.0" })
    expect(notifications.add).toHaveBeenCalledTimes(calls)
    updates.checkForUpdates()
    expect(notifications.add).toHaveBeenCalledTimes(calls + 1)
    expect(latest().notice.kind).toBe("ready")
  })

  it("doesn't hide a notice it closed itself when there was nothing to say", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({ phase: "ready", beta: false, version: "0.4.0" })
    updates.receiveUpdate({ phase: "installing", beta: false, version: "0.4.0" })
    expect(notifications.close).toHaveBeenCalledWith(latest().id)
    const calls = notifications.add.mock.calls.length
    updates.receiveUpdate({ phase: "ready", beta: false, version: "0.4.0" })
    expect(notifications.add).toHaveBeenCalledTimes(calls + 1)
  })

  it("keeps closed progress hidden and shows the ready notice", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.4.0",
      percent: 10,
      transferred: 1,
      total: 10
    })
    updates.checkForUpdates()
    latest().onClose()
    const calls = notifications.add.mock.calls.length
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.4.0",
      percent: 20,
      transferred: 2,
      total: 10
    })
    expect(notifications.add).toHaveBeenCalledTimes(calls)
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.4.0" })
    expect(notifications.add).toHaveBeenCalledTimes(calls + 1)
    expect(latest().notice.kind).toBe("ready")
  })

  it("coalesces repeated checks, shows failure and retries from the same toast", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({ phase: "idle", beta: true })
    let finish: (() => void) | undefined

    const check = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )

    vi.stubGlobal("window", { canvasHost: { updates: { check } } })
    updates.checkForUpdates()
    updates.checkForUpdates()
    expect(check).toHaveBeenCalledTimes(1)
    expect(latest().notice).toEqual({ kind: "checking", beta: true })
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.3.1",
      percent: 10,
      transferred: 1,
      total: 10
    })
    updates.checkForUpdates()
    updates.receiveUpdate({ phase: "error", beta: true, message: "Offline" })
    expect(latest().notice.kind).toBe("error")
    finish?.()
    await vi.waitFor(() => expect(check).toHaveResolved())
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    latest().onAction()
    expect(check).toHaveBeenCalledTimes(2)
    expect(latest().notice.kind).toBe("checking")
    finish?.()
  })

  it("shows failures when a menu action restores a background download", async () => {
    const updates = await import("./updates.tsx")
    const check = vi.fn<() => Promise<void>>()
    vi.stubGlobal("window", { canvasHost: { updates: { check } } })
    updates.receiveUpdate({
      phase: "downloading",
      beta: false,
      version: "0.3.1",
      percent: 10,
      transferred: 1,
      total: 10
    })
    updates.checkForUpdates()
    updates.receiveUpdate({ phase: "error", beta: false, message: "Checksum mismatch" })
    expect(latest().notice.kind).toBe("error")
    expect(check).not.toHaveBeenCalled()
  })

  it("keeps automatic download progress silent and shows a dismissible restart notice", async () => {
    const updates = await import("./updates.tsx")
    const check = vi.fn<() => Promise<void>>()
    vi.stubGlobal("window", { canvasHost: { updates: { check } } })
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.3.1",
      percent: 10,
      transferred: 1,
      total: 10
    })
    expect(notifications.add).not.toHaveBeenCalled()
    notifications.add.mockClear()
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.3.1",
      percent: 20,
      transferred: 2,
      total: 10
    })
    expect(notifications.add).not.toHaveBeenCalled()
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.3.1" })
    expect(latest().notice.kind).toBe("ready")
    latest().onClose()
    updates.checkForUpdates()
    expect(latest().notice.kind).toBe("ready")
    expect(check).not.toHaveBeenCalled()
    expect(dialogs.openDialog).not.toHaveBeenCalled()
  })

  it("turns rejected IPC into a retryable foreground error, but stays quiet for startup errors", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({ phase: "error", beta: false, message: "Offline" })
    expect(notifications.add).not.toHaveBeenCalled()
    vi.stubGlobal("window", {
      canvasHost: {
        updates: {
          check: async () => {
            throw new Error("IPC failed")
          }
        }
      }
    })
    updates.checkForUpdates()
    await vi.waitFor(() => expect(latest().notice.kind).toBe("error"))
  })

  it("reads the initial enabled state before handling a queued native menu action", async () => {
    const updates = await import("./updates.tsx")
    const check = vi.fn<() => Promise<void>>(async () => updates.receiveUpdate({ phase: "current", beta: true }))

    const onShow = vi.fn<(listener: () => void) => () => void>((listener) => {
      listener()

      return () => undefined
    })

    vi.stubGlobal("window", {
      canvasHost: {
        updates: {
          get: async () => ({ phase: "idle", beta: true }),
          subscribe: () => () => undefined,
          check,
          onShow
        }
      }
    })
    updates.startUpdates()
    expect(onShow).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce())
    expect(latest().notice).toEqual({ kind: "current", beta: true })
  })
})
