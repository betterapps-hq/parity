const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")

/**
 * Beachball versions the two packages that aren't private, the desktop app and the CLI, from change files. A commit that
 * changes either, or a private package they bundle, carries a change file: `pnpm changefile --type patch --message "…"`
 * writes it, and scripts/changes.ts works out which of the two it's for, since Beachball doesn't look inside private
 * packages. Nothing publishes through Beachball: the desktop app goes to GitHub Releases, and the CD pipeline publishes
 * to npm the packages whose package.json has a `publishConfig`, which the CLI gets with its npm name (PAR-13).
 */

/**
 * Changes count from GitHub's main once a clone has fetched it, and from the local main before that, so a remote that
 * hasn't been fetched yet doesn't leave the hooks comparing with a branch that isn't there.
 */
function hasOriginMain() {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const dependabot = "dependabot[bot]"

/**
 * Whether the change being checked is Dependabot's own. In CI it must be a pull request Dependabot opened from a
 * dependabot/ branch of this repository, checked on a push Dependabot made, so a person's branch named dependabot/…, a
 * fork's pull request and a person's commit pushed onto Dependabot's pull request all still need change files. GitHub
 * sets every value read here, and the event's file holds the pull request. Elsewhere the hooks only catch mistakes
 * before CI does, so the checked-out branch's name is enough.
 */
function isDependabots() {
  const { env } = process
  if (env.GITHUB_ACTIONS === "true") {
    if (env.GITHUB_EVENT_NAME !== "pull_request" || env.GITHUB_ACTOR !== dependabot) return false
    try {
      const { pull_request: pr } = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8"))
      return (
        pr.user.login === dependabot &&
        pr.head.repo.full_name === env.GITHUB_REPOSITORY &&
        pr.head.ref.startsWith("dependabot/")
      )
    } catch {
      return false
    }
  }
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" })
    return branch.startsWith("dependabot/")
  } catch {
    return false
  }
}

/** @type {import("beachball").BeachballConfig} */
module.exports = {
  // A name with a slash is used as written; without one, Beachball would add the remote.
  branch: hasOriginMain() ? "origin/main" : "refs/heads/main",
  // `pnpm changefile` runs Beachball locally, which shouldn't wait on the network. CI fetches when it checks out.
  fetch: false,
  publish: false,
  // Parity stays below 1.0 until the user says otherwise.
  disallowedChangeTypes: ["major"],
  changehint:
    'Run `pnpm changefile --type patch --message "what changed, for the changelog"` and stage the file it writes.',
  // Files that don't ship in the app or the CLI.
  ignorePatterns: [
    "**/*.test.ts",
    "**/*.stories.tsx",
    "**/.storybook/**",
    "**/*.md",
    "**/tsconfig*.json",
    "apps/desktop/scripts/**",
    "packages/cli/scripts/**",
    "apps/desktop/src/renderer/explorations/**",
    // Dependabot changes only manifests and the lockfile, and can't write a change file, so on its pull requests a
    // dependency's new version ships with the next release rather than making one. Anything else changed there, such
    // as code fixed for a new major, still needs a change file. scripts/changes.ts reads these patterns too.
    ...(isDependabots() ? ["**/package.json"] : [])
  ]
}
