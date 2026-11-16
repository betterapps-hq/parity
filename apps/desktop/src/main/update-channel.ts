/** What a check sets on electron-updater's updater before it looks for a release. */
export interface UpdateChannel {
  channel: "beta" | "latest"
  allowPrerelease: boolean
}

/**
 * The channel and prerelease setting a check gives electron-updater. With prereleases allowed and no channel, its GitHub
 * provider takes the first entry in the releases feed as the newest release, but that feed also lists the
 * `@parity-app/*` tags the release workflows push, which have no release files, and every beta check failed while one
 * came first (PAR-825). Naming the beta channel makes it walk the feed to the newest version tag instead. Stable names
 * `latest`, as a channel set once can't be cleared, and reads `latest.yml` from GitHub's latest release either way.
 */
export function updateChannel(beta: boolean): UpdateChannel {
  return { channel: beta ? "beta" : "latest", allowPrerelease: beta }
}
