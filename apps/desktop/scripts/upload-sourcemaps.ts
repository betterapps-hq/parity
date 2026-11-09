// Uploads the bundles and source maps `pnpm build` left in sourcemaps/ to Sentry's parity-desktop project, as the
// release their events name, so stack traces resolve to source (PAR-625). CI runs it for the build it installs, and the
// release workflow for each published beta; both have SENTRY_AUTH_TOKEN.
// Usage: node scripts/upload-sourcemaps.ts [--published] [--link-commits]
//   --published     the maps are a published version's, whose release is named by version; otherwise by commit
//   --link-commits  ties the release to its commit through Sentry's GitHub integration, for suspect commits and
//                   "resolved in next release"; only for a commit on main
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { telemetryRelease } from "@parity-app/telemetry"
import { SentryCli } from "@sentry/cli"

const sourceMaps = resolve(import.meta.dirname, "../sourcemaps")
const project = "parity-desktop"
const where = ["--org", "better-apps", "--project", project]

const { values } = parseArgs({
  options: { published: { type: "boolean", default: false }, "link-commits": { type: "boolean", default: false } }
})

if (!process.env.SENTRY_AUTH_TOKEN) {
  throw new Error("SENTRY_AUTH_TOKEN isn't set")
}

const build = JSON.parse(readFileSync(join(sourceMaps, "build.json"), "utf8")) as { version: string; commit?: string }
const release = telemetryRelease({ project, version: build.version, published: values.published, commit: build.commit })

console.log(`Uploading source maps for ${release}`)

sentry("releases", "new", release, ...where)

if (values["link-commits"]) {
  if (!build.commit) {
    throw new Error("The build doesn't say which commit it came from")
  }

  sentry("releases", "set-commits", release, "--commit", `betterapps-hq/parity@${build.commit}`, "--org", "better-apps")
}

// Matched to events by the debug IDs the build gave each bundle; the release only groups them.
sentry("sourcemaps", "upload", sourceMaps, "--release", release, ...where)

sentry("releases", "finalize", release, ...where)

function sentry(...args: string[]): void {
  execFileSync(SentryCli.getPath(), args, { stdio: "inherit" })
}
