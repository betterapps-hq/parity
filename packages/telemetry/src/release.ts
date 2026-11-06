import type { TelemetryEnvironment } from "./settings.ts"

/** A full Git commit hash, which development and CI builds are named by. */
const commitHash = /^[0-9a-f]{40}$/

/**
 * The Sentry release a run's events belong to (PAR-625): an installed build's version, such as `parity-desktop@0.21.0`,
 * or the commit a development or CI build was made from, so an event points at the code that had the bug. A build
 * whose commit isn't known is named by its version and environment, so it never joins a published version's release.
 */
export function telemetryRelease({
  project,
  version,
  environment,
  commit
}: {
  /** The Sentry project, such as `parity-desktop`. */
  project: string
  version: string
  environment: TelemetryEnvironment
  commit?: string | undefined
}): string {
  if (environment === "tester") return `${project}@${version}`
  const hash = commit?.trim().toLowerCase()
  if (hash && commitHash.test(hash)) return hash
  return `${project}@${version}+${environment}`
}
