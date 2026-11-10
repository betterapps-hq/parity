import { describe, expect, it } from "vite-plus/test"
import { hangWatch, leftoverHangs, mainHangEvent, openHangsFile, openHangsOwner, sentryEnvelope } from "./hangs.ts"

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
