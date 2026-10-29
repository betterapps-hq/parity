import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { createInterface } from "node:readline"

/*
 * Each process's private working set on Windows: the memory only it uses, which Task Manager shows as its memory.
 * Electron reports the working set, which also counts the pages the app's processes share, once for each, so adding
 * those up reads well over Task Manager. Electron has no call for the private part, so a PowerShell asks Windows for
 * it (GetProcessMemoryInfo, a fraction of a millisecond a process; reading the performance counters takes over a
 * second). It starts when the stats first ask, answers each line of process ids with their sizes, and stops once
 * nothing has asked for a while. Its input closes with the app, which ends it too.
 */

const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PrivateMemory {
  [StructLayout(LayoutKind.Sequential)]
  struct Counters {
    public uint cb; public uint PageFaultCount; public UIntPtr PeakWorkingSetSize; public UIntPtr WorkingSetSize;
    public UIntPtr QuotaPeakPagedPoolUsage; public UIntPtr QuotaPagedPoolUsage; public UIntPtr QuotaPeakNonPagedPoolUsage;
    public UIntPtr QuotaNonPagedPoolUsage; public UIntPtr PagefileUsage; public UIntPtr PeakPagefileUsage;
    public UIntPtr PrivateUsage; public UIntPtr PrivateWorkingSetSize; public ulong SharedCommitUsage;
  }
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("psapi.dll")] static extern bool GetProcessMemoryInfo(IntPtr process, ref Counters counters, uint size);
  public static long Of(int pid) {
    IntPtr handle = OpenProcess(0x1000, false, pid);
    if (handle == IntPtr.Zero) return -1;
    try {
      var counters = new Counters();
      counters.cb = (uint)Marshal.SizeOf(typeof(Counters));
      return GetProcessMemoryInfo(handle, ref counters, counters.cb) ? (long)counters.PrivateWorkingSetSize.ToUInt64() : -1;
    } finally { CloseHandle(handle); }
  }
}
'@
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $sizes = foreach ($id in $line.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) { "$id=$([PrivateMemory]::Of([int]$id))" }
  [Console]::Out.WriteLine(($sizes -join ' '))
  [Console]::Out.Flush()
}
`

/** How long an answer is waited for: the first takes a second or two while PowerShell starts. */
const answerMs = 3000
/** How long after the last question the PowerShell is stopped. */
const idleMs = 15_000

interface Reader {
  child: ChildProcessWithoutNullStreams
  /** Questions in the order they were asked, each answered by the next line. */
  waiting: ((sizes: Map<number, number>) => void)[]
}

let reader: Reader | undefined
/** PowerShell couldn't start, so the working set stands in until the app restarts. */
let unavailable = false
let lastAsked = 0
/** The latest answer, for a question that isn't answered in time. */
let latest = new Map<number, number>()

/** The private working set of each process asked about, in bytes, or nothing where it isn't known. */
export async function privateWorkingSets(pids: number[]): Promise<ReadonlyMap<number, number>> {
  if (process.platform !== "win32" || unavailable || pids.length === 0) return new Map()
  lastAsked = Date.now()
  const current = (reader ??= start())
  return new Promise((resolve) => {
    let answered = false
    const answer = (sizes: Map<number, number>) => {
      if (answered) return
      answered = true
      clearTimeout(timer)
      resolve(sizes)
    }
    const timer = setTimeout(() => answer(latest), answerMs)
    current.waiting.push(answer)
    current.child.stdin.write(`${pids.join(" ")}\n`)
  })
}

function start(): Reader {
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    { windowsHide: true }
  )
  const started: Reader = { child, waiting: [] }
  let answered = false
  child.stderr.resume()
  createInterface({ input: child.stdout }).on("line", (line) => {
    answered = true
    const sizes = new Map<number, number>()
    for (const pair of line.split(" ")) {
      const [pid, bytes] = pair.split("=").map(Number)
      if (pid && bytes && bytes > 0) sizes.set(pid, bytes)
    }
    latest = sizes
    started.waiting.shift()?.(sizes)
  })
  child.stdin.on("error", () => undefined)
  child.on("error", () => {
    unavailable = true
  })
  const idle = setInterval(() => {
    if (Date.now() - lastAsked > idleMs) child.kill()
  }, 5000).unref()
  child.on("exit", () => {
    clearInterval(idle)
    // One that never answered would fail the same way each time it started.
    if (!answered) unavailable = true
    for (const answer of started.waiting.splice(0)) answer(latest)
    if (reader === started) reader = undefined
  })
  return started
}
