import type { Worker } from "node:worker_threads"

/** Asks a worker thread for results, starting it when asked and stopping it once it has sat idle. */
export interface WorkerClient {
  /** Sends `message` with an id, starting a worker when none is running, and settles with the worker's reply. */
  request(message: Record<string, unknown>): Promise<unknown>
  /** Whether a worker is running, so whether the next request goes to one that has what earlier requests left in it. */
  readonly running: boolean
  /** Stops the worker now, failing the requests it hasn't answered with `reason`. */
  stop(reason: Error): void
}

export interface WorkerClientOptions {
  /** Starts a worker that answers each `{ id, ...message }` with `{ id, result }` or `{ id, error }`. */
  start(): Worker
  /** How long the worker is kept with nothing asked of it before it stops, returning all its memory. */
  idleMs: number
  /** What a worker's unanswered requests fail with when it fails, such as by running out of memory. */
  failed?(error: Error): Error
  /** Told when the worker stops for being idle. */
  stopped?(): void
}

interface Running {
  worker: Worker
  pending: Map<number, { resolve(value: unknown): void; reject(error: Error): void }>
  idle?: ReturnType<typeof setTimeout>
}

/**
 * A client for a worker thread that keeps memory between requests, such as the type checker's programs. The worker
 * stops `idleMs` after its last answer, never while a request waits, and the next request starts a new one. A request
 * made while the old one is stopping goes to the new one.
 */
export function workerClient({ start, idleMs, failed = (error) => error, stopped }: WorkerClientOptions): WorkerClient {
  let current: Running | undefined
  let nextId = 1

  const launch = (): Running => {
    const running: Running = { worker: start(), pending: new Map() }
    running.worker.on("message", (message: { id: number; result?: unknown; error?: string }) => {
      const request = running.pending.get(message.id)
      if (!request) return
      running.pending.delete(message.id)
      if (message.error === undefined) request.resolve(message.result)
      else request.reject(new Error(message.error))
      if (running.pending.size === 0 && current === running) idleLater(running)
    })
    running.worker.on("error", (error: Error) => end(running, failed(error)))
    running.worker.on("exit", (code: number) => end(running, new Error(`The worker stopped with exit code ${code}`)))
    running.worker.unref()
    return running
  }

  /** Fails what the worker hasn't answered, and forgets it, so the next request starts another. */
  const end = (running: Running, reason: Error) => {
    clearTimeout(running.idle)
    for (const request of running.pending.values()) request.reject(reason)
    running.pending.clear()
    if (current === running) current = undefined
  }

  const idleLater = (running: Running) => {
    clearTimeout(running.idle)
    running.idle = setTimeout(() => {
      if (current !== running || running.pending.size > 0) return
      current = undefined
      void running.worker.terminate()
      stopped?.()
    }, idleMs)
    running.idle.unref()
  }

  return {
    request(message) {
      const running = (current ??= launch())
      clearTimeout(running.idle)
      const id = nextId++
      return new Promise((resolve, reject) => {
        running.pending.set(id, { resolve, reject })
        running.worker.postMessage({ id, ...message })
      })
    },
    get running() {
      return current !== undefined
    },
    stop(reason) {
      const running = current
      if (!running) return
      end(running, reason)
      void running.worker.terminate()
    }
  }
}
