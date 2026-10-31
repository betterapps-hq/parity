import { isValidElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { UpdateNotice } from "./UpdateToast.tsx"

const notifications = vi.hoisted(() => ({
  custom: vi.fn<(render: () => unknown, options: { id: string; duration: number; onDismiss: () => void }) => void>(),
  dismiss: vi.fn<(id: string) => void>()
}))
vi.mock("sonner", () => ({ toast: notifications }))
vi.mock("./UpdateToast.tsx", () => ({ UpdateToast: () => null }))
const dialogs = vi.hoisted(() => ({ openDialog: vi.fn<() => void>() }))
vi.mock("./app-dialogs.ts", () => dialogs)

function latest() {
  const render = notifications.custom.mock.lastCall?.[0]
  if (typeof render !== "function") throw new Error("No update toast")
  const element: unknown = render()
  if (!isValidElement<{ notice: UpdateNotice; onDismiss: () => void; onAction: () => void }>(element))
    throw new Error("No update component")
  return element.props
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
    expect(notifications.custom).not.toHaveBeenCalled()
    const check = vi.fn<() => Promise<void>>(async () => updates.receiveUpdate({ phase: "current", beta: false }))
    vi.stubGlobal("window", { canvasHost: { updates: { check } } })
    updates.checkForUpdates()
    expect(latest().notice).toEqual({ kind: "current", beta: false })
    expect(notifications.custom.mock.calls[1]?.[1].id).toBe(notifications.custom.mock.calls[0]?.[1].id)
    expect(dialogs.openDialog).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(check).toHaveResolved())
  })

  it("restores a dismissed notice without its pending removal hiding the new one", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.4.0" })
    const stale = latest()
    const oldId = notifications.custom.mock.lastCall?.[1].id
    stale.onDismiss()
    updates.checkForUpdates()
    const restoredId = notifications.custom.mock.lastCall?.[1].id
    expect(restoredId).not.toBe(oldId)
    expect(latest().notice.kind).toBe("ready")
    stale.onDismiss()
    expect(notifications.dismiss).toHaveBeenLastCalledWith(oldId)
    const calls = notifications.custom.mock.calls.length
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.4.0" })
    expect(notifications.custom).toHaveBeenCalledTimes(calls + 1)
    expect(notifications.custom.mock.lastCall?.[1].id).toBe(restoredId)
  })

  it("keeps swiped progress hidden and gives the ready notice a fresh lifetime", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.4.0",
      percent: 10,
      transferred: 1,
      total: 10
    })
    const native = notifications.custom.mock.lastCall?.[1]
    if (!native) throw new Error("No native toast callbacks")
    native.onDismiss()
    const calls = notifications.custom.mock.calls.length
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.4.0",
      percent: 20,
      transferred: 2,
      total: 10
    })
    expect(notifications.custom).toHaveBeenCalledTimes(calls)
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.4.0" })
    const readyId = notifications.custom.mock.lastCall?.[1].id
    expect(readyId).not.toBe(native.id)
    native.onDismiss()
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.4.0" })
    expect(notifications.custom).toHaveBeenCalledTimes(calls + 2)
    expect(notifications.custom.mock.lastCall?.[1].id).toBe(readyId)
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
    latest().onDismiss()
    updates.checkForUpdates()
    updates.receiveUpdate({ phase: "error", beta: false, message: "Checksum mismatch" })
    expect(latest().notice.kind).toBe("error")
    expect(check).not.toHaveBeenCalled()
  })

  it("dismisses progress without cancelling and resurfaces ready updates on a menu check", async () => {
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
    latest().onDismiss()
    notifications.custom.mockClear()
    updates.receiveUpdate({
      phase: "downloading",
      beta: true,
      version: "0.3.1",
      percent: 20,
      transferred: 2,
      total: 10
    })
    expect(notifications.custom).not.toHaveBeenCalled()
    updates.receiveUpdate({ phase: "ready", beta: true, version: "0.3.1" })
    expect(latest().notice.kind).toBe("ready")
    latest().onDismiss()
    updates.checkForUpdates()
    expect(latest().notice.kind).toBe("ready")
    expect(check).not.toHaveBeenCalled()
    expect(dialogs.openDialog).not.toHaveBeenCalled()
  })

  it("turns rejected IPC into a retryable foreground error, but stays quiet for startup errors", async () => {
    const updates = await import("./updates.tsx")
    updates.receiveUpdate({ phase: "error", beta: false, message: "Offline" })
    expect(notifications.custom).not.toHaveBeenCalled()
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
