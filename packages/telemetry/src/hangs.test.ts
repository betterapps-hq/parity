import { describe, expect, it } from "vite-plus/test"
import {
  debugImages,
  hangWatch,
  leftoverHangs,
  mainHangEvent,
  openHangsFile,
  openHangsOwner,
  openHangsRun,
  sentryEnvelope,
  stackFrames,
  stuckWhere
} from "./hangs.ts"

describe("hangWatch", () => {
  it("starts a hang once the heartbeat is over the threshold late, then reports it as ongoing", () => {
    const watch = hangWatch({ every: 500, threshold: 2000, start: 0 })
    expect(watch.check(500)).toBeUndefined()
    expect(watch.check(1000)).toBeUndefined()
    expect(watch.check(1500)).toBeUndefined()
    expect(watch.check(2000)).toBeUndefined()
    expect(watch.check(2500)).toEqual({ state: "started", stuckMs: 2500 })
    expect(watch.check(3000)).toEqual({ state: "ongoing", stuckMs: 3000 })
  })

  it("ends the hang when the heartbeat comes back, with how long it lasted", () => {
    const watch = hangWatch({ every: 500, threshold: 2000, start: 0 })
    watch.beat(1000)

    for (let at = 1500; at <= 3500; at += 500) {
      watch.check(at)
    }

    expect(watch.beat(3700)).toBe(2700)
    expect(watch.check(4000)).toBeUndefined()
  })

  it("gives nothing for a heartbeat that never stopped", () => {
    const watch = hangWatch({ every: 500, threshold: 2000, start: 0 })

    for (let at = 500; at <= 10_000; at += 500) {
      expect(watch.beat(at)).toBeUndefined()
      expect(watch.check(at + 1)).toBeUndefined()
    }
  })

  it("starts counting again after its own check runs late, as when the computer sleeps", () => {
    const watch = hangWatch({ every: 500, threshold: 2000, start: 0 })
    expect(watch.check(60_000)).toBeUndefined()
    expect(watch.check(60_500)).toBeUndefined()
    expect(watch.check(62_000)).toBeUndefined()
    expect(watch.check(62_500)).toEqual({ state: "started", stuckMs: 2500 })
  })
})

describe("openHangsRun", () => {
  it("gives the release and environment a file was kept under", () => {
    expect(openHangsRun({ release: "parity-desktop@1.2.0", environment: "beta", hangs: [] })).toEqual({
      release: "parity-desktop@1.2.0",
      environment: "beta"
    })
  })

  it("gives neither for a file that doesn't say, or isn't one", () => {
    expect(openHangsRun({ hangs: [] })).toEqual({})
    expect(openHangsRun("nonsense")).toEqual({})
  })
})

describe("openHangsFile", () => {
  it("names each process's file, which gives back the process", () => {
    expect(openHangsFile("windows", 4120)).toBe("windows-4120.json")
    expect(openHangsOwner(openHangsFile("main", 77))).toBe(77)
  })

  it("owns nothing for a file that isn't an open-hang file", () => {
    expect(openHangsOwner("main.json")).toBeUndefined()
    expect(openHangsOwner("notes-12.json")).toBeUndefined()
  })
})

describe("leftoverHangs", () => {
  it("gives main and window hangs from an earlier run as ended by the app exiting", () => {
    expect(
      leftoverHangs({
        hangs: [
          { kind: "main", stuckMs: 8000.4 },
          { kind: "render", stuckMs: 3100 }
        ]
      })
    ).toEqual([
      { name: "main.blocked", attributes: { stuckMs: 8000, ended: "exited" } },
      { name: "window.hung", attributes: { window: "render", stuckMs: 3100, ended: "exited" } }
    ])
  })

  it("gives none for a file that isn't a list of hangs", () => {
    expect(leftoverHangs(undefined)).toEqual([])
    expect(leftoverHangs({ hangs: [{ kind: "gpu", stuckMs: 1 }] })).toEqual([])
    expect(leftoverHangs("{}")).toEqual([])
  })
})

describe("mainHangEvent", () => {
  it("tags the message as main's hang, with main's release and user", () => {
    expect(
      mainHangEvent({
        stuckMs: 2500,
        scope: {
          release: "parity-desktop@1.0.0",
          environment: "development",
          tags: { driver: "person" },
          user: { id: "i" }
        },
        eventId: "abc",
        now: 100
      })
    ).toEqual({
      event_id: "abc",
      timestamp: 100,
      platform: "node",
      level: "warning",
      message: "Main stopped answering",
      tags: { driver: "person", process: "main", hang: "main" },
      extra: { stuckMs: 2500 },
      fingerprint: ["main-stopped-answering"],
      release: "parity-desktop@1.0.0",
      environment: "development",
      user: { id: "i" }
    })
  })
})

describe("sentryEnvelope", () => {
  const event = mainHangEvent({ stuckMs: 2500, scope: { tags: {} }, eventId: "abc", now: 100 })

  it("posts to the DSN's project envelope endpoint with its key", () => {
    const request = sentryEnvelope("https://key123@o1.ingest.sentry.io/456", event, new Date(0))
    expect(request?.url).toBe("https://o1.ingest.sentry.io/api/456/envelope/?sentry_key=key123&sentry_version=7")
    expect(request?.body.split("\n").map((line) => JSON.parse(line))).toEqual([
      { event_id: "abc", sent_at: "1970-01-01T00:00:00.000Z", dsn: "https://key123@o1.ingest.sentry.io/456" },
      { type: "event" },
      event
    ])
  })

  it("gives none for a DSN without a key or project", () => {
    expect(sentryEnvelope("https://o1.ingest.sentry.io/456", event, new Date(0))).toBeUndefined()
    expect(sentryEnvelope("https://key@o1.ingest.sentry.io/", event, new Date(0))).toBeUndefined()
    expect(sentryEnvelope("not a dsn", event, new Date(0))).toBeUndefined()
  })
})

describe("main's stack", () => {
  const root = String.raw`C:\Users\someone\AppData\Local\Programs\Parity\resources\app.asar`

  const paused = [
    {
      functionName: "readEverything",
      url: "file:///C:/Users/someone/AppData/Local/Programs/Parity/resources/app.asar/main.mjs",
      location: { lineNumber: 9, columnNumber: 4 }
    },
    {
      functionName: "",
      url: "node:internal/timers",
      location: { lineNumber: 0, columnNumber: 0 }
    }
  ]

  it("names the app's files from its folder, outermost frame first", () => {
    expect(stackFrames(paused, root)).toEqual([
      { filename: "node:internal/timers", function: "<anonymous>", lineno: 1, colno: 1, in_app: false },
      { filename: "app:///main.mjs", function: "readEverything", lineno: 10, colno: 5, in_app: true }
    ])
  })

  it("says where main was stuck by the innermost of the app's own frames", () => {
    const frames = stackFrames([paused[1], paused[0], paused[1]].reverse(), root)
    expect(stuckWhere(frames)).toBe("readEverything (app:///main.mjs:10:5)")
    expect(stuckWhere([])).toBeUndefined()
  })

  it("finds each bundle's debug ID from the stacks it's kept by", () => {
    const stack = `Error\n    at file:///C:/Users/someone/AppData/Local/Programs/Parity/resources/app.asar/main.mjs:1:120`
    expect(debugImages({ [stack]: "id-1", nonsense: "id-2" }, root)).toEqual([
      { type: "sourcemap", code_file: "app:///main.mjs", debug_id: "id-1" }
    ])
  })

  it("puts the stack on the watchdog's event, named by where it was stuck", () => {
    const frames = stackFrames(paused, root)

    const event = mainHangEvent({
      stuckMs: 2500,
      scope: { tags: {} },
      eventId: "abc",
      now: 1,
      stack: { frames, images: [] }
    })

    expect(event.exception?.values[0]).toMatchObject({
      type: "ApplicationNotResponding",
      value: "Main stopped answering in readEverything (app:///main.mjs:10:5)",
      stacktrace: { frames }
    })
  })

  it("groups hangs caught on different frames as one Sentry issue", () => {
    const caughtOn = (functionName: string) =>
      mainHangEvent({
        stuckMs: 2500,
        scope: { tags: {} },
        eventId: "abc",
        now: 1,
        stack: {
          frames: [{ filename: "app:///main.mjs", function: functionName, lineno: 1, colno: 1, in_app: true }],
          images: []
        }
      }).fingerprint

    expect(caughtOn("emit")).toEqual(caughtOn("isPackaged"))
  })

  it("carries where main was stuck into the next run's report", () => {
    expect(leftoverHangs({ hangs: [{ kind: "main", stuckMs: 3000, where: "f (app:///main.mjs:1:1)" }] })).toEqual([
      { name: "main.blocked", attributes: { stuckMs: 3000, ended: "exited", where: "f (app:///main.mjs:1:1)" } }
    ])
  })
})
