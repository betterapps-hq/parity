import { Worker } from "node:worker_threads"

/**
 * What the watching thread runs, as a script of its own: every `interval` milliseconds it asks whether `parent` is still
 * there, and once it isn't, ends the whole process at once. A process whose parent ended is given to another, so a
 * changed parent id counts as gone too, on macOS and Linux. `EPERM` means the process is there but not ours to signal.
 */
export const parentWatchSource = `
const { workerData } = require("node:worker_threads")
const { parent, interval } = workerData

setInterval(() => {
  let gone = process.ppid !== parent

  if (!gone) {
    try {
      process.kill(parent, 0)
    } catch (error) {
      gone = error.code === "ESRCH"
    }
  }

  if (gone) {
    process.kill(process.pid, "SIGKILL")
  }
}, interval)
`

/**
 * Ends this process as soon as the one that started it has gone, even while this one's main thread is busy (PAR-1189).
 * A builder's own way to notice, its IPC link closing, is an event its main thread handles: a 1 GB Vite server busy
 * compiling or watching files left it waiting for about five minutes after its service ran out of memory, still holding
 * the project for the fresh service's builder. A thread of its own asks every `interval` milliseconds instead, and ends
 * the process outright. The thread doesn't keep the process running. Stops watching when the function returned is
 * called.
 */
export function endWithParent(parent = process.ppid, interval = 250): () => void {
  const watcher = new Worker(parentWatchSource, {
    eval: true,
    // Its source is CommonJS: flags the process was started with, as `--input-type=module`, would read it as a module.
    execArgv: [],
    workerData: { parent, interval }
  })

  watcher.unref()

  return () => void watcher.terminate()
}
