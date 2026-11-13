import { type ChildProcess, fork, spawn } from "node:child_process"
import type { Worker } from "node:worker_threads"
import { nodePort, type Port } from "@parity-app/channel"
import { type ChildEnd, type ChildHandle, type Lifecycle, lifecycle } from "@parity-app/processes"
import { killTree } from "../shared/process-tree.ts"

/*
 * The adapters that start the service's children and hand them to the one lifecycle in `@parity-app/processes`
 * (PAR-987): a spawned command, as Storybook or a package manager, a forked script with an IPC channel, as a builder,
 * and a worker thread, as the type checker. Every child started here ends when the service ends by itself. One that
 * main kills runs no exit handler, so main ends the service's whole process tree (PAR-980), and each builder ends when
 * its link to the service closes.
 */

const running = new Set<Lifecycle>()

/** Watches a child through the lifecycle until it ends, and ends it with the service. */
function watch(child: ChildHandle): Lifecycle {
  const life = lifecycle(child)
  running.add(life)
  void life.exited.then(() => running.delete(life))

  return life
}

process.on("exit", () => {
  for (const life of running) {
    life.stop()
  }
})

export interface ChildOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Starts it through a shell, as a package manager's `.cmd` script needs on Windows. */
  shell?: boolean
  /** Copies what it prints to the service's own output too. */
  echo?: boolean
}

/** A command, started with its output read and its input closed. */
export function spawnChild(command: string, args: string[], { echo, ...options }: ChildOptions = {}): Lifecycle {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })

  return watch(processHandle(child, echo))
}

/** A forked script's lifecycle, and its end of the IPC channel as a port for `@parity-app/channel`. */
export interface ForkedChild {
  life: Lifecycle
  port: Port
}

/** A script run by Parity's own Node as plain Node, with an IPC channel. */
export function forkChild(script: string, { echo, ...options }: ChildOptions = {}): ForkedChild {
  const child = fork(script, [], {
    ...options,
    // Electron runs as plain Node here.
    env: { ...(options.env ?? process.env), ELECTRON_RUN_AS_NODE: "1" },
    execArgv: [],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true
  })

  const port = nodePort(
    {
      on: (event, listener) => child.on(event, listener),
      postMessage: (message) => {
        if (child.connected) {
          child.send(message)
        }
      }
    },
    { closedBy: { disconnect: () => new Error("The process ended") } }
  )

  return { life: watch(processHandle(child, echo)), port }
}

/** A worker thread. What it prints goes to the service's own output, as a thread's does. */
export function workerChild(worker: Worker): Lifecycle {
  return watch({
    onOutput: () => undefined,
    onEnd(listener) {
      let failed: Error | undefined
      // A worker that fails, as by running out of memory, says why before it exits.
      worker.on("error", (error) => (failed = error))
      worker.on("exit", (code) => listener(failed ? { code, error: failed } : { code }))
    },
    kill: () => void worker.terminate()
  })
}

function processHandle(child: ChildProcess, echo = false): ChildHandle {
  return {
    pid: child.pid,
    onOutput(listener) {
      const read = (to: NodeJS.WriteStream) => (chunk: Buffer) => {
        if (echo) {
          to.write(chunk)
        }

        listener(chunk.toString())
      }

      child.stdout?.on("data", read(process.stdout))
      child.stderr?.on("data", read(process.stderr))
    },
    onEnd(listener) {
      const end = (code: number | null, signal: NodeJS.Signals | null) => {
        const ending: ChildEnd = {}

        if (code !== null) {
          ending.code = code
        }

        if (signal) {
          ending.signal = signal
        }

        listener(ending)
      }

      // `close` comes once its output has been read too. A process it started can keep that open, so `exit` stands in
      // a second later.
      child.on("close", end)
      child.on("exit", (code, signal) => setTimeout(() => end(code, signal), 1000).unref())
      // A command that can't run at all, as one that isn't installed, never starts, so it never exits. Also raised
      // for a message that couldn't be sent, which its exit explains.
      child.on("error", (error) => {
        if (child.pid === undefined) {
          listener({ error })
        }
      })
    },
    kill() {
      if (child.pid) {
        killTree(child.pid)
      }
    }
  }
}
