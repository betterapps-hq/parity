import type { Worker } from "node:worker_threads"
import { type Channel, createChannel, type Method, type MethodMap, nodePort } from "@parity-app/channel"
import type { Lifecycle } from "@parity-app/processes"
import { workerChild } from "./children.ts"

/** Asks a worker thread for results, starting it when asked and stopping it once it has sat idle. */
export interface WorkerClient<Remote extends MethodMap<Remote>> {
  /** Asks the worker, starting one when none is running, and settles with its answer. */
  request<M extends keyof Remote & string>(method: M, params: Remote[M]["params"]): Promise<Remote[M]["result"]>
  /** Whether a worker is running, so whether the next request goes to one that has what earlier requests left in it. */
  readonly running: boolean
  /** Stops the worker now, failing the requests it hasn't answered with `reason`. */
  stop(reason: Error): void
}

export interface WorkerClientOptions {
  /** Starts a worker that answers requests over its `parentPort` through `@parity-app/channel`. */
  start: () => Worker
  /** How long the worker is kept with nothing asked of it before it stops, returning all its memory. */
  idleMs: number
  /** What a worker's unanswered requests fail with when it fails, such as by running out of memory. */
  failed?: (error: Error) => Error
  /** Told when the worker stops for being idle. */
  stopped?: () => void
}

interface Running<Remote extends MethodMap<Remote>> {
  life: Lifecycle
  channel: Channel<Record<never, Method>, Remote>
  /** Calls off the idle stop. */
  busy?: () => void
}

/**
 * A client for a worker thread that keeps memory between requests, such as the type checker's programs. The worker
 * stops `idleMs` after its last answer, never while a request waits, and the next request starts a new one. A request
 * made while the old one is stopping goes to the new one. The worker is started, timed and stopped through the
 * service's one child lifecycle (`children.ts`).
 */
export function workerClient<Remote extends MethodMap<Remote>>({
  start,
  idleMs,
  failed = (error) => error,
  stopped
}: WorkerClientOptions): WorkerClient<Remote> {
  let current: Running<Remote> | undefined

  const launch = (): Running<Remote> => {
    const worker = start()
    const running: Running<Remote> = { life: workerChild(worker), channel: createChannel() }
    running.channel.connect(nodePort(worker))
    // Once it has failed or exited, the next request starts another, and what it hadn't answered fails with why.
    void running.life.exited.then(({ code, error }) =>
      end(running, error ? failed(error) : new Error(`The worker stopped with exit code ${String(code)}`))
    )
    worker.unref()

    return running
  }

  /** Forgets the worker, so the next request starts another, failing what it hasn't answered with `reason`. */
  const end = (running: Running<Remote>, reason?: Error) => {
    running.busy?.()

    if (reason) {
      running.channel.close(reason)
    }

    if (current === running) {
      current = undefined
    }
  }

  // Each request calls the idle stop off, so it can only pass with nothing waiting.
  const idleLater = (running: Running<Remote>) => {
    running.busy?.()
    running.busy = running.life.deadline(idleMs, () => {
      current = undefined
      stopped?.()
    })
  }

  return {
    request(method, params) {
      const running = (current ??= launch())
      running.busy?.()

      const answered = () => {
        if (running.channel.waiting === 0 && current === running) {
          idleLater(running)
        }
      }

      const asked = running.channel.request(method, params)
      asked.then(answered, answered)

      return asked
    },
    get running() {
      return current !== undefined
    },
    stop(reason) {
      const running = current

      if (!running) {
        return
      }

      end(running, reason)
      running.life.stop()
    }
  }
}
