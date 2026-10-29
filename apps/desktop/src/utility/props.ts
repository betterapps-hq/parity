import { Worker } from "node:worker_threads"
import type { ComponentInfo, ComponentSource } from "@parity/core"
import type { CheckedComponent } from "@parity/project"

let worker: Worker | undefined
let nextId = 1
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()

/** Infers every component's props in a worker thread, one project at a time. */
export async function inferComponents(
  root: string,
  components: Record<string, ComponentSource>
): Promise<Record<string, ComponentInfo>> {
  const started = Date.now()
  const result = ((await request({ kind: "props", root, components })) ?? {}) as Record<string, ComponentInfo>
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

function request(message: Record<string, unknown>): Promise<unknown> {
  worker ??= start()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ id, ...message })
  })
}

function start(): Worker {
  const next = new Worker(new URL("./props-worker.mjs", import.meta.url))
  next.on("message", (message: { id: number; result?: unknown; error?: string }) => {
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (message.error === undefined) request?.resolve(message.result)
    else request?.reject(new Error(message.error))
  })
  next.on("error", (error) => {
    for (const request of pending.values()) request.reject(error)
    pending.clear()
    worker = undefined
  })
  next.unref()
  return next
}
