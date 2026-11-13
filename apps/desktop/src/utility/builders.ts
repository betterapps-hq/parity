import { type ChildProcess, fork } from "node:child_process"
import { availableParallelism } from "node:os"
import { fileURLToPath } from "node:url"
import type { CodeChange } from "@parity-app/core"
import {
  type BuilderProcessClient,
  type BuilderProcessOptions,
  type BuilderProcessReply,
  type BuilderProcessSession,
  connectBuilderProcess
} from "@parity-app/processes"
import { killTree } from "../shared/process-tree.ts"
import type { BuilderReading } from "../shared/service.ts"
import { inSpan } from "../shared/tracing.ts"
import { reportBuilderCrash } from "./telemetry.ts"

/*
 * Each open project's builder runs in a process of its own, so closing the project gives the system back everything
 * the build tool held. Vite can't let go of a closed server's module graph in the process that ran it. The process
 * ends when the project closes, when the service ends (it notices its link to the service close, even when the
 * service is killed outright), and when it doesn't close in time.
 */

const script = fileURLToPath(new URL("./builder-process.mjs", import.meta.url))

interface Running {
  child: ChildProcess
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
  const child = fork(script, [], {
    // Electron runs as plain Node here.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    execArgv: [],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true
  })

  let log = ""
  let exit: BuilderExit | undefined

  const forward = (to: NodeJS.WriteStream) => (chunk: Buffer) => {
    to.write(chunk)
    log = (log + chunk.toString()).slice(-4000)
  }

  child.stdout?.on("data", forward(process.stdout))
  child.stderr?.on("data", forward(process.stderr))

  const client = connectBuilderProcess(
    {
      send: (request) => {
        if (child.connected) {
          child.send(request)
        }
      },
      kill: () => {
        if (child.pid) {
          killTree(child.pid)
        }
      }
    },
    options,
    {
      // Only a builder that stopped by itself crashes: one the project's closing stopped doesn't.
      onCrash: (error) => {
        if (!stoppedFromOutside(exit)) {
          reportBuilderCrash(builder, error.split("\n")[0] ?? error, log)
        }

        onCrash(error, exit ?? { output: log })
      },
      onCodeChange,
      cores: availableParallelism()
    }
  )

  // A builder's start is a span in the trace that asked for it, until its session is up (PAR-629).
  void inSpan("builder.started", { builder }, () => client.session).catch(() => {
    // Its crash or exit is reported on its own.
  })
  const item: Running = { child, name: `${builder} for ${project}`, client }
  running.add(item)
  let ended = false

  const end = (why: string, code?: number | null, signal?: NodeJS.Signals | null) => {
    if (ended) {
      return
    }

    ended = true
    const ending: BuilderExit = { output: log }

    if (code !== null && code !== undefined) {
      ending.exitCode = code
    }

    if (signal) {
      ending.signal = signal
    }

    exit = ending
    running.delete(item)
    const tail = log.trim().slice(-1500)
    client.exited(tail ? `${why}:\n${tail}` : why)
  }

  const stopped = (code: number | null, signal: NodeJS.Signals | null) =>
    `${builder} stopped by itself, ${signal ? `with signal ${signal}` : `with exit code ${code}`}`

  child.on("message", (reply: BuilderProcessReply) => client.receive(reply))
  // `close` comes once its output has been read too; a process it started could keep that open, so `exit` stands in.
  child.on("close", (code, signal) => end(stopped(code, signal), code, signal))
  child.on("exit", (code, signal) => setTimeout(() => end(stopped(code, signal), code, signal), 1000).unref())
  child.on("error", (error) => {
    // Also raised for a message it couldn't be sent, which its exit explains.
    if (child.pid === undefined) {
      end(`${builder} couldn't start: ${error.message}`)
    }
  })

  return child.pid ? { pid: child.pid, session: client.session } : { session: client.session }
}

/** Each builder's CPU and memory, for the performance stats. One that doesn't answer in time is left out. */
export async function builderReadings(): Promise<BuilderReading[]> {
  const readings = await Promise.all(
    [...running].map(async ({ child, name, client }) => {
      const usage = await client.usage()

      return child.pid && usage ? { pid: child.pid, name, ...usage } : undefined
    })
  )

  return readings.filter((reading) => reading !== undefined)
}

// The service ending on its own; killed, it can't, and each builder ends when its link to the service closes.
process.on("exit", () => {
  for (const { child } of running) {
    child.kill()
  }
})
