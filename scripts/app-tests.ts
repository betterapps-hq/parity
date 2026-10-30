// Runs the editor's end-to-end tests (`pnpm test:app`) from the pre-push hook, when the commits a push sends change
// what the app runs. They open a copy of Parity and take about five minutes, so they run once a branch is pushed rather
// than after each change.
//
//   node scripts/app-tests.ts <remote>   reads the refs git gives the pre-push hook on stdin
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** One lock for the whole machine: every worktree's suite shares its ports, so two at once fail each other. */
const lockFile = join(tmpdir(), "parity-app-tests.lock")

/** Whether a file the push changes is part of what the end-to-end tests run: the app, its packages or the example. */
export function runsInApp(path: string): boolean {
  if (path.endsWith(".md") || path.endsWith(".test.ts")) return false
  if (["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "vite.config.ts", "tsconfig.json"].includes(path)) {
    return true
  }
  return ["apps/desktop/", "packages/", "examples/shadcn-vite/"].some((folder) => path.startsWith(folder))
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
}

/**
 * The files changed by the commits a push sends that the remote doesn't have, from the lines git writes to the pre-push
 * hook: a local ref, its commit, a remote ref and its commit. What the remote has is the commits it said its refs are
 * at, where they're here, and the tracking refs of that remote only, since another remote having a commit doesn't mean
 * this one does. A push to a URL has no tracking refs, so it counts on the commits the remote named. A deleted branch
 * sends nothing.
 */
function pushedFiles(refs: string, remote: string): string[] {
  const lines = refs.split("\n").map((line) => line.split(" "))
  const sent = (commit: string | undefined): commit is string => !!commit && !/^0+$/.test(commit)
  const tips = lines.map((line) => line[1]).filter(sent)
  if (tips.length === 0) return []
  const known = lines
    .map((line) => line[3])
    .filter(sent)
    .filter(isHere)
  const tracking = git("remote").split(/\r?\n/).includes(remote) ? [`--remotes=${remote}/*`] : []
  // NUL-separated, so a path git would quote, such as one with a non-ASCII character, comes through as it is.
  const listed = git("log", "-z", "--format=", "--name-only", ...tips, "--not", ...known, ...tracking)
  return [
    ...new Set(
      listed
        .split("\0")
        .map((path) => path.trim())
        .filter(Boolean)
    )
  ]
}

/** Whether a commit is in this repository, which one the remote has but nobody fetched isn't. */
function isHere(commit: string): boolean {
  return spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`]).status === 0
}

function main(): void {
  const remote = process.argv[2]
  if (!remote) {
    console.error("Usage: node scripts/app-tests.ts <remote>")
    process.exit(1)
  }
  const changed = pushedFiles(readFileSync(0, "utf8"), remote).filter(runsInApp)
  if (changed.length === 0) return
  console.log(`Running the editor's end-to-end tests, since this push changes ${changed.length} of the app's files.`)
  takeLock()
  // Through the shell, which finds pnpm's own script on Windows; a whole command, since arguments wouldn't be escaped.
  const run = spawnSync("pnpm test:app", { stdio: "inherit", shell: true })
  rmSync(lockFile, { force: true })
  if (run.status === 0) return
  console.error("The editor's end-to-end tests failed, so nothing was pushed. Fix them, then push again.")
  process.exit(run.status ?? 1)
}

/**
 * Waits while another worktree's hook runs the suite, then takes the lock. A lock whose process has gone, as when a
 * push was stopped, is taken over.
 */
function takeLock(): void {
  let waiting = false
  for (;;) {
    try {
      writeFileSync(lockFile, String(process.pid), { flag: "wx" })
      return
    } catch {
      const holder = Number(readLockHolder())
      if (!holder || !isRunning(holder)) {
        rmSync(lockFile, { force: true })
        continue
      }
      if (!waiting) console.log(`Waiting for another worktree's end-to-end run (process ${holder}) to finish.`)
      waiting = true
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000)
    }
  }
}

function readLockHolder(): string {
  try {
    return readFileSync(lockFile, "utf8")
  } catch {
    return ""
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means it's running as someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main()
