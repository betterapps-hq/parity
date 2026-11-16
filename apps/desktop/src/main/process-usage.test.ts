import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { BuilderReading } from "../shared/service.ts"
import { type AppMetric, createProcessUsage } from "./process-usage.ts"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

interface Page {
  title: string
  offscreen?: boolean
}

const metric = (pid: number, type: string, extra: Partial<AppMetric> = {}): AppMetric => ({
  pid,
  type,
  cpu: { percentCPUUsage: 40 },
  memory: { workingSetSize: 1000 },
  ...extra
})

const vite: BuilderReading = { pid: 50, name: "Vite for shop", cpu: 3, memory: 2_000_000 }

interface Machine {
  metrics?: AppMetric[]
  pages?: Map<number, Page>
  builders?: () => Promise<BuilderReading[]> | undefined
  privates?: Map<number, number>
}

function setup({
  metrics = [],
  pages = new Map<number, Page>(),
  builders = () => undefined,
  privates = new Map<number, number>()
}: Machine = {}) {
  return createProcessUsage<Page>({
    cores: 4,
    metrics: () => metrics,
    pages: () => pages,
    serviceName: "Parity project service",
    offscreen: (page) => !!page.offscreen,
    title: (page) => page.title,
    builders,
    privateMemory: async () => privates
  })
}

describe("createProcessUsage", () => {
  it("names each process by what it does, and the window that asked as this one", async () => {
    const asker = { title: "Shop" }

    const pages = new Map<number, Page>([
      [3, asker],
      [4, { title: "Blog" }],
      [5, { title: "Offscreen", offscreen: true }],
      [7, { title: "" }]
    ])

    const usage = setup({
      pages,
      metrics: [
        metric(1, "Browser"),
        metric(2, "GPU"),
        metric(3, "Tab"),
        metric(4, "Tab"),
        metric(5, "Tab"),
        metric(6, "Utility", { name: "Parity project service" }),
        metric(7, "Tab"),
        metric(8, "Utility", { serviceName: "network.mojom.NetworkService" })
      ]
    })

    const named = (await usage(asker)).map(({ role, name }) => [role, name])
    expect(named).toEqual([
      ["app", "Parity"],
      ["gpu", "GPU"],
      ["this-window", "This window"],
      ["window", "Blog"],
      ["offscreen", "Offscreen renderer"],
      ["service", "Project service"],
      ["window", "Another window"],
      ["helper", "network.mojom.NetworkService"]
    ])
  })

  it("shares a process's CPU over the cores, and counts its own memory where the system says", async () => {
    const usage = setup({
      metrics: [metric(1, "Browser"), metric(2, "GPU")],
      privates: new Map([[1, 123_456]])
    })

    expect(await usage()).toMatchObject([
      { pid: 1, cpu: 10, memory: 123_456 },
      { pid: 2, cpu: 10, memory: 1_024_000 }
    ])
  })

  it("adds each project's builder, from the service", async () => {
    const usage = setup({ builders: async () => [vite], privates: new Map([[50, 900]]) })
    expect(await usage()).toEqual([{ role: "builder", pid: 50, name: "Vite for shop", cpu: 3, memory: 900 }])
  })

  it("gives the service's last answer when it's too busy to answer within a second", async () => {
    let answer: Promise<BuilderReading[]> = Promise.resolve([vite])
    const usage = setup({ builders: () => answer })
    await usage()

    answer = new Promise(() => undefined)
    const late = usage()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await late).toEqual([{ role: "builder", ...vite }])
  })

  it("gives the service's last answer when it fails to answer", async () => {
    let answer: Promise<BuilderReading[]> = Promise.resolve([vite])
    const usage = setup({ builders: () => answer })
    await usage()
    answer = Promise.reject(new Error("The project service stopped"))
    expect(await usage()).toEqual([{ role: "builder", ...vite }])
  })

  it("counts no builders while no service runs", async () => {
    expect(await setup()()).toEqual([])
  })
})
