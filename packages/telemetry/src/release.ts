/** A full Git commit hash, which every build but a published one is named by. */
const commitHash = /^[0-9a-f]{40}$/

/**
 * The Sentry release a run's events belong to (PAR-625): a published build's version, such as `parity-desktop@0.21.0`,
 * or the commit any other build was made from (development, CI, and pull requests' preview installers), so an event
 * points at the code that had the bug. A build whose commit isn't known is named by its version marked unreleased, so it
 * never joins a published version's release.
 */
export function telemetryRelease({
  project,
  version,
  published,
  commit
}: {
  /** The Sentry project, such as `parity-desktop`. */
  project: string
  version: string
  /** Whether this is a build the release workflow published. */
  published: boolean
  commit?: string | undefined
}): string {
  if (published) {
    return `${project}@${version}`
  }

  const hash = commit?.trim().toLowerCase()

  if (hash && commitHash.test(hash)) {
    return hash
  }

  return `${project}@${version}+unreleased`
}
