import { execFileSync } from "node:child_process"
import { cpSync, globSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { SentryCli } from "@sentry/cli"
import { currentCommit } from "./commit.ts"

/** What `sourcemaps/build.json` records, which upload-sourcemaps.ts names the release from. */
export interface SourceMapsBuild {
  version: string
  commit?: string | undefined
}

/**
 * Gives each of a package's bundles a debug ID, which Sentry matches an event's frames to its source map by, then moves
 * the maps, with a copy of the bundles they belong to, into the package's `sourcemaps/`, where CI and the release
 * workflows upload them from with upload-sourcemaps.ts. What ships keeps no maps: the bundles are built with hidden ones,
 * which they don't point at. The desktop app's build (PAR-625) and the CLI's `vp pack` (PAR-719) both run it.
 * @param packageFolder the package, whose package.json gives the version, and whose `sourcemaps/` the maps move to
 * @param out the folder the bundles were built in
 * @param bundles the bundles, or folders of them, relative to `out`
 * @param maps globs of their maps, relative to `out`
 * @returns the version and commit the maps were built from
 */
export function separateSourceMaps({
  packageFolder,
  out,
  bundles,
  maps: mapGlobs
}: {
  packageFolder: string
  out: string
  bundles: string[]
  maps: string[]
}): SourceMapsBuild {
  const sourceMaps = join(packageFolder, "sourcemaps")
  rmSync(sourceMaps, { recursive: true, force: true })
  execFileSync(SentryCli.getPath(), ["sourcemaps", "inject", ...bundles.map((bundle) => join(out, bundle))], {
    stdio: ["ignore", "ignore", "inherit"]
  })
  const maps = globSync(mapGlobs, { cwd: out })
  if (maps.length === 0 || maps.length < bundles.length)
    throw new Error(`Only ${maps.length} source maps were written: ${maps.join(", ")}`)
  for (const map of maps) {
    const bundle = map.slice(0, -".map".length)
    mkdirSync(dirname(join(sourceMaps, map)), { recursive: true })
    cpSync(join(out, bundle), join(sourceMaps, bundle))
    renameSync(join(out, map), join(sourceMaps, map))
  }
  const { version } = JSON.parse(readFileSync(join(packageFolder, "package.json"), "utf8")) as { version: string }
  const build: SourceMapsBuild = { version, commit: currentCommit(packageFolder) }
  writeFileSync(join(sourceMaps, "build.json"), JSON.stringify(build, null, 2))
  console.log(`${maps.length} source maps moved to ${relative(process.cwd(), sourceMaps)}`)
  return build
}
