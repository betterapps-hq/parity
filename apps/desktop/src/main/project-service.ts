import { type Channel, createChannel, type Handlers, type NodeEmitter, nodePort } from "@parity-app/channel"
import { type ServiceRestarts, serviceRestarts } from "@parity-app/core"
import { outputTail, type serviceCrash, type serviceExit } from "@parity-app/telemetry"
import { codedErrors } from "../shared/coded-errors.ts"
import type { MainMethods, ServiceProcessMethods } from "../shared/service.ts"
import { currentTraceHeaders, handleInSpan } from "../shared/tracing.ts"

/** The channel main and a project service talk over. */
export type ServiceChannel = Channel<MainMethods, ServiceProcessMethods>

/** A service that's running, and the channel to it. */
interface Running<Process> {
  service: Process
  channel: ServiceChannel
}

/** What the lifecycle needs of a forked service: Electron's `UtilityProcess` in the app, a fake in tests. */
export interface ServiceProcess {
  /** What its messages arrive on and go out through, which its channel connects to. */
  readonly messages: NodeEmitter
  /** Calls `listener` with what it prints, as it prints it. */
  onOutput(listener: (text: string) => void): void
  onSpawn(listener: () => void): void
  onExit(listener: (exitCode: number) => void): void
  /** Ends it and every process it started, as a project's Storybook, which would otherwise outlive it (PAR-980). */
  kill(): void
}

export interface ProjectServiceOptions<Process extends ServiceProcess, Window> {
  /** Forks a fresh service. */
  fork: () => Process
  /** Answers what the service asks main. */
  handlers: Handlers<MainMethods>
  /** The app's windows, as against the offscreen renderers. */
  windows: () => Window[]
  /** Whether `window`'s page is loading, so it connects once it has loaded. */
  loading: (window: Window) => boolean
  /**
   * Whether `window` shows Parity's own page, the only page given a channel to the service. Project code runs in that
   * page, so one it navigated to gets none (PAR-975).
   */
  parityPage: (window: Window) => boolean
  /** Gives `window`'s page its own channel to `service`. */
  join: (service: Process, window: Window) => void
  /** Whether the app is quitting, so a service that stops isn't started again. */
  quitting: () => boolean
  /** The service's script, when it doesn't exist, which is why a service that printed nothing exited (PAR-489). */
  missingEntry: () => string | undefined
  telemetry: {
    started: (restarted: boolean) => void
    /** The service's process is running. */
    spawned: () => void
    exited: (exit: Parameters<typeof serviceExit>[0]) => void
    crashed: (exit: Parameters<typeof serviceCrash>[0]) => void
  }
  /** Whether, and when, a crashed service is started again. */
  restarts?: ServiceRestarts
  /** The time in milliseconds, for how long a service ran. */
  now?: () => number
}

/** The project service: builders, file access, agents and other heavy work, run apart from the app and its windows. */
export interface ProjectService<Window> {
  /**
   * Starts a fresh service, replacing the running one, and reconnects every window to it, as at launch, after a crash or
   * when the service's code changes. Pages reopen their projects and keep their designs and unsaved changes, so nothing
   * closes. `loaded` is a window whose page has just loaded, which connects even though it was loading.
   */
  start(loaded?: Window): void
  /**
   * Gives a page its own channel to the service, when it's Parity's own page. With none running, as at launch or after a
   * crash, it starts one the way a restart does, so every other open window gets a channel to it too (PAR-788).
   */
  connect(window: Window): void
  /** The running service's channel, while one runs. */
  channel(): ServiceChannel | undefined
  /** Ends the running service, as the app quits. */
  stop(): void
}

/**
 * Starts the project service, connects windows to it, and starts it again when it crashes, backing off when it keeps
 * crashing (PAR-788). A service replaced by a fresh one is retired, so its exit is expected.
 */
export function createProjectService<Process extends ServiceProcess, Window>({
  fork,
  handlers,
  windows,
  loading,
  parityPage,
  join,
  quitting,
  missingEntry,
  telemetry,
  restarts = serviceRestarts(),
  now = () => performance.now()
}: ProjectServiceOptions<Process, Window>): ProjectService<Window> {
  let running: Running<Process> | undefined
  /** Services replaced by a fresh one; their exit is expected. */
  const retired = new WeakSet<Process>()
  /**
   * The service main ended as the app quits. Its exit is expected too, whatever its code: Windows ends it with code 1,
   * since main ends its whole process tree (PAR-980).
   */
  let stopped: Process | undefined
  /** How many services have started, so a second is reported as a restart. */
  let starts = 0
  /** A crashed service's restart waiting out its back-off, which any service that starts first cancels. */
  let pendingRestart: ReturnType<typeof setTimeout> | undefined

  const launch = (): Running<Process> => {
    telemetry.started(starts++ > 0)
    clearTimeout(pendingRestart)
    pendingRestart = undefined
    const forked = now()
    const service = fork()

    const channel = createChannel<MainMethods, ServiceProcessMethods>({
      errors: codedErrors,
      handlers,
      disconnected: () => new Error("The project service stopped"),
      trace: currentTraceHeaders,
      around: handleInSpan
    })

    const output = outputTail()
    service.onOutput((text) => output.add(text))
    channel.connect(nodePort(service.messages, { closedBy: { exit: () => undefined } }))
    service.onSpawn(() => telemetry.spawned())
    service.onExit((exitCode) => {
      channel.close(new Error("The project service stopped"))

      if (running?.service === service) {
        running = undefined
      }

      const ranMs = now() - forked
      const stopping = quitting()
      const restartInMs = restarts.exited({ exitCode, ranMs, expected: retired.has(service) || stopping })
      telemetry.exited({
        exitCode,
        ranMs,
        replaced: retired.has(service) || restartInMs !== undefined,
        quitting: stopping
      })

      if (exitCode === 0 || retired.has(service) || stopped === service) {
        return
      }

      // A utility process whose script is missing exits with code 1 and prints nothing, even with Electron's logging on,
      // so the path it was given is named (PAR-489).
      const missing = missingEntry()
      console.error(`Project service exited with code ${exitCode}${missing ? `, since ${missing} doesn't exist` : ""}`)
      telemetry.crashed({ exitCode, output: output.text(), expected: stopping, missing })

      // A crashed service is started again through the same path a code change takes, so open windows reconnect
      // without reloading. A service that starts first, such as one a window's load starts, cancels it (PAR-788).
      if (restartInMs !== undefined) {
        pendingRestart = setTimeout(() => {
          pendingRestart = undefined

          if (!quitting()) {
            start()
          }
        }, restartInMs)
      }
    })

    return { service, channel }
  }

  const start = (loaded?: Window) => {
    const previous = running?.service

    if (previous) {
      retired.add(previous)
    }

    running = launch()
    previous?.kill()

    for (const window of windows()) {
      if (parityPage(window) && (window === loaded || !loading(window))) {
        connect(window)
      }
    }
  }

  const connect = (window: Window) => {
    if (!parityPage(window)) {
      return
    }

    if (!running) {
      start(window)

      return
    }

    join(running.service, window)
  }

  return {
    start,
    connect,
    channel: () => running?.channel,
    stop: () => {
      stopped = running?.service
      stopped?.kill()
    }
  }
}
