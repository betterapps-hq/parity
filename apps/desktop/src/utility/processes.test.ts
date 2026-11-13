import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type * as Processes from "./processes.ts"

let state: string
let processes: typeof Processes

// Portless's state folder is part of the service's environment, which is read once, so each test starts the service.
beforeEach(async () => {
  state = await mkdtemp(join(tmpdir(), "parity-portless-"))
  vi.stubEnv("PORTLESS_STATE_DIR", state)
  vi.resetModules()
  processes = await import("./processes.ts")
})

afterEach(async () => {
  processes.forgetProject("D:/projects/shop")
  vi.unstubAllEnvs()
  await rm(state, { recursive: true, force: true })
})

const project = { projectId: "D:/projects/shop", project: "shop" } as const

const storybook = {
  ...project,
  id: "storybook:shop",
  kind: "tool",
  lifetime: "server",
  name: "Storybook",
  url: "http://localhost:6006"
} as const

describe("servers", () => {
  it("follows a server Parity started until it's dismissed", async () => {
    const tracking = processes.trackProcess({ ...storybook, status: "starting" }, { stop: () => undefined })
    expect((await processes.listProcesses())[0]).toMatchObject({ status: "starting", canStop: true, canRestart: false })
    tracking.set("running")
    tracking.set("failed", { error: "Stopped by itself, with exit code 1" })

    const [listed] = await processes.listProcesses()
    expect(listed).toMatchObject({ status: "failed", canStop: false, error: "Stopped by itself, with exit code 1" })
    expect(listed!.stoppedAt).toBeGreaterThanOrEqual(listed!.startedAt)

    await processes.dismissProcess({ id: "storybook:shop" })
    expect(await processes.listProcesses()).toEqual([])
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
    processes.trackProcess({ ...storybook, status: "running" })

    expect((await processes.listProcesses()).map((entry) => [entry.name, entry.domain])).toEqual([
      ["Storybook", "http://storybook.shop.localhost:1355"]
    ])
  })

  it("leaves a server unnamed without Portless", async () => {
    processes.trackProcess({ ...storybook, status: "running" })
    expect((await processes.listProcesses())[0]?.domain).toBeUndefined()
  })
})

describe("tasks", () => {
  const typecheck = {
    ...project,
    id: "typecheck:shop",
    kind: "typecheck",
    lifetime: "task",
    name: "Type check",
    status: "running"
  } as const

  it("shows what a running task is doing, then only what it found", async () => {
    const tracking = processes.trackProcess({ ...typecheck, detail: "Reading 12 component files" })
    tracking.set("running", { progress: { done: 3, total: 12 } })
    expect((await processes.listProcesses())[0]).toMatchObject({
      detail: "Reading 12 component files",
      progress: { done: 3 }
    })

    tracking.set("passed", { summary: "Read 12 files, no changes" })
    const [listed] = await processes.listProcesses()
    expect(listed).toMatchObject({ status: "passed", summary: "Read 12 files, no changes", canStop: false })
    expect(listed!.detail).toBeUndefined()
    expect(listed!.progress).toBeUndefined()
  })

  it("is canceled when asked to stop, and starts fresh when it runs again", async () => {
    let canceled = false
    const tracking = processes.trackProcess(typecheck, { stop: () => (canceled = true) })
    await processes.stopProcess({ id: "typecheck:shop" })
    expect(canceled).toBe(true)
    expect(tracking.stopping).toBe(true)
    tracking.set("canceled")
    expect((await processes.listProcesses())[0]?.status).toBe("canceled")

    processes.trackProcess({ ...typecheck, detail: "Reading 12 component files" })
    const [again] = await processes.listProcesses()
    expect(again).toMatchObject({ status: "running", detail: "Reading 12 component files" })
    expect(again!.stoppedAt).toBeUndefined()
  })

  it("keeps each task's last result until it runs again or is dismissed, however long ago it finished", async () => {
    const first = processes.trackProcess(typecheck)
    first.set("failed", { summary: "Couldn't read the components" })
    const lint = processes.trackProcess({ ...typecheck, id: "lint:shop", kind: "lint", name: "Lint" })
    lint.set("passed", { summary: "No problems" })
    expect((await processes.listProcesses()).map((entry) => entry.summary)).toEqual([
      "Couldn't read the components",
      "No problems"
    ])

    processes.trackProcess(typecheck).set("passed", { summary: "Read 12 files, no changes" })
    expect((await processes.listProcesses()).map((entry) => entry.summary)).toEqual([
      "Read 12 files, no changes",
      "No problems"
    ])

    await processes.dismissProcess({ id: "lint:shop" })
    expect((await processes.listProcesses()).map((entry) => entry.id)).toEqual(["typecheck:shop"])
  })
})
