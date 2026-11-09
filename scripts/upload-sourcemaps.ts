// Uploads the bundles and source maps a package's build left in its sourcemaps/ to the Sentry project its events go to,
// as the release they name, so stack traces resolve to source: the desktop app's to parity-desktop (PAR-625), the CLI's
// to parity-cli (PAR-719). CI runs it for the app's build it installs, and the release workflows for each published
// version; all have SENTRY_AUTH_TOKEN.
// Usage: node scripts/upload-sourcemaps.ts <package folder> --project <name> [--published] [--link-commits]
//   --project       the Sentry project, which the release's name starts with, as telemetryRelease has it
//   --published     the maps are a published version's, whose release is named by version; otherwise by commit
//   --link-commits  ties the release to its commit through Sentry's GitHub integration, for suspect commits and
//                   "resolved in next release"; only for a commit on main
import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { telemetryRelease } from "@parity-app/telemetry"
import { SentryCli } from "@sentry/cli"
import type { SourceMapsBuild } from "./sourcemaps.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string" },
    published: { type: "boolean", default: false },
    "link-commits": { type: "boolean", default: false }
  }
})

const [packageFolder] = positionals
const { project } = values

if (!packageFolder || !project) {
  throw new Error("Usage: upload-sourcemaps.ts <package folder> --project <name>")
}

if (!process.env.SENTRY_AUTH_TOKEN) {
  throw new Error("SENTRY_AUTH_TOKEN isn't set")
}

const sourceMaps = resolve(packageFolder, "sourcemaps")
const where = ["--org", "better-apps", "--project", project]
const build = JSON.parse(readFileSync(join(sourceMaps, "build.json"), "utf8")) as SourceMapsBuild
const release = telemetryRelease({ project, version: build.version, published: values.published, commit: build.commit })

console.log(`Uploading source maps for ${release}`)

// For the step after it, which asks Sentry whether the release ended up with its maps and commits (PAR-774).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `release=${release}\n`)
}

sentry("releases", "new", release, ...where)

// Matched to events by the debug IDs the build gave each bundle; the release only groups them.
sentry("sourcemaps", "upload", sourceMaps, "--release", release, ...where)

sentry("releases", "finalize", release, ...where)

// Last, and only a warning when it fails, since the maps matter more: Sentry links commits only for a repository its
// GitHub integration has, and until it had betterapps-hq/parity this step failed first and nothing was uploaded.
if (values["link-commits"]) {
  if (!build.commit) {
    throw new Error("The build doesn't say which commit it came from")
  }

  try {
    sentry(
      "releases",
      "set-commits",
      release,
      "--commit",
      `betterapps-hq/parity@${build.commit}`,
      "--org",
      "better-apps"
    )
  } catch {
    console.log(`::warning::The source maps are uploaded, but ${release} isn't linked to its commit.`)
  }
}

function sentry(...args: string[]): void {
  execFileSync(SentryCli.getPath(), args, { stdio: "inherit" })
}
