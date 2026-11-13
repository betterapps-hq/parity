import { describe, expect, it } from "vite-plus/test"
import { type UpdateState, updateState } from "./updates.ts"

describe("update state", () => {
  const idle: UpdateState = { phase: "idle", beta: false }
  const checking = updateState(idle, { type: "check" })
  const downloading = updateState(checking, { type: "available", version: "0.4.0", manual: false })

  it("keeps background downloads and ready updates when another check is requested", () => {
    expect(updateState(downloading, { type: "check" })).toBe(downloading)
    const ready = updateState(downloading, { type: "downloaded" })
    expect(updateState(ready, { type: "check" })).toBe(ready)
    expect(updateState(ready, { type: "progress", transferred: 1, total: 2 })).toBe(ready)
    expect(updateState(ready, { type: "current" })).toBe(ready)
  })

  it("does not change channels under a running download, and discards readiness when channels change", () => {
    expect(updateState(downloading, { type: "beta", beta: true })).toBe(downloading)
    const ready = updateState(downloading, { type: "downloaded" })
    expect(updateState(ready, { type: "beta", beta: true })).toEqual({ phase: "idle", beta: true })
  })

  it("never installs an unsigned Mac update", () => {
    const manual = updateState(checking, { type: "available", version: "0.4.0", manual: true })
    expect(manual).toEqual({ phase: "manual", beta: false, version: "0.4.0" })
    expect(updateState(manual, { type: "install" })).toBe(manual)
    expect(updateState(manual, { type: "downloaded" })).toBe(manual)
  })

  it("never claims invalid, negative, or greater-than-complete progress", () => {
    expect(updateState(downloading, { type: "progress", transferred: 3, total: 2 })).toMatchObject({ percent: 100 })
    expect(updateState(downloading, { type: "progress", transferred: -3, total: 2 })).toMatchObject({
      percent: 0,
      transferred: 0
    })
    expect(updateState(downloading, { type: "progress", transferred: NaN, total: Infinity })).toMatchObject({
      percent: 0,
      total: 0,
      transferred: 0
    })
  })

  it("does not activate development builds, even on an explicit check or install request", () => {
    const disabled: UpdateState = { phase: "disabled", beta: false }
    expect(updateState(disabled, { type: "check" })).toBe(disabled)
    expect(updateState(disabled, { type: "install" })).toBe(disabled)
  })
})
