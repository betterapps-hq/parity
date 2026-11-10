import { execFileSync } from "node:child_process"

/** The repository Sentry's GitHub integration knows Parity's commits by. */
export const repository = "betterapps-hq/parity"

/**
 * The commit of the version a package published before `version`, read from the tags Beachball pushes
 * (`<package>_v<version>`), or nothing when it has none. `tags` is what `git ls-remote --tags` prints: an annotated tag's
 * commit is on its peeled `^{}` line.
 */
export function previousVersionCommit(tags: string, packageName: string, version: string): string | undefined {
  const prefix = `refs/tags/${packageName}_v`
  const commits = new Map<string, string>()

  for (const line of tags.split("\n")) {
    const [sha, ref] = line.trim().split(/\s+/)

    if (!sha || !ref?.startsWith(prefix)) {
      continue
    }

    const peeled = ref.endsWith("^{}")
    const tagged = ref.slice(prefix.length, peeled ? -3 : undefined)

    if (peeled || !commits.has(tagged)) {
      commits.set(tagged, sha)
    }
  }

  const earlier = [...commits.keys()]
    .filter((tagged) => parseVersion(tagged) && compareVersions(tagged, version) < 0)
    .sort(compareVersions)
    .at(-1)

  return earlier === undefined ? undefined : commits.get(earlier)
}

/**
 * What `sentry-cli releases set-commits --commit` takes for a release: the commits since the previous version when
 * there is one. Given only the release's commit, Sentry counts from the last release it has with commits, which CI's
 * build of the same commit on main makes minutes before, so the published release got none (PAR-830).
 */
export function commitRange(commit: string, previous: string | undefined): string {
  return previous === undefined || previous === commit
    ? `${repository}@${commit}`
    : `${repository}@${previous}..${commit}`
}

/** The tags on GitHub, which a shallow checkout without tags can still read. */
export function remoteTags(cwd: string): string {
  return execFileSync("git", ["ls-remote", "--tags", "origin"], { cwd, encoding: "utf8" })
}

function parseVersion(version: string): number[] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)

  return match ? match.slice(1).map(Number) : undefined
}

function compareVersions(a: string, b: string): number {
  const [left = [], right = []] = [parseVersion(a), parseVersion(b)]

  for (let part = 0; part < 3; part++) {
    const difference = (left[part] ?? 0) - (right[part] ?? 0)

    if (difference !== 0) {
      return difference
    }
  }

  return 0
}
