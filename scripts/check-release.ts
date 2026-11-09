// Asks Sentry whether a release has its source maps and its commits, and fails when either is missing (PAR-774). The
// release workflows run it after upload-sourcemaps.ts, which only warns when a commit link fails: until 2026-11-09 every
// published build's link failed, and nothing said so. It only reads, so it can be run against any release.
// Usage: node scripts/check-release.ts <release>
//   <release>  the release's name, such as parity-desktop@0.40.0 or a commit on main; upload-sourcemaps.ts gives it
import { setTimeout as sleep } from "node:timers/promises"
import { parserFor } from "@parity-app/core/schema"
import { z } from "zod"
import { print } from "./output.ts"

/** The part of Sentry's release summary (`/organizations/<org>/releases/<release>/meta/`) the check reads. */
const releaseSummary = z.object({
  /** The files uploaded to the release: each artifact bundle's bundles and maps, or the older release files. */
  releaseFileCount: z.number(),
  commitCount: z.number()
})

export type ReleaseMeta = z.infer<typeof releaseSummary>

const readReleaseSummary = parserFor(releaseSummary)

/**
 * How many times Sentry is asked before a missing part stands, since it may still be processing the upload: 10 to 50
 * seconds apart, about 2.5 minutes in all. Three tries, 30 seconds, missed `parity-cli@0.31.0`'s maps (PAR-803).
 */
const tries = 6

/** What a release lacks, in words for the run's log: nothing when it has its maps and commits. */
export function releaseProblems(release: string, meta: ReleaseMeta | undefined): string[] {
  if (!meta) {
    return [`Sentry has no release ${release}.`]
  }

  const problems: string[] = []

  if (meta.releaseFileCount === 0) {
    problems.push(`${release} has no source maps.`)
  }

  if (meta.commitCount === 0) {
    problems.push(`${release} isn't linked to its commits.`)
  }

  return problems
}

/**
 * Asks Sentry for a release's summary up to `tries` times, waiting `wait` milliseconds times the try's number between
 * them, and returns what it still lacks after the last.
 */
export async function checkRelease(
  release: string,
  { token, fetch = globalThis.fetch, wait = 10_000 }: { token: string; fetch?: typeof globalThis.fetch; wait?: number }
): Promise<string[]> {
  let problems: string[] = []

  for (let attempt = 1; attempt <= tries; attempt++) {
    problems = releaseProblems(release, await releaseMeta(release, { token, fetch }))

    if (problems.length === 0 || attempt === tries) {
      break
    }

    await sleep(wait * attempt)
  }

  return problems
}

async function releaseMeta(
  release: string,
  { token, fetch }: { token: string; fetch: typeof globalThis.fetch }
): Promise<ReleaseMeta | undefined> {
  const response = await fetch(
    `https://sentry.io/api/0/organizations/better-apps/releases/${encodeURIComponent(release)}/meta/`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (response.status === 404) {
    return undefined
  }

  if (!response.ok) {
    throw new Error(`Sentry answered ${response.status} for ${release}: ${await response.text()}`)
  }

  return readReleaseSummary(await response.json())
}

if (import.meta.main) {
  const [release] = process.argv.slice(2)
  const token = process.env.SENTRY_AUTH_TOKEN

  if (!release) {
    console.error("Usage: node scripts/check-release.ts <release>")
    process.exit(2)
  }

  if (!token) {
    throw new Error("SENTRY_AUTH_TOKEN isn't set")
  }

  const problems = await checkRelease(release, { token })

  for (const problem of problems) {
    print(`::error::${problem}`)
  }

  if (problems.length > 0) {
    process.exit(1)
  }

  print(`${release} has its source maps and commits.`)
}
