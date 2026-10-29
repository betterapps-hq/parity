const { execFileSync } = require("node:child_process")

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
    "apps/desktop/src/renderer/explorations/**"
  ]
}
