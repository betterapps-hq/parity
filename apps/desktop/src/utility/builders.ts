import { availableParallelism } from "node:os"
import { fileURLToPath } from "node:url"
import type { CodeChange } from "@parity-app/core"
import {
  type BuilderProcessClient,
  type BuilderProcessOptions,
  type BuilderProcessSession,
  type ChildExit,
  connectBuilderProcess,
  type Lifecycle
} from "@parity-app/processes"
import type { BuilderReading } from "../shared/service.ts"
import { inSpan } from "../shared/tracing.ts"
import { forkChild } from "./children.ts"
import { reportBuilderCrash } from "./telemetry.ts"

/*
 * Each open project's builder runs in a process of its own, so closing the project gives the system back everything
 * the build tool held. Vite can't let go of a closed server's module graph in the process that ran it. The process
 * ends when the project closes, when the service ends (it notices its link to the service close, even when the
 * service is killed outright), and when it doesn't close in time. It's started and timed through the service's one
 * child lifecycle (`children.ts`), and talks to the service over `@parity-app/channel`.
 */

const script = fileURLToPath(new URL("./builder-process.mjs", import.meta.url))

interface Running {
  life: Lifecycle
  /** How the performance stats name it. */
  name: string
  client: BuilderProcessClient
}

const running = new Set<Running>()

/** A builder started in its own process: its id, and its session once the builder answers. */
export interface StartedBuilder {
  pid?: number
  session: Promise<BuilderProcessSession>
}

/** How a builder's process ended by itself: its exit code or signal, and the last of what it printed. */
export interface BuilderExit {
  exitCode?: number
  signal?: string
  output: string
}

/** The signals that stop a process from outside, as quitting the app or the system does, rather than a crash. */
const stopSignals = new Set(["SIGHUP", "SIGINT", "SIGTERM"])

/** What a process exits with when it handles one of those signals itself, as Vite does: 128 plus its number. */
const stopCodes = new Set([129, 130, 143])

/**
 * Whether a builder ended because something outside stopped it, by a signal or the code it exits with when it handles
 * one. The project still shows it stopped, but it isn't Parity's bug, so it isn't sent to Sentry (PAR-755).
 */
export function stoppedFromOutside(exit: BuilderExit | undefined): boolean {
  if (exit?.signal !== undefined && stopSignals.has(exit.signal)) {
    return true
  }

  return exit?.exitCode !== undefined && stopCodes.has(exit.exitCode)
}

/**
 * Starts a project's builder in a process of its own, run by Parity's own Node. What the process prints goes to the
 * service's output, and the end of it into the error when the process stops by itself.
 */
export function startBuilder(
  options: BuilderProcessOptions,
  {
    builder,
    project,
    onCrash,
    onCodeChange
  }: {
    builder: string
    project: string
    onCrash: (error: string, exit?: BuilderExit) => void
    onCodeChange?: (change: CodeChange) => void
  }
): StartedBuilder {
  const { life, port } = forkChild(script, { echo: true })

  const client = connectBuilderProcess({ port, life }, options, {
    name: builder,
    // Only a builder that stopped by itself crashes: one the project's closing stopped doesn't.
    onCrash: (error, ended) => {
      const exit = builderExit(ended)

      if (!stoppedFromOutside(exit)) {
        reportBuilderCrash(builder, error.split("\n")[0] ?? error, exit.output)
      }

      onCrash(error, exit)
    },
    onCodeChange,
    cores: availableParallelism()
  })

  // A builder's start is a span in the trace that asked for it, until its session is up (PAR-629).
  void inSpan("builder.started", { builder }, () => client.session).catch(() => {
    // Its crash or exit is reported on its own.
  })
  const item: Running = { life, name: `${builder} for ${project}`, client }
  running.add(item)
  void life.exited.then(() => running.delete(item))

  return life.pid ? { pid: life.pid, session: client.session } : { session: client.session }
}

/** How a builder's process ended, as the project's crash handling reads it. */
function builderExit({ code, signal, output }: ChildExit): BuilderExit {
  const exit: BuilderExit = { output }

  if (code !== undefined) {
    exit.exitCode = code
  }

  if (signal !== undefined) {
    exit.signal = signal
  }

  return exit
}

/** Each builder's CPU and memory, for the performance stats. One that doesn't answer in time is left out. */
export async function builderReadings(): Promise<BuilderReading[]> {
  const readings = await Promise.all(
    [...running].map(async ({ life, name, client }) => {
      const usage = await client.usage()

      return life.pid && usage ? { pid: life.pid, name, ...usage } : undefined
    })
  )

  return readings.filter((reading) => reading !== undefined)
}
