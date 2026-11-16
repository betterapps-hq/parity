import { afterEach, describe, expect, it } from "vite-plus/test"
import * as processes from "./processes.ts"

afterEach(() => {
  processes.forgetProject("D:/projects/shop")
})

const project = { projectId: "D:/projects/shop", project: "shop" } as const

const storybook = {
  ...project,
  id: "storybook:shop",
  owner: { kind: "parity", role: "tool" },
  lifetime: "server",
  name: "Storybook",
  endpoint: { url: "http://localhost:6006", port: 6006, protocol: "http" }
} as const

describe("servers", () => {
  it("follows a server Parity started until it's dismissed", async () => {
    const tracking = processes.trackProcess({ ...storybook, state: "starting" }, { stop: () => undefined })
    expect((await processes.listProcesses())[0]).toMatchObject({ state: "starting", canStop: true, canRestart: false })
    tracking.set("running")
    tracking.set("failed", { error: "Stopped by itself, with exit code 1" })

    const [listed] = await processes.listProcesses()
    expect(listed).toMatchObject({ state: "failed", canStop: false, error: "Stopped by itself, with exit code 1" })
    expect(listed!.stoppedAt).toBeGreaterThanOrEqual(listed!.startedAt)

    await processes.dismissProcess({ id: "storybook:shop" })
    expect(await processes.listProcesses()).toEqual([])
  })

  it("lists the addresses providers give a server, and opens the one they set", async () => {
    processes.trackProcess({ ...storybook, state: "running" })

    const named = {
      url: "https://storybook.shop.localhost",
      label: "storybook.shop.localhost",
      kind: "name",
      public: false,
      provider: "@parity-app/extension-portless"
    } as const

    processes.setAddresses("storybook:shop", [named], named.url)

    expect((await processes.listProcesses())[0]).toMatchObject({ addresses: [named], opens: named.url })
  })

  it("opens a server at its endpoint without addresses", async () => {
    processes.trackProcess({ ...storybook, state: "running" })
    expect((await processes.listProcesses())[0]).toMatchObject({ addresses: [], opens: "http://localhost:6006" })
  })
})

describe("tasks", () => {
  const typecheck = {
    ...project,
    id: "typecheck:shop",
    owner: { kind: "parity", role: "typecheck" },
    lifetime: "task",
    name: "Type check",
    state: "running"
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
    expect(listed).toMatchObject({ state: "passed", summary: "Read 12 files, no changes", canStop: false })
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
    expect((await processes.listProcesses())[0]?.state).toBe("canceled")

    processes.trackProcess({ ...typecheck, detail: "Reading 12 component files" })
    const [again] = await processes.listProcesses()
    expect(again).toMatchObject({ state: "running", detail: "Reading 12 component files" })
    expect(again!.stoppedAt).toBeUndefined()
  })

  it("keeps each task's last result until it runs again or is dismissed, however long ago it finished", async () => {
    const first = processes.trackProcess(typecheck)
    first.set("failed", { summary: "Couldn't read the components" })

    const lint = processes.trackProcess({
      ...typecheck,
      id: "lint:shop",
      owner: { kind: "parity", role: "lint" },
      name: "Lint"
    })

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
