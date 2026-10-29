import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { totalmem } from "node:os"
import { Worker } from "node:worker_threads"
import type { ComponentInfo, ComponentSource } from "@parity/core"
import type { CheckedComponent } from "@parity/project"

const workerUrl = new URL("./props-worker.mjs", import.meta.url)

/** The checker's own version, from its code, so results an earlier one saved aren't used. */
export const checkerVersion = (() => {
  try {
    return createHash("sha256").update(readFileSync(workerUrl)).digest("hex")
  } catch {
    return "unbuilt"
  }
})()

let worker: Worker | undefined
let nextId = 1
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()

/** Infers every component's props in a worker thread, one project at a time. */
export async function inferComponents(
  root: string,
  components: Record<string, ComponentSource>,
  /** The app's files the type checker reads next, read now too, so both use one program. */
  files: string[] = []
): Promise<Record<string, ComponentInfo>> {
  const started = Date.now()
  const result = ((await request({ kind: "props", root, components, files })) ?? {}) as Record<string, ComponentInfo>
  console.log(`[service] props for ${Object.keys(result).length} components in ${Date.now() - started}ms`)
  return result
}

/** Asks the type checker which of the app's files' exports are components, in the same worker as props. */
export async function checkComponents(root: string, files: string[]): Promise<CheckedComponent[]> {
  const started = Date.now()
  const result = (await request({ kind: "check", root, files })) as CheckedComponent[]
  console.log(`[service] the type checker read ${files.length} files in ${Date.now() - started}ms`)
  return result
}

/**
 * Lets go of a closed project's checker, which can hold a couple of gigabytes. With no project open, the worker stops,
 * returning all of it.
 */
export function closeChecker(root: string, lastProject: boolean): void {
  if (!worker) return
  if (lastProject) {
    void worker.terminate()
    worker = undefined
    for (const request of pending.values()) request.reject(new Error("The project closed"))
    pending.clear()
    return
  }
  void request({ kind: "close", root }).catch(() => undefined)
}

function request(message: Record<string, unknown>): Promise<unknown> {
  worker ??= start()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ id, ...message })
  })
}

function start(): Worker {
  // Half the computer's memory at most, so a project too big to check stops the worker rather than the computer.
  const next = new Worker(workerUrl, {
    resourceLimits: { maxOldGenerationSizeMb: Math.round(totalmem() / 2 ** 20 / 2) }
  })
  next.on("message", (message: { id: number; result?: unknown; error?: string }) => {
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (message.error === undefined) request?.resolve(message.result)
    else request?.reject(new Error(message.error))
  })
  next.on("error", (error: Error & { code?: string }) => {
    const reason =
      error.code === "ERR_WORKER_OUT_OF_MEMORY"
        ? new Error("The type checker ran out of memory. Components are as the parse found them.", { cause: error })
        : error
    for (const request of pending.values()) request.reject(reason)
    pending.clear()
    if (worker === next) worker = undefined
  })
  next.unref()
  return next
}
