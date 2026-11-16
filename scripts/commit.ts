import { execFileSync } from "node:child_process"

/**
 * The commit a build is made from, which names its Sentry release (PAR-625). Nothing outside a Git checkout, where the
 * release is named by version instead.
 */
export function currentCommit(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
  } catch {
    return undefined
  }
}
