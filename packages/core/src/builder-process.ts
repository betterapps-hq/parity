import type { BuilderAdapter, BuilderSession, BuilderStartOptions } from "./adapters.ts"
import type { ComponentSource, ProjectConfig } from "./project.ts"
import type { ServedRecord } from "./served.ts"

/*
 * Each open project's builder runs in a process of its own, which ends when the project closes, so the system takes
 * back everything its build tool held. A closed Vite server can't be freed in the process that ran it: Rolldown's
 * native handles keep its module graph. The project service and the builder's process talk in the messages below, as
 * data: the builder goes by id, which the builder's process looks up, and the renderer as what a builder needs of it.
 */

/** A builder's start options as they cross to its process, with the builder by id. */
export type BuilderProcessOptions = BuilderStartOptions & { builder: string }

/** What the project service asks of a builder's process. */
export type BuilderProcessRequest =
  | { type: "start"; options: BuilderProcessOptions }
  /** The components the guest imports, which change as the type checker and edited files find them. */
  | { type: "components"; components: Record<string, ComponentSource> }
  /** Its CPU time and memory, for the performance stats. */
  | { type: "usage"; id: number }
  /** Closes the builder, then ends the process. */
  | { type: "close" }

/** What a builder's process answers. */
export type BuilderProcessReply =
  | { type: "started"; guestUrl: string; toolVersion: string }
  | { type: "failed"; error: string }
  | ({ type: "usage"; id: number } & ProcessTimes)
  /** What the builder served the pages, once it has closed, for the project's next builder. */
  | { type: "closed"; served: ServedRecord }

/** A process's CPU time and memory, as it reads them itself. */
export interface ProcessTimes {
  /** CPU time used since it started, in microseconds. */
  cpu: number
  /** How long it has run, in milliseconds. */
  uptime: number
  /** Its resident memory, in bytes. */
  memory: number
}

/** Start options as data, for a builder's process. */
export function builderProcessOptions(builder: BuilderAdapter, options: BuilderStartOptions): BuilderProcessOptions {
  const { id, name, guestModule, runtimePackages, runtimeImports } = options.renderer
  return { ...options, renderer: { id, name, guestModule, runtimePackages, runtimeImports }, builder: builder.id }
}

/** What the builder's process does for the code that serves it. */
export interface BuilderProcessSide {
  send(reply: BuilderProcessReply): void
  usage(): ProcessTimes
  /** Ends the process, once the builder has closed. */
  exit(): void
}

/**
 * The builder's process's side: starts the builder it's asked for, keeps the guest's components up to date, and
 * closes it before ending the process. Returns what takes each request.
 */
export function serveBuilderProcess(
  side: BuilderProcessSide,
  builders: BuilderAdapter[]
): (request: BuilderProcessRequest) => void {
  let config: ProjectConfig | undefined
  let session: Promise<BuilderSession | undefined> = Promise.resolve(undefined)
  let closing = false
  return (request) => {
    if (request.type === "start") {
      if (config) return
      const { builder: id, ...options } = request.options
      config = options.config
      session = (async () => {
        const builder = builders.find((adapter) => adapter.id === id)
        if (!builder) throw new Error(`No builder is called ${id}`)
        return builder.start(options)
      })().then(
        (started) => {
          side.send({ type: "started", guestUrl: started.guestUrl, toolVersion: started.toolVersion })
          return started
        },
        (error: unknown) => {
          side.send({ type: "failed", error: error instanceof Error ? error.message : String(error) })
          return undefined
        }
      )
    } else if (request.type === "components") {
      // In place, since the builder serves the guest from this list.
      const components = config?.components
      if (!components) return
      for (const id of Object.keys(components)) if (!(id in request.components)) delete components[id]
      Object.assign(components, request.components)
    } else if (request.type === "usage") {
      side.send({ type: "usage", id: request.id, ...side.usage() })
    } else if (!closing) {
      closing = true
      void session
        .then(async (started) => {
          // Asked first, while the builder can still make a module again to check one whose files changed.
          const served = await started?.served?.().catch(() => undefined)
          await started?.close()
          if (served) side.send({ type: "closed", served })
        })
        .catch(() => undefined)
        .then(() => side.exit())
    }
  }
}

/** The project service's handle on a builder's process. */
export interface BuilderProcessLink {
  send(request: BuilderProcessRequest): void
  /** Ends the process at once, as when its builder doesn't close in time. */
  kill(): void
}

/** A builder session whose builder runs in a process of its own. */
export interface BuilderProcessSession extends BuilderSession {
  /** Passes on the components the guest imports, after the type checker or a changed file changed them. */
  setComponents(components: Record<string, ComponentSource>): void
  /** Its process's CPU and memory, or nothing when it doesn't answer in time. */
  usage(): Promise<BuilderUsage | undefined>
  /**
   * What its builder said it served the pages as it closed: nothing before then, or when it ended without saying, as
   * one that crashed or didn't close in time.
   */
  servedRecord(): ServedRecord | undefined
}

export interface BuilderUsage {
  /** Its share of the whole computer's CPU since it was last asked, or since it started, from 0 to 100. */
  cpu: number
  /** Its resident memory, in bytes. */
  memory: number
}

/** The project service's side of a builder's process, which the code running the process feeds. */
export interface BuilderProcessClient {
  /** The session once the builder answers, or why it couldn't start, as when its process ended first. */
  session: Promise<BuilderProcessSession>
  /** Takes a reply from the process. */
  receive(reply: BuilderProcessReply): void
  /** Tells it the process ended, with why, as a sentence. */
  exited(reason: string): void
  /** The process's CPU and memory, while it runs, starting or not. */
  usage(): Promise<BuilderUsage | undefined>
}

export interface BuilderProcessClientOptions {
  /** Called when the process ends by itself after its builder started, with why. */
  onCrash?: (reason: string) => void
  /** How long a builder has to close before its process is ended, in milliseconds. */
  closeTimeout?: number
  /** How long a usage reading is waited for, in milliseconds. */
  usageTimeout?: number
  /** The computer's cores, which a CPU share is of. */
  cores?: number
}

/**
 * Starts a builder in the process `link` reaches. The session it gives closes the builder and resolves once the
 * process has ended, ending it outright if the builder takes too long. A process that ends before its builder starts
 * fails the start with why; one that ends by itself later is reported to `onCrash`.
 */
export function connectBuilderProcess(
  link: BuilderProcessLink,
  options: BuilderProcessOptions,
  { onCrash, closeTimeout = 5000, usageTimeout = 500, cores = 1 }: BuilderProcessClientOptions = {}
): BuilderProcessClient {
  let state: "starting" | "running" | "closing" | "ended" = "starting"
  let resolveStart: (session: BuilderProcessSession) => void = () => undefined
  let rejectStart: (error: Error) => void = () => undefined
  const session = new Promise<BuilderProcessSession>((resolve, reject) => {
    resolveStart = resolve
    rejectStart = reject
  })
  let markEnded: () => void = () => undefined
  const ended = new Promise<void>((resolve) => (markEnded = resolve))
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const readings = new Map<number, (reply?: ProcessTimes) => void>()
  let nextReading = 1
  let lastReading: ProcessTimes | undefined
  let served: ServedRecord | undefined

  const close = (): Promise<void> => {
    if (state === "starting" || state === "running") {
      state = "closing"
      link.send({ type: "close" })
      killTimer = setTimeout(() => link.kill(), closeTimeout)
    }
    return ended
  }

  const usage = (): Promise<BuilderUsage | undefined> => {
    if (state === "ended") return Promise.resolve(undefined)
    const id = nextReading++
    return new Promise((resolve) => {
      const answer = (reading?: ProcessTimes) => {
        readings.delete(id)
        clearTimeout(timer)
        if (!reading) return resolve(undefined)
        const previous = lastReading && lastReading.uptime < reading.uptime ? lastReading : undefined
        lastReading = reading
        const cpu = reading.cpu - (previous?.cpu ?? 0)
        const elapsed = reading.uptime - (previous?.uptime ?? 0)
        resolve({ cpu: elapsed > 0 ? Math.max(0, (cpu / 1000 / elapsed / cores) * 100) : 0, memory: reading.memory })
      }
      const timer = setTimeout(() => answer(), usageTimeout)
      readings.set(id, answer)
      link.send({ type: "usage", id })
    })
  }

  link.send({ type: "start", options })
  return {
    session,
    usage,
    receive(reply) {
      if (reply.type === "usage") {
        const { type: _, id, ...reading } = reply
        readings.get(id)?.(reading)
      } else if (reply.type === "closed") {
        if (state === "closing") served = reply.served
      } else if (state !== "starting") {
        // A start that answers after it was told to close is closing anyway.
      } else if (reply.type === "started") {
        state = "running"
        const { guestUrl, toolVersion } = reply
        resolveStart({
          guestUrl,
          toolVersion,
          setComponents: (components) => state === "running" && link.send({ type: "components", components }),
          usage,
          servedRecord: () => served,
          close
        })
      } else {
        rejectStart(new Error(reply.error))
        void close()
      }
    },
    exited(reason) {
      if (state === "ended") return
      const was = state
      state = "ended"
      clearTimeout(killTimer)
      for (const answer of readings.values()) answer()
      markEnded()
      if (was === "starting") rejectStart(new Error(reason))
      else if (was === "running") onCrash?.(reason)
    }
  }
}
