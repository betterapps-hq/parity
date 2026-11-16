import { execFile } from "node:child_process"
import { watch } from "node:fs"
import { promisify } from "node:util"
import type { ChangeDetector } from "@parity-app/change-detection"

const run = promisify(execFile)

/** How long git may take to answer before it's treated as unable to, for now. */
const gitTimeout = 10_000

/** The most output `git status` may give, enough for a repository with tens of thousands of changed files. */
const statusBuffer = 64 * 1024 * 1024

/** How long the git folder stays quiet before a move is told, so one commit's several writes tell once. */
const settleMs = 300

/** Runs git in a folder, as the project's own git, without a window on Windows. */
const git = (root: string, args: string[], maxBuffer = 1024 * 1024) =>
  run("git", args, { cwd: root, timeout: gitTimeout, windowsHide: true, maxBuffer })

/**
 * Changes counted from the git repository's last commit (PAR-1074), for a project inside one. A file changed when git
 * says it differs from the commit: changed or deleted, staged or not, or not tracked and not ignored. Git's own
 * comparison is used, rather than the hashes a trace keeps, so line endings git converts on checkout don't count as
 * changes. The baseline moves with `HEAD` and the index, as a commit, a checkout or staging moves them.
 */
export const gitDetector: ChangeDetector = {
  id: "git",
  name: "Git",

  async detect(root) {
    return git(root, ["rev-parse", "--is-inside-work-tree"]).then(
      ({ stdout }) => stdout.trim() === "true",
      () => false
    )
  },

  async changedFiles(root) {
    try {
      const { stdout: prefix } = await git(root, ["rev-parse", "--show-prefix"])

      const { stdout } = await git(
        root,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"],
        statusBuffer
      )

      // Each entry is two status letters, a space and the path from the repository's root.
      const changed = stdout
        .split("\0")
        .filter((entry) => entry.length > 3)
        .map((entry) => fromProject(prefix.trim(), entry.slice(3)))

      return new Set(changed)
    } catch {
      return undefined
    }
  },

  async watch(root, moved) {
    // A worktree's git folder is its own, with its own `HEAD` and index.
    const { stdout } = await git(root, ["rev-parse", "--absolute-git-dir"])
    let timer: ReturnType<typeof setTimeout> | undefined

    const watcher = watch(stdout.trim(), (_event, name) => {
      // Git writes each through a lock file it renames into place, and Windows names only the lock file's rename.
      if (!name || !/^(?:HEAD|index)(?:\.lock)?$/.test(name)) {
        return
      }

      clearTimeout(timer)
      timer = setTimeout(moved, settleMs)
    })

    // A git folder taken away, as a worktree removed, just stops telling.
    watcher.on("error", () => watcher.close())

    return () => {
      clearTimeout(timer)
      watcher.close()
    }
  }
}

/**
 * A path from the repository's root as a path from the project's, which is at `prefix` in it (`examples/app/`), so a
 * file outside the project, as a workspace's lockfile can be, starts with `../`.
 */
function fromProject(prefix: string, path: string): string {
  const folders = prefix.split("/").filter(Boolean)
  const parts = path.split("/")
  let shared = 0

  while (shared < folders.length && shared < parts.length - 1 && folders[shared] === parts[shared]) {
    shared++
  }

  return [...Array.from({ length: folders.length - shared }, () => ".."), ...parts.slice(shared)].join("/")
}
