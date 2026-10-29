const { execFileSync } = require("node:child_process")

/**
 * Beachball versions the desktop app, the CLI and the workspace packages they bundle from change files. A commit that
 * changes one carries a change file: `pnpm changefile --type patch --message "…"` writes it for the staged packages, and a
 * change to a bundled package bumps the app and the CLI that depend on it. The packages aren't `private`, since
 * Beachball ignores private packages, and never publish through Beachball: the CD pipeline publishes to npm the ones
 * whose package.json has a `publishConfig`, which the CLI gets with its npm name (PAR-13).
 */

/** Changes count from GitHub's main once the repository has a remote, and from the local main before that. */
function hasOrigin() {
  try {
    execFileSync("git", ["remote", "get-url", "origin"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

/** @type {import("beachball").BeachballConfig} */
module.exports = {
  // A name with a slash is used as written; without one, Beachball would add the remote.
  branch: hasOrigin() ? "origin/main" : "refs/heads/main",
  // The pre-commit hook runs `beachball check`, which shouldn't wait on the network. CI fetches when it checks out.
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
  ],
  // Each shipped product's changelog also lists the changes to the packages it bundles.
  changelog: {
    groups: [
      {
        mainPackageName: "@parity/desktop",
        changelogPath: "apps/desktop",
        include: ["apps/desktop", "packages/*"],
        exclude: ["!packages/cli", "!packages/fixtures"]
      },
      {
        mainPackageName: "@parity/cli",
        changelogPath: "packages/cli",
        include: [
          "packages/cli",
          "packages/libgen",
          "packages/registry",
          "packages/code",
          "packages/core",
          "packages/project"
        ]
      }
    ]
  }
}
