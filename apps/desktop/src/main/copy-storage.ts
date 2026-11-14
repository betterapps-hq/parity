import { readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const prefix = "parity-copy-"

/** The folder a copy keeps Chromium's storage in while another copy has the user data folder's. */
export function copyStorageFolder(temp: string, pid: number): string {
  return join(temp, `${prefix}${pid}`)
}

/**
 * The folders of copies that have quit without removing theirs, as one that crashed: those whose process is gone.
 * Anything else in the folder is left alone.
 */
export function leftoverCopyFolders(temp: string, running: (pid: number) => boolean): string[] {
  let names: string[]

  try {
    names = readdirSync(temp)
  } catch {
    return []
  }

  return names.flatMap((name) => {
    const pid = name.startsWith(prefix) ? Number(name.slice(prefix.length)) : Number.NaN

    return Number.isInteger(pid) && pid > 0 && !running(pid) ? [join(temp, name)] : []
  })
}

/** Whether a process is still running. */
export function processRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    // Running but someone else's, which this process can't signal.
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}

/** Removes a folder and what's in it, if it's there. A folder still in use is left for the next copy to remove. */
export function removeFolder(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true })
  } catch {
    // Still open in a process that hasn't quit yet.
  }
}
