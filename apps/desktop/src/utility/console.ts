import type { ConsoleEntry } from "../shared/protocol.ts"
import { mainProcess } from "./main-process.ts"

/**
 * What a project's own code wrote to the console, on the canvas and in offscreen renders, oldest first. The main
 * process keeps it, because it sees every window's console. Clearing forgets it once it's read.
 */
export function readConsole(origin: string, clear: boolean): Promise<ConsoleEntry[]> {
  return mainProcess.request("console", { origin, clear })
}
