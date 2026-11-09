import type { LoggedEvent } from "@parity-app/telemetry"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, type Box, center } from "./app.ts"
import { appEvents, cliEvents, find, type Match, runCli, testRun, trace } from "./events.ts"

// docs/telemetry.md, Checking it in the end-to-end tests (PAR-648): the events the main workflows record, read back from
// the copy's local copy, with the ones that should share a trace sharing it across the window, main and the service.

let app: App

beforeAll(async () => {
  app = await App.connect()
})

afterEach(() => app?.reset())

afterAll(() => app?.close())

// Dashboard's stat cards, in a grid of four columns, as moving.e2e.ts drags them.
const stats = "i59Du"
const [revenue, users, issues, uptime] = ["VvlPt", "BtvqI", "HwbHH", "PJhCQ"]

const at = (box: Box, x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y })

/** The newest event a match describes, once main has written it, which it does each second. */
async function recorded(match: Match, since?: string, read: () => LoggedEvent[] = appEvents): Promise<LoggedEvent> {
  await expect
    .poll(() => find(read(), match, since).length, { message: `${match.name} recorded`, timeout: 10_000 })
    .toBeGreaterThan(0)

  return find(read(), match, since).at(-1)!
}

/** The service's answer to a request asked in a trace, once it's written. */
async function handled(method: string, traceId: string | undefined): Promise<LoggedEvent> {
  expect(traceId).toBeDefined()
  const match = { name: "request.handled", process: "service", traceId, attributes: { method } }
  // A failure shows what the trace has instead.
  await expect
    .poll(() => (find(appEvents(), match).length > 0 ? method : trace(appEvents(), traceId)), {
      message: `the service answering ${method} in the trace`,
      timeout: 10_000
    })
    .toBe(method)

  return find(appEvents(), match).at(-1)!
}

describe("the events Parity records", () => {
  it("tags every line with the CI run, which Sentry has as test_run", async () => {
    await recorded({ name: "app.started" })
    const run = testRun()
    const events = appEvents()
    expect(events.filter((event) => event.testRun !== run).map((event) => event.name)).toEqual([])
  })

  it("puts opening a project in one trace, from asking to its first frame", async () => {
    // The example opened as the copy started, or again since if another file reopened it: the latest open counts.
    const opened = await recorded({ name: "project.opened" })
    expect(opened.attributes).toMatchObject({ framework: "react", builder: "vite", reopen: expect.any(Boolean) })
    expect(opened.attributes.designs).toBeGreaterThan(0)
    expect(opened.traceId).toBeDefined()
    const opening = await recorded({ name: "project.opening", process: "renderer", traceId: opened.traceId })
    expect(opening.outcome).toBe("ok")
    const loaded = await recorded({ name: "project.loaded", traceId: opened.traceId })
    expect(loaded.attributes.components).toBeGreaterThan(0)
    await recorded({ name: "project.drawn", traceId: opened.traceId })
    expect(trace(appEvents(), opened.traceId)).toEqual(
      expect.arrayContaining([
        "renderer project.opening",
        "renderer project.loaded",
        "renderer project.drawn",
        "service project.opened",
        "service request.handled"
      ])
    )
  })

  it("records a drag as a trace of its own, with how it ended", async () => {
    const since = new Date().toISOString()
    await app.show("Dashboard", 0.5)
    await app.selectLayer("Dashboard", users)
    const from = await app.box("Dashboard", users)
    await app.drag(center(from), [
      at(await app.box("Dashboard", issues), 0.5, 0.4),
      at(await app.box("Dashboard", issues), 0.8, 0.3)
    ])
    await expect.poll(() => app.children("Dashboard", stats)).toEqual([revenue, issues, users, uptime])
    const key = await app.key("Dashboard")
    const ran = await recorded({ name: "gesture.ran", attributes: { gesture: "layerDrag" } }, since)
    expect(ran.outcome).toBe("ok")
    expect(ran.attributes.how).toBe("release")
    const ended = await recorded({ name: "gesture.ended", attributes: { kind: "layerDrag" } }, since)
    expect(ended.attributes).toMatchObject({ how: "release", kept: true, undoStep: true })
    expect(ended.attributes.designs).toEqual([key])
    expect(ended.attributes.layers).toEqual([users])
  })

  it("records a command from the keyboard as a trace of its own", async () => {
    const since = new Date().toISOString()
    await app.show("Dashboard", 0.5)
    await app.selectLayer("Dashboard", users)
    await app.page.keyboard.press("Control+d")
    await expect.poll(async () => (await app.children("Dashboard", stats)).length).toBe(5)
    const ran = await recorded({ name: "command.ran", attributes: { action: "duplicate", from: "key" } }, since)
    expect(ran.outcome).toBe("ok")
    expect(ran.attributes).toMatchObject({ enabled: true, layers: 1 })
    expect(ran.traceId).toBeDefined()
  })

  it("puts saving from the keyboard in one trace with the write", async () => {
    const since = new Date().toISOString()
    await app.show("Dashboard", 0.5)
    await app.selectLayer("Dashboard", users)
    await app.page.keyboard.press("Control+d")
    await expect.poll(() => app.unsaved()).not.toEqual([])
    await app.page.keyboard.press("Control+s")

    try {
      await expect.poll(() => app.unsaved()).toEqual([])
      const saved = await recorded({ name: "command.ran", attributes: { action: "save", from: "key" } }, since)
      expect(saved.outcome).toBe("ok")
      const write = await handled("document.save", saved.traceId)
      expect(write.outcome).toBe("ok")
      const file = await recorded({ name: "document.saved" }, since)
      expect(file.attributes.bytes).toBeGreaterThan(0)
    } finally {
      // The file goes back as it was, so undoing everything after the test leaves nothing to save.
      await app.page.keyboard.press("Control+z")
      await expect.poll(() => app.unsaved()).not.toEqual([])
      await app.page.keyboard.press("Control+s")
      await expect.poll(() => app.unsaved()).toEqual([])
    }
  })

  it("puts an agent's call in one trace with the command it came from", async () => {
    const since = new Date().toISOString()
    const result = await runCli(["state", "--json"])
    expect(result.stderr.split("\n").filter((line) => /error/i.test(line))).toEqual([])
    expect(result.code).toBe(0)
    const command = await recorded({ name: "cli.ran", attributes: { command: "state" } }, since, cliEvents)
    expect(command.outcome).toBe("ok")

    const called = await recorded(
      { name: "agent.called", traceId: command.traceId, attributes: { method: "state", transport: "cli" } },
      since
    )

    expect(called).toMatchObject({ process: "service", parentSpanId: command.spanId, outcome: "ok" })
    expect(called.attributes.agent).toBe("e2e")
  })
})
