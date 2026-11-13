import { createChannel, type Port } from "@parity-app/channel"
import type {
  BuilderAdapter,
  BuilderRenderer,
  BuilderSession,
  BuilderStartOptions,
  CodeChange,
  ComponentSource,
  ProjectConfig
} from "@parity-app/core"
import { type ChildExit, endedByItself, type Lifecycle } from "./lifecycle.ts"

/*
 * Each open project's builder runs in a process of its own, which ends when the project closes, so the system takes
 * back everything its build tool held. A closed Vite server can't be freed in the process that ran it: Rolldown's
 * native handles keep its module graph. The project service and the builder's process ask each other for things over
 * `@parity-app/channel`, which matches each answer to its request, in the methods below, as data: the builder goes by
 * id, which the builder's process looks up, and the renderer as what a builder needs of it. The service starts, times
 * and ends the process through the one child lifecycle (PAR-987).
 */

/** A builder's start options as they cross to its process, with the builder by id. */
export type BuilderProcessOptions = BuilderStartOptions & { builder: string }

/** What the project service asks of a builder's process. */
export interface BuilderProcessMethods {
  /** Starts the builder, and answers once it serves the guest. */
  start: { params: BuilderProcessOptions; result: { guestUrl: string; toolVersion: string } }
  /** The components the guest imports, which change as the type checker and edited files find them. */
  components: { params: Record<string, ComponentSource>; result: undefined }
  /** Its CPU time and memory, for the performance stats. */
  usage: { params: undefined; result: ProcessTimes }
  /** Where it serves the guest with the stylesheets of the change stamped `stamp` (PAR-821), or none. */
  restyledGuestUrl: { params: { stamp: number }; result: string | undefined }
  /** The project files the modules of `files` load, as the build tool resolved them (PAR-994), or none. */
  loadedFiles: { params: { files: string[] }; result: string[] | undefined }
  /** Closes the builder, then ends the process. */
  close: { params: undefined; result: undefined }
}

/** What a builder's process tells the project service. */
export interface BuilderServiceMethods {
  /** Project files whose code changed on disk, as the builder found them (PAR-165). */
  codeChanged: { params: CodeChange; result: undefined }
}

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
  /** Its end of the IPC channel to the project service. */
  port: Port
  usage(): ProcessTimes
  /** Ends the process, once the builder has closed. */
  exit(): void
}

/**
 * The builder's process's side: starts the builder it's asked for, keeps the guest's components up to date, and
 * closes it before ending the process.
 */
export function serveBuilderProcess(side: BuilderProcessSide, builders: BuilderAdapter[]): void {
  let config: ProjectConfig | undefined
  let session: Promise<BuilderSession | undefined> = Promise.resolve(undefined)
  let closing = false
  const channel = createChannel<BuilderProcessMethods, BuilderServiceMethods>()

  channel.serve({
    async start(options) {
      if (config) {
        throw new Error("The builder has started already")
      }

      const { builder: id, ...rest } = options
      config = rest.config

      const starting = (async () => {
        const builder = builders.find((adapter) => adapter.id === id)

        if (!builder) {
          throw new Error(`No builder is called ${id}`)
        }

        return builder.start(rest)
      })()

      session = starting.catch(() => undefined)
      const started = await starting
      started.codeChanges?.((change) => void channel.request("codeChanged", change).catch(() => undefined))

      return { guestUrl: started.guestUrl, toolVersion: started.toolVersion }
    },
    components(components) {
      // In place, since the builder serves the guest from this list.
      const served = config?.components

      if (!served) {
        return
      }

      for (const id of Object.keys(served)) {
        if (!(id in components)) {
          delete served[id]
        }
      }

      Object.assign(served, components)
    },
    usage: () => side.usage(),
    restyledGuestUrl: ({ stamp }) =>
      session.then((started) => started?.restyledGuestUrl?.(stamp)).catch(() => undefined),
    loadedFiles: ({ files }) => session.then((started) => started?.loadedFiles?.(files)).catch(() => undefined),
    close() {
      if (closing) {
        return
      }

      closing = true
      void session
        .then((started) => started?.close())
        .catch(() => undefined)
        .then(() => side.exit())
    }
  })

  channel.connect(side.port)
}

/** The project service's link to a builder's process: the channel's port, and the process's lifecycle. */
export interface BuilderProcessLink {
  port: Port
  life: Lifecycle
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

/** The project service's side of a builder's process. */
export interface BuilderProcessClient {
  /** The session once the builder answers, or why it couldn't start, as when its process ended first. */
  session: Promise<BuilderProcessSession>
  /** The process's CPU and memory, while it runs, starting or not. */
  usage(): Promise<BuilderUsage | undefined>
}

export interface BuilderProcessClientOptions {
  /** How the builder is named in why its process ended: `Vite stopped by itself, with exit code 1`. */
  name?: string
  /** Called when the process ends by itself after its builder started, with why and how it ended. */
  onCrash?: (reason: string, exit: ChildExit) => void
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
  { port, life }: BuilderProcessLink,
  options: BuilderProcessOptions,
  {
    name = "The builder",
    onCrash,
    onCodeChange,
    closeTimeout = 5000,
    usageTimeout = 500,
    loadedFilesTimeout = 2000,
    cores = 1
  }: BuilderProcessClientOptions = {}
): BuilderProcessClient {
  let state: "starting" | "running" | "closing" | "ended" = "starting"
  let lastReading: ProcessTimes | undefined

  const channel = createChannel<BuilderServiceMethods, BuilderProcessMethods>({
    handlers: {
      codeChanged(change) {
        if (state === "running") {
          onCodeChange?.(change)
        }
      }
    }
  })

  const ended = life.exited.then(() => undefined)

  const close = (): Promise<void> => {
    if (state === "starting" || state === "running") {
      state = "closing"
      void channel.request("close", undefined).catch(() => undefined)
      life.deadline(closeTimeout)
    }

    return ended
  }

  const usage = async (): Promise<BuilderUsage | undefined> => {
    if (state === "ended") {
      return undefined
    }

    const reading = await within(channel.request("usage", undefined), usageTimeout)

    if (!reading) {
      return undefined
    }

    const previous = lastReading && lastReading.uptime < reading.uptime ? lastReading : undefined
    lastReading = reading
    const cpu = reading.cpu - (previous?.cpu ?? 0)
    const elapsed = reading.uptime - (previous?.uptime ?? 0)

    return { cpu: elapsed > 0 ? Math.max(0, (cpu / 1000 / elapsed / cores) * 100) : 0, memory: reading.memory }
  }

  const restyledGuestUrl = (stamp: number): Promise<string | undefined> =>
    state === "running"
      ? channel.request("restyledGuestUrl", { stamp }).catch(() => undefined)
      : Promise.resolve(undefined)

  const loadedFiles = (files: string[]): Promise<string[] | undefined> =>
    state === "running"
      ? within(channel.request("loadedFiles", { files }), loadedFilesTimeout)
      : Promise.resolve(undefined)

  channel.connect(port)

  const started = channel.request("start", options).then(({ guestUrl, toolVersion }): BuilderProcessSession => {
    // A start that answers after it was told to close is closing anyway.
    if (state !== "starting") {
      throw new Error(`${name} closed before it started`)
    }

    state = "running"

    return {
      guestUrl,
      toolVersion,
      setComponents: (components) => {
        if (state === "running") {
          void channel.request("components", components).catch(() => undefined)
        }
      },
      usage,
      restyledGuestUrl,
      loadedFiles,
      close
    }
  })

  // A builder that couldn't start has its process ended.
  started.catch(() => void close())

  // The process ending first fails the start with why, which its channel closing would only say vaguely.
  const exited = life.exited.then((exit) => {
    const was = state
    state = "ended"
    const reason = endedByItself(name, exit)
    channel.close(new Error(reason))

    if (was === "running" && !exit.stopped) {
      onCrash?.(reason, exit)
    }

    throw new Error(reason)
  })

  exited.catch(() => undefined)

  return { session: Promise.race([started, exited]), usage }
}

/** What `asked` answers, or nothing when it fails or takes longer than `ms`. */
function within<T>(asked: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms)
    asked.then(
      (answer) => {
        clearTimeout(timer)
        resolve(answer)
      },
      () => {
        clearTimeout(timer)
        resolve(undefined)
      }
    )
  })
}
