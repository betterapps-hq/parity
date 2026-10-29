/*
 * Reading each system's answer about how much memory a process uses on its own (see private-memory.ts), as data in and
 * data out, so each can be tested without the system.
 */

/** The PowerShell reader's answer on Windows: `pid=bytes` pairs, with -1 for a process it couldn't read. */
export function windowsAnswer(line: string): Map<number, number> {
  const sizes = new Map<number, number>()
  for (const pair of line.trim().split(/\s+/)) {
    const [pid, bytes] = pair.split("=").map(Number)
    if (pid && bytes && bytes > 0) sizes.set(pid, bytes)
  }
  return sizes
}

/**
 * A process's anonymous resident memory on Linux, from `/proc/<pid>/status`: its heaps and stacks, without the
 * libraries and shared memory other processes map too. `status` is readable for every process, where `smaps` isn't
 * for Chromium's sandboxed ones.
 */
export function linuxAnonymous(status: string): number | undefined {
  const kilobytes = /^RssAnon:\s+(\d+)\s+kB$/m.exec(status)?.[1]
  return kilobytes === undefined ? undefined : Number(kilobytes) * 1024
}

const units: Record<string, number> = { B: 1, K: 2 ** 10, M: 2 ** 20, G: 2 ** 30, T: 2 ** 40 }

/**
 * Each process's memory footprint on macOS, which Activity Monitor's Memory column shows, from
 * `top -l 1 -stats pid,mem`: rows of a process id and a size such as `412M`, after a `PID MEM` heading. A size can end
 * in `+` or `-`, for which way it moved.
 */
export function macFootprints(top: string): Map<number, number> {
  const sizes = new Map<number, number>()
  let rows = false
  for (const line of top.split("\n")) {
    if (!rows) {
      rows = /^\s*PID\s+MEM\s*$/.test(line)
      continue
    }
    const row = /^\s*(\d+)\s+([\d.]+)([BKMGT])[+-]?\s*$/.exec(line)
    if (row) sizes.set(Number(row[1]), Math.round(Number(row[2]) * units[row[3]!]!))
  }
  return sizes
}
