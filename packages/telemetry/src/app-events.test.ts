import { describe, expect, it } from "vite-plus/test"
import {
  hangThresholdMs,
  lagCheck,
  mainBlocked,
  memoryRecord,
  outputTail,
  serviceCrash,
  serviceExit,
  serviceExited,
  startupTimer,
  updateRecord,
  windowHung
} from "./app-events.ts"

describe("startupTimer", () => {
  it("gives the timings once every step is in, counting each step's first mark", () => {
    const mark = startupTimer(1000)
    expect(mark("mainReady", 1200)).toBeUndefined()
    expect(mark("windowShown", 1500)).toBeUndefined()
    expect(mark("mainReady", 9000)).toBeUndefined()
    expect(mark("serviceReady", 1600)).toBeUndefined()
    expect(mark("firstPaint", 2100)).toEqual({
      name: "app.started",
      attributes: { mainReadyMs: 200, windowShownMs: 500, firstPaintMs: 1100, serviceReadyMs: 600 }
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

  it("gives the first project shown on its own, once, whenever it comes", () => {
    const mark = startupTimer(1000)
    expect(mark("firstProject", 4200, { restored: true })).toEqual({
      name: "app.first_project",
      attributes: { firstProjectMs: 3200, restored: true }
    })
    expect(mark("firstProject", 9000, { restored: false })).toBeUndefined()
    mark("mainReady", 1200)
    mark("windowShown", 1500)
    mark("serviceReady", 1600)
    expect(mark("firstPaint", 2100)?.name).toBe("app.started")
  })

  it("gives nothing after an interruption, since the steps still to come time the wait", () => {
    const mark = startupTimer(0)
    mark("mainReady", 300)
    mark("windowShown", 400)
    mark("serviceReady", 450)
    mark("interrupted", 500)
    expect(mark("firstPaint", 7_300_000)).toBeUndefined()
    expect(mark("firstProject", 7_301_000, { restored: true })).toBeUndefined()
  })

  it("keeps what was given before an interruption", () => {
    const mark = startupTimer(0)
    mark("mainReady", 300)
    mark("windowShown", 400)
    mark("serviceReady", 450)
    expect(mark("firstPaint", 700)?.name).toBe("app.started")
    expect(mark("interrupted", 800)).toBeUndefined()
  })

  it("counts a project the person chose as not restored", () => {
    expect(startupTimer(0)("firstProject", 30_000)).toEqual({
      name: "app.first_project",
      attributes: { firstProjectMs: 30_000, restored: false }
    })
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

describe("serviceExit", () => {
  it("records a service that failed as not restarted, with its code and how long it ran", () => {
    expect(serviceExit({ exitCode: 1, ranMs: 1000.4, replaced: false, quitting: false })).toEqual({
      exitCode: 1,
      ranMs: 1000,
      restarted: false
    })
  })

  it("records a service a fresh one replaced as restarted, whatever its code", () => {
    expect(serviceExit({ exitCode: 0, ranMs: 1000.4, replaced: true, quitting: false })).toEqual({
      exitCode: 0,
      ranMs: 1000,
      restarted: true
    })
    expect(serviceExit({ exitCode: 15, ranMs: 1000.4, replaced: true, quitting: false })).toEqual({
      exitCode: 15,
      ranMs: 1000,
      restarted: true
    })
  })

  it("records nothing as the app quits, or for a service that ended cleanly on its own", () => {
    expect(serviceExit({ exitCode: 1, ranMs: 1000.4, replaced: false, quitting: true })).toBeUndefined()
    expect(serviceExit({ exitCode: 0, ranMs: 1000.4, replaced: false, quitting: false })).toBeUndefined()
  })

  it("gives attributes that service.exited accepts", () => {
    expect(
      serviceExited.schema.safeParse(serviceExit({ exitCode: -1, ranMs: 1000.4, replaced: false, quitting: false }))
        .success
    ).toBe(true)
  })
})

describe("hang events", () => {
  it("take how long the window or main was stuck as a whole number of milliseconds", () => {
    expect(windowHung.schema.safeParse({ window: "render", stuckMs: 3200, ended: "closed" }).success).toBe(true)
    expect(mainBlocked.schema.safeParse({ stuckMs: 2400, ended: "answered" }).success).toBe(true)
    expect(mainBlocked.schema.safeParse({ stuckMs: 2400, ended: "closed" }).success).toBe(false)
    expect(mainBlocked.schema.safeParse({ stuckMs: "2400", ended: "answered" }).success).toBe(false)
  })

  it("count main as blocked only once its timer runs over the hang threshold late", () => {
    const check = lagCheck({ every: 500, threshold: hangThresholdMs, start: 0 })
    expect(check.tick(500 + hangThresholdMs)).toBeUndefined()
    expect(check.tick(500 + hangThresholdMs + 500 + hangThresholdMs + 1)).toBe(hangThresholdMs + 1)
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

  it("records the updater's error code apart from its message", () => {
    const failed = {
      phase: "error",
      message: "Cannot find latest.yml",
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
    } as const

    expect(updateRecord({ phase: "checking" }, failed, running)?.attributes).toEqual({
      channel: "stable",
      version: "0.4.0",
      stage: "check",
      message: "Cannot find latest.yml",
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
    })
  })

  it("records nothing for progress or a repeated state", () => {
    const downloading = { phase: "downloading", version: "0.5.0" } as const
    expect(updateRecord(downloading, downloading, running)).toBeUndefined()
    expect(updateRecord({ phase: "idle" }, { phase: "checking" }, running)).toBeUndefined()
  })
})

describe("memoryRecord", () => {
  it("sums each role's memory into a whole number of bytes Sentry can chart, beside the list", () => {
    const record = memoryRecord("interval", [
      { role: "app", memory: 100.4 },
      { role: "service", memory: 200 },
      { role: "window", memory: 300 },
      { role: "window", memory: 50 },
      { role: "offscreen", memory: 400 },
      { role: "builder", memory: 500 },
      { role: "gpu", memory: 60 }
    ])

    expect(record).toMatchObject({
      reason: "interval",
      mainBytes: 100,
      serviceBytes: 200,
      editorBytes: 350,
      renderBytes: 400,
      totalBytes: 1610
    })
    expect(record.processes).toContainEqual({ role: "app", memory: 100 })
  })

  it("counts a role with no process as 0", () => {
    expect(memoryRecord("hang", [{ role: "app", memory: 10 }])).toMatchObject({
      serviceBytes: 0,
      editorBytes: 0,
      renderBytes: 0,
      totalBytes: 10
    })
  })
})

describe("outputTail", () => {
  it("keeps the last lines of output that arrives in pieces", () => {
    const tail = outputTail(2)
    tail.add("one\ntw")
    tail.add("o\r\nthree\n")
    expect(tail.text()).toBe("two\nthree")
  })

  it("is empty for a process that printed nothing", () => {
    expect(outputTail().text()).toBe("")
  })
})

describe("serviceCrash", () => {
  const output = [
    "node:internal/modules/cjs/loader:1571",
    "  const err = new Error(message);",
    "",
    "Error: Cannot find module '../data/patch.json'",
    "Require stack:",
    "- /tmp/parity/resources/app.asar.unpacked/utility.mjs",
    "Node.js v24.22.1"
  ].join("\n")

  it("names and groups a crash by the error the service printed, with its output", () => {
    expect(serviceCrash({ exitCode: 1, output, expected: false })).toEqual({
      message: "The project service exited with code 1: Error: Cannot find module '../data/patch.json'",
      fingerprint: ["service-exited", "Error: Cannot find module '../data/patch.json'"],
      output
    })
  })

  it("reads an error with a code, as Node prints a system error", () => {
    const printed = "TypeError [ERR_INVALID_ARG_TYPE]: bad path\n    at x"
    expect(serviceCrash({ exitCode: 7, output: printed, expected: false })?.fingerprint).toEqual([
      "service-exited",
      "TypeError [ERR_INVALID_ARG_TYPE]: bad path"
    ])
  })

  it("names the missing script when the service printed nothing", () => {
    expect(serviceCrash({ exitCode: 1, output: "", expected: false, missing: "/app/utility.mjs" })).toMatchObject({
      message: "The project service exited with code 1: /app/utility.mjs doesn't exist",
      fingerprint: ["service-exited", "/app/utility.mjs doesn't exist"]
    })
  })

  it("groups a crash that printed no error by its code", () => {
    expect(serviceCrash({ exitCode: 3, output: "starting\n", expected: false })).toMatchObject({
      message: "The project service exited with code 3",
      fingerprint: ["service-exited", "code 3"]
    })
  })

  it("reports nothing for an expected exit or a clean one", () => {
    expect(serviceCrash({ exitCode: 1, output, expected: true })).toBeUndefined()
    expect(serviceCrash({ exitCode: 0, output, expected: false })).toBeUndefined()
  })
})
