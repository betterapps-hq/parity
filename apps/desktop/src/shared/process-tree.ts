import { spawnSync } from "node:child_process"

/** A running process and the one that started it, as `ps` lists them. */
export interface ProcessLink {
  pid: number
  ppid: number
}

/** Reads `ps -A -o pid= -o ppid=`: one process per line, its id and its parent's. */
export function parseProcessLinks(listing: string): ProcessLink[] {
  return listing.split("\n").flatMap((line) => {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number)

    return pid && ppid !== undefined && Number.isInteger(pid) && Number.isInteger(ppid) ? [{ pid, ppid }] : []
  })
}

/** `pid` and every process it started, and those started, parents before their children. */
export function processTree(pid: number, links: ProcessLink[]): number[] {
  const tree = [pid]

  for (let index = 0; index < tree.length; index++) {
    for (const link of links) {
      if (link.ppid === tree[index] && link.pid !== pid && !tree.includes(link.pid)) {
        tree.push(link.pid)
      }
    }
  }

  return tree
}

/**
 * Stops a process and every process it started, as a dev server's own workers, or the project service with the servers
 * it runs. Windows ends the tree with `taskkill /T /F`. macOS and Linux take the tree from `ps` first, then send each
 * process SIGTERM, parents first, so none is left behind as its parent ends.
 */
export function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true })

    return
  }

  const listing = spawnSync("ps", ["-A", "-o", "pid=", "-o", "ppid="], { encoding: "utf8" })
  const tree = listing.status === 0 ? processTree(pid, parseProcessLinks(listing.stdout)) : [pid]

  for (const member of tree) {
    try {
      process.kill(member, "SIGTERM")
    } catch {
      // Already gone.
    }
  }
}
