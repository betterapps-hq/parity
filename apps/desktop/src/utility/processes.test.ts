import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { dismissProcess, forgetProject, listProcesses, stopProcess, trackProcess } from "./processes.ts"

let state: string

beforeEach(async () => {
  state = await mkdtemp(join(tmpdir(), "parity-portless-"))
  process.env.PORTLESS_STATE_DIR = state
})

afterEach(async () => {
  forgetProject("D:/projects/shop")
  delete process.env.PORTLESS_STATE_DIR
  await rm(state, { recursive: true, force: true })
})

const project = { projectId: "D:/projects/shop", project: "shop" } as const

const storybook = {
  ...project,
  id: "storybook:shop",
  kind: "storybook",
  shape: "server",
  name: "Storybook",
  url: "http://localhost:6006"
} as const

describe("servers", () => {
  it("follows a server Parity started until it's dismissed", async () => {
    const tracking = trackProcess({ ...storybook, status: "starting" }, { stop: () => undefined })
    expect((await listProcesses())[0]).toMatchObject({ status: "starting", canStop: true, canRestart: false })
    tracking.set("running")
    tracking.set("failed", { error: "Stopped by itself, with exit code 1" })

    const [listed] = await listProcesses()
    expect(listed).toMatchObject({ status: "failed", canStop: false, error: "Stopped by itself, with exit code 1" })
    expect(listed!.stoppedAt).toBeGreaterThanOrEqual(listed!.startedAt)

    await dismissProcess({ id: "storybook:shop" })
    expect(await listProcesses()).toEqual([])
  })

  it("names a server by the Portless route to its port, and lists nothing else Portless routes", async () => {
    await writeFile(
      join(state, "routes.json"),
      JSON.stringify([
        { hostname: "storybook.shop.localhost", port: 6006, pid: process.pid },
        { hostname: "api.shop.localhost", port: 4100, pid: process.pid }
      ])
    )
    await writeFile(join(state, "proxy.port"), "1355")
    trackProcess({ ...storybook, status: "running" })

    expect((await listProcesses()).map((entry) => [entry.name, entry.domain])).toEqual([
      ["Storybook", "http://storybook.shop.localhost:1355"]
    ])
  })

  it("leaves a server unnamed without Portless", async () => {
    trackProcess({ ...storybook, status: "running" })
    expect((await listProcesses())[0]?.domain).toBeUndefined()
  })
})

describe("tasks", () => {
  const typecheck = {
    ...project,
    id: "typecheck:shop",
    kind: "typecheck",
    shape: "task",
    name: "Type check",
    status: "running"
  } as const

  it("shows what a running task is doing, then only what it found", async () => {
    const tracking = trackProcess({ ...typecheck, detail: "Reading 12 component files" })
    tracking.set("running", { progress: { done: 3, total: 12 } })
    expect((await listProcesses())[0]).toMatchObject({ detail: "Reading 12 component files", progress: { done: 3 } })

    tracking.set("passed", { summary: "Read 12 files, no changes" })
    const [listed] = await listProcesses()
    expect(listed).toMatchObject({ status: "passed", summary: "Read 12 files, no changes", canStop: false })
    expect(listed!.detail).toBeUndefined()
    expect(listed!.progress).toBeUndefined()
  })

  it("is canceled when asked to stop, and starts fresh when it runs again", async () => {
    let canceled = false
    const tracking = trackProcess(typecheck, { stop: () => (canceled = true) })
    await stopProcess({ id: "typecheck:shop" })
    expect(canceled).toBe(true)
    expect(tracking.stopping).toBe(true)
    tracking.set("canceled")
    expect((await listProcesses())[0]?.status).toBe("canceled")

    trackProcess({ ...typecheck, detail: "Reading 12 component files" })
    const [again] = await listProcesses()
    expect(again).toMatchObject({ status: "running", detail: "Reading 12 component files" })
    expect(again!.stoppedAt).toBeUndefined()
  })

  it("keeps each task's last result until it runs again or is dismissed, however long ago it finished", async () => {
    const first = trackProcess(typecheck)
    first.set("failed", { summary: "Couldn't read the components" })
    const lint = trackProcess({ ...typecheck, id: "lint:shop", kind: "lint", name: "Lint" })
    lint.set("passed", { summary: "No problems" })
    expect((await listProcesses()).map((entry) => entry.summary)).toEqual([
      "Couldn't read the components",
      "No problems"
    ])

    trackProcess(typecheck).set("passed", { summary: "Read 12 files, no changes" })
    expect((await listProcesses()).map((entry) => entry.summary)).toEqual(["Read 12 files, no changes", "No problems"])

    await dismissProcess({ id: "lint:shop" })
    expect((await listProcesses()).map((entry) => entry.id)).toEqual(["typecheck:shop"])
  })
})
