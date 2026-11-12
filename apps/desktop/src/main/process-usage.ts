import type { ProcessUsage } from "../shared/protocol.ts"
import type { BuilderReading } from "../shared/service.ts"

/** One of the app's processes, as Electron's `app.getAppMetrics()` gives it. */
export interface AppMetric {
  pid: number
  type: string
  name?: string
  serviceName?: string
  cpu: { percentCPUUsage: number }
  /** In kilobytes. */
  memory: { workingSetSize: number }
}

export interface ProcessUsageOptions<Page> {
  /** How many cores the machine has, which a process's CPU is shared out over. */
  cores: number
  metrics: () => AppMetric[]
  /** Each page, by the id of the process it runs in. */
  pages: () => Map<number, Page>
  /** The project service's own name, as its process is listed. */
  serviceName: string
  /** Whether `page` is an offscreen renderer's. */
  offscreen: (page: Page) => boolean
  title: (page: Page) => string
  /** Each project's builder's CPU and memory, from the service, or nothing when no service runs. */
  builders: () => Promise<BuilderReading[]> | undefined
  /** What each process uses on its own, by process id, where the system says (see private-memory.ts). */
  privateMemory: (pids: number[]) => Promise<ReadonlyMap<number, number>>
  /** How long the service has to answer before its last answer is given instead. */
  builderWaitMs?: number
}

/**
 * The performance stats: each process's CPU and memory, named by what it does, with `asker` named as this window.
 * Storybook and other programs the project service starts run outside the app, so they aren't counted, apart from each
 * project's builder, which runs in a process of its own the service starts. Memory is what each process uses on its
 * own, as the system's monitor counts it, and its working set where the system won't say.
 */
export function createProcessUsage<Page>({
  cores,
  metrics,
  pages,
  serviceName,
  offscreen,
  title,
  builders,
  privateMemory,
  builderWaitMs = 1000
}: ProcessUsageOptions<Page>): (asker?: Page) => Promise<ProcessUsage[]> {
  /** The service's last answer, for when it's too busy to answer in time. */
  let lastBuilders: BuilderReading[] = []

  const builderReadings = (): Promise<BuilderReading[]> => {
    const asked = builders()

    if (!asked) {
      return Promise.resolve([])
    }

    let timer: ReturnType<typeof setTimeout> | undefined

    const late = new Promise<BuilderReading[]>((resolve) => {
      timer = setTimeout(() => resolve(lastBuilders), builderWaitMs)
    })

    const answered = asked.then(
      (readings) => (lastBuilders = readings),
      () => lastBuilders
    )

    return Promise.race([answered, late]).finally(() => clearTimeout(timer))
  }

  return async (asker) => {
    const byPid = pages()
    const listed = metrics()
    const readings = await builderReadings()
    const privates = await privateMemory([...listed.map((metric) => metric.pid), ...readings.map(({ pid }) => pid)])

    const usage = listed.map((metric): ProcessUsage => {
      const page = byPid.get(metric.pid)
      let role: ProcessUsage["role"]

      if (metric.type === "Browser") {
        role = "app"
      } else if (metric.type === "GPU") {
        role = "gpu"
      } else if (metric.name === serviceName) {
        role = "service"
      } else if (page !== undefined && offscreen(page)) {
        role = "offscreen"
      } else if (page !== undefined && page === asker) {
        role = "this-window"
      } else {
        role = page === undefined ? "helper" : "window"
      }

      const names: Record<ProcessUsage["role"], string> = {
        app: "Parity",
        "this-window": "This window",
        window: (page !== undefined && title(page)) || "Another window",
        offscreen: "Offscreen renderer",
        service: "Project service",
        builder: "Builder",
        gpu: "GPU",
        helper: metric.name || metric.serviceName || metric.type
      }

      return {
        role,
        name: names[role],
        pid: metric.pid,
        cpu: metric.cpu.percentCPUUsage / cores,
        memory: privates.get(metric.pid) ?? metric.memory.workingSetSize * 1024
      }
    })

    const builderUsage = readings.map((builder): ProcessUsage => ({
      role: "builder",
      ...builder,
      memory: privates.get(builder.pid) ?? builder.memory
    }))

    return [...usage, ...builderUsage]
  }
}
