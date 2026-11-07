import { describe, expect, it } from "vite-plus/test"
import { lagCheck, startupTimer, updateRecord } from "./app-events.ts"

describe("startupTimer", () => {
  it("gives the timings once every step is in, counting each step's first mark", () => {
    const mark = startupTimer(1000)
    expect(mark("mainReady", 1200)).toBeUndefined()
    expect(mark("windowShown", 1500)).toBeUndefined()
    expect(mark("mainReady", 9000)).toBeUndefined()
    expect(mark("serviceReady", 1600)).toBeUndefined()
    expect(mark("firstPaint", 2100)).toEqual({
      mainReadyMs: 200,
      windowShownMs: 500,
      firstPaintMs: 1100,
      serviceReadyMs: 600
    })
  })

  it("gives them only once", () => {
    const mark = startupTimer(0)
    mark("mainReady", 1)
    mark("windowShown", 2)
    mark("serviceReady", 3)
    expect(mark("firstPaint", 4)).toBeDefined()
    expect(mark("firstPaint", 5)).toBeUndefined()
  })
})

describe("lagCheck", () => {
  it("reports a tick later than the threshold, and only those", () => {
    const check = lagCheck({ every: 500, threshold: 200, start: 0 })
    expect(check.tick(650)).toBeUndefined()
    expect(check.tick(1150)).toBeUndefined()
    expect(check.tick(1851)).toBe(201)
  })

  it("leaves out a tick it's told to skip, and counts the next from it", () => {
    const check = lagCheck({ every: 500, threshold: 200, start: 0 })
    expect(check.tick(60_000, true)).toBeUndefined()
    expect(check.tick(60_500)).toBeUndefined()
  })
})

describe("updateRecord", () => {
  const running = { version: "0.4.0", beta: false }

  it("records a check that finds nothing, and one that finds a version", () => {
    expect(updateRecord({ phase: "checking" }, { phase: "current" }, running)).toEqual({
      name: "update.checked",
      attributes: { channel: "stable", version: "0.4.0" }
    })
    expect(
      updateRecord({ phase: "checking" }, { phase: "downloading", version: "0.5.0" }, { ...running, beta: true })
    ).toEqual({ name: "update.checked", attributes: { channel: "beta", version: "0.4.0", available: "0.5.0" } })
  })

  it("records a download finishing and an install starting", () => {
    expect(
      updateRecord({ phase: "downloading", version: "0.5.0" }, { phase: "ready", version: "0.5.0" }, running)?.name
    ).toBe("update.downloaded")
    expect(
      updateRecord({ phase: "ready", version: "0.5.0" }, { phase: "installing", version: "0.5.0" }, running)?.name
    ).toBe("update.installed")
  })

  it("records a failure with what was under way", () => {
    const failed = { phase: "error", message: "offline" } as const
    expect(updateRecord({ phase: "downloading", version: "0.5.0" }, failed, running)).toEqual({
      name: "update.failed",
      attributes: { channel: "stable", version: "0.4.0", stage: "download", message: "offline" }
    })
    expect(updateRecord({ phase: "checking" }, failed, running)?.attributes).toMatchObject({ stage: "check" })
  })

  it("records nothing for progress or a repeated state", () => {
    const downloading = { phase: "downloading", version: "0.5.0" } as const
    expect(updateRecord(downloading, downloading, running)).toBeUndefined()
    expect(updateRecord({ phase: "idle" }, { phase: "checking" }, running)).toBeUndefined()
  })
})
