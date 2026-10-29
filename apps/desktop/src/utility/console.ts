import type { ConsoleEntry } from "../shared/protocol.ts"
import type { MainMessage, ServiceMessage } from "../shared/service.ts"

let nextId = 1
const pending = new Map<number, (entries: ConsoleEntry[]) => void>()

/**
 * What a project's own code wrote to the console, on the canvas and in offscreen renders, oldest first. The main
 * process keeps it, because it sees every window's console. Clearing forgets it once it's read.
 */
export function readConsole(origin: string, clear: boolean): Promise<ConsoleEntry[]> {
  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    process.parentPort.postMessage({ type: "console", id, origin, clear } satisfies ServiceMessage)
  })
}

export function handleConsoleResult(result: Extract<MainMessage, { type: "console-result" }>): void {
  pending.get(result.id)?.(result.entries)
  pending.delete(result.id)
}
