// Runs the editor's end-to-end tests (`pnpm test:app`) from the pre-push hook, when the commits a push sends change
// what the app runs. They open a copy of Parity and take about five minutes, so they run once a branch is pushed rather
// than after each change.
//
//   node scripts/app-tests.ts <remote>   reads the refs git gives the pre-push hook on stdin
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

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
 * hook: a local ref, its commit, a remote ref and its commit. A deleted branch sends nothing.
 */
function pushedFiles(remote: string, refs: string): string[] {
  const tips = refs
    .split("\n")
    .map((line) => line.split(" ")[1] ?? "")
    .filter((commit) => commit !== "" && !/^0+$/.test(commit))
  if (tips.length === 0) return []
  const listed = git("log", "--format=", "--name-only", ...tips, "--not", `--remotes=${remote}`)
  return [...new Set(listed.split("\n").filter(Boolean))]
}

function main(): void {
  const remote = process.argv[2]
  if (!remote) {
    console.error("Usage: node scripts/app-tests.ts <remote>")
    process.exit(1)
  }
  const changed = pushedFiles(remote, readFileSync(0, "utf8")).filter(runsInApp)
  if (changed.length === 0) return
  console.log(`Running the editor's end-to-end tests, since this push changes ${changed.length} of the app's files.`)
  // Through the shell, which finds pnpm's own script on Windows; a whole command, since arguments wouldn't be escaped.
  const run = spawnSync("pnpm test:app", { stdio: "inherit", shell: true })
  if (run.status === 0) return
  console.error("The editor's end-to-end tests failed, so nothing was pushed. Fix them, then push again.")
  process.exit(run.status ?? 1)
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main()
