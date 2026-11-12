import type { BuilderAdapter, BuilderRenderer, BuilderSession, BuilderStartOptions, CodeChange } from "./adapters.ts"
import type { ComponentSource, ProjectConfig } from "./project.ts"

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
  /** Where it serves the guest with the stylesheets of the change stamped `stamp` (PAR-821). */
  | { type: "restyledGuestUrl"; id: number; stamp: number }
  /** The project files the modules of `files` load, as the build tool resolved them (PAR-994). */
  | { type: "loadedFiles"; id: number; files: string[] }
  /** Closes the builder, then ends the process. */
  | { type: "close" }

/** What a builder's process answers. */
export type BuilderProcessReply =
  | { type: "started"; guestUrl: string; toolVersion: string }
  | { type: "failed"; error: string }
  /** Project files whose code changed on disk, as the builder found them (PAR-165). */
  | ({ type: "codeChanged" } & CodeChange)
  | ({ type: "usage"; id: number } & ProcessTimes)
  /** The restyled guest's address, or none when the builder doesn't offer one. */
  | { type: "restyledGuestUrl"; id: number; guestUrl?: string }
  /** The files `loadedFiles` asked about load, or none when the builder can't say. */
  | { type: "loadedFiles"; id: number; files?: string[] }

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
  const { id, name, guestModule, runtimePackages, runtimeImports, developmentStandIns } = options.renderer
  const renderer: BuilderRenderer = { id, name, guestModule, runtimePackages, runtimeImports }

  if (developmentStandIns) {
    renderer.developmentStandIns = developmentStandIns
  }

  return { ...options, renderer, builder: builder.id }
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
      if (config) {
        return
      }

      const { builder: id, ...options } = request.options
      config = options.config
      session = (async () => {
        const builder = builders.find((adapter) => adapter.id === id)

        if (!builder) {
          throw new Error(`No builder is called ${id}`)
        }

        return builder.start(options)
      })().then(
        (started) => {
          side.send({ type: "started", guestUrl: started.guestUrl, toolVersion: started.toolVersion })
          started.codeChanges?.((change) => side.send({ type: "codeChanged", ...change }))

          return started
        },
        (cause: unknown) => {
          side.send({ type: "failed", error: cause instanceof Error ? cause.message : String(cause) })

          return undefined
        }
      )
    } else if (request.type === "components") {
      // In place, since the builder serves the guest from this list.
      const components = config?.components

      if (!components) {
        return
      }

      for (const id of Object.keys(components)) {
        if (!(id in request.components)) {
          delete components[id]
        }
      }

      Object.assign(components, request.components)
    } else if (request.type === "usage") {
      side.send({ type: "usage", id: request.id, ...side.usage() })
    } else if (request.type === "restyledGuestUrl") {
      const { id, stamp } = request
      void session
        .then((started) => started?.restyledGuestUrl?.(stamp))
        .catch(() => undefined)
        .then((guestUrl) =>
          side.send(guestUrl ? { type: "restyledGuestUrl", id, guestUrl } : { type: "restyledGuestUrl", id })
        )
    } else if (request.type === "loadedFiles") {
      const { id, files } = request
      void session
        .then((started) => started?.loadedFiles?.(files))
        .catch(() => undefined)
        .then((loaded) => side.send(loaded ? { type: "loadedFiles", id, files: loaded } : { type: "loadedFiles", id }))
    } else if (!closing) {
      closing = true
      void session
        .then((started) => started?.close())
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
export interface BuilderProcessSession extends Omit<BuilderSession, "restyledGuestUrl" | "loadedFiles"> {
  /**
   * Where the builder serves the guest with the stylesheets of the change stamped `stamp`, asked of its process; none
   * when it doesn't offer one (see `BuilderSession.restyledGuestUrl`) or its process has ended.
   */
  restyledGuestUrl?(stamp: number): Promise<string | undefined>
  /**
   * The project files the modules of `files` load, asked of its process (see `BuilderSession.loadedFiles`); none when
   * the builder can't say, its process has ended or it doesn't answer in time.
   */
  loadedFiles(files: string[]): Promise<string[] | undefined>
  /** Passes on the components the guest imports, after the type checker or a changed file changed them. */
  setComponents(components: Record<string, ComponentSource>): void
  /** Its process's CPU and memory, or nothing when it doesn't answer in time. */
  usage(): Promise<BuilderUsage | undefined>
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
  /** Called when the builder says project files' code changed, while it runs. */
  onCodeChange?: (change: CodeChange) => void
  /** How long a builder has to close before its process is ended, in milliseconds. */
  closeTimeout?: number
  /** How long a usage reading is waited for, in milliseconds. */
  usageTimeout?: number
  /** How long the files modules load are waited for, in milliseconds. */
  loadedFilesTimeout?: number
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
  {
    onCrash,
    onCodeChange,
    closeTimeout = 5000,
    usageTimeout = 500,
    loadedFilesTimeout = 2000,
    cores = 1
  }: BuilderProcessClientOptions = {}
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
  const addresses = new Map<number, (guestUrl?: string) => void>()
  const loads = new Map<number, (files?: string[]) => void>()
  let nextReading = 1
  let lastReading: ProcessTimes | undefined

  const close = (): Promise<void> => {
    if (state === "starting" || state === "running") {
      state = "closing"
      link.send({ type: "close" })
      killTimer = setTimeout(() => link.kill(), closeTimeout)
    }

    return ended
  }

  const usage = (): Promise<BuilderUsage | undefined> => {
    if (state === "ended") {
      return Promise.resolve(undefined)
    }

    const id = nextReading++

    return new Promise((resolve) => {
      const answer = (reading?: ProcessTimes) => {
        readings.delete(id)
        clearTimeout(timer)

        if (!reading) {
          return resolve(undefined)
        }

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

  const restyledGuestUrl = (stamp: number): Promise<string | undefined> => {
    if (state !== "running") {
      return Promise.resolve(undefined)
    }

    const id = nextReading++

    return new Promise((resolve) => {
      addresses.set(id, (guestUrl) => {
        addresses.delete(id)
        resolve(guestUrl)
      })
      link.send({ type: "restyledGuestUrl", id, stamp })
    })
  }

  const loadedFiles = (files: string[]): Promise<string[] | undefined> => {
    if (state !== "running") {
      return Promise.resolve(undefined)
    }

    const id = nextReading++

    return new Promise((resolve) => {
      const answer = (loaded?: string[]) => {
        loads.delete(id)
        clearTimeout(timer)
        resolve(loaded)
      }

      const timer = setTimeout(() => answer(), loadedFilesTimeout)
      loads.set(id, answer)
      link.send({ type: "loadedFiles", id, files })
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
      } else if (reply.type === "restyledGuestUrl") {
        addresses.get(reply.id)?.(reply.guestUrl)
      } else if (reply.type === "loadedFiles") {
        loads.get(reply.id)?.(reply.files)
      } else if (reply.type === "codeChanged") {
        if (state === "running") {
          const { type: _, ...change } = reply
          onCodeChange?.(change)
        }
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
          restyledGuestUrl,
          loadedFiles,
          close
        })
      } else {
        rejectStart(new Error(reply.error))
        void close()
      }
    },
    exited(reason) {
      if (state === "ended") {
        return
      }

      const was = state
      state = "ended"
      clearTimeout(killTimer)

      for (const answer of [...readings.values(), ...addresses.values(), ...loads.values()]) {
        answer()
      }

      markEnded()

      if (was === "starting") {
        rejectStart(new Error(reason))
      } else if (was === "running") {
        onCrash?.(reason)
      }
    }
  }
}
