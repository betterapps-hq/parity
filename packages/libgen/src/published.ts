import { exec, execFile } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { gunzipSync } from "node:zlib"

const registry = "https://registry.npmjs.org"
const run = promisify(execFile)
const shell = promisify(exec)

/** The versions npm has published of a package. */
export async function publishedVersions(name: string): Promise<string[]> {
  return Object.keys((await packument(name)).versions ?? {})
}

/**
 * The version of a package that `wanted` names: that version when npm has published it, or the one a tag such as
 * `latest` points to.
 */
export async function publishedVersion(name: string, wanted: string): Promise<string> {
  const { versions, "dist-tags": tags } = await packument(name)
  if (versions?.[wanted]) return wanted
  const tagged = tags?.[wanted]
  if (tagged) return tagged
  throw new Error(`npm has no ${name}@${wanted}: give a version it has published, or a tag such as latest`)
}

async function packument(
  name: string
): Promise<{ versions?: Record<string, unknown>; "dist-tags"?: Record<string, string> }> {
  const response = await fetch(`${registry}/${name.replace("/", "%2F")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" }
  })
  if (!response.ok) throw new Error(`npm has no ${name} (${response.status})`)
  return (await response.json()) as { versions?: Record<string, unknown>; "dist-tags"?: Record<string, string> }
}

/**
 * A folder with one version of a package installed, and what it depends on, so a library can be described without a
 * project that has it. npm installs it with its peers, such as React, and without running anyone's install scripts. A
 * version never changes, so each is installed once and kept.
 */
export async function installedVersion(
  name: string,
  version: string,
  cacheRoot = join(homedir(), ".parity", "cache", "packages")
): Promise<string> {
  if (!/^(?:@[\w.~-]+\/)?[\w.~-]+$/.test(name) || !/^[\w.+-]+$/.test(version)) {
    throw new Error(`${name}@${version} isn't a package name and version npm could have published`)
  }
  const dir = join(cacheRoot, `${name.replace("/", "+")}@${version}`)
  const installed = join(dir, ".parity-installed")
  if (
    await readFile(installed, "utf8").then(
      () => true,
      () => false
    )
  )
    return dir
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "parity-library", private: true, dependencies: { [name]: version } }, null, 2)}\n`
  )
  const npm = (args = "") =>
    shell(`npm install --ignore-scripts --no-audit --no-fund --loglevel=error${args}`, {
      cwd: dir,
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true
    })
  // The package is named only in package.json, so the shell npm needs on Windows sees nothing from outside.
  await npm()
  // A React package, one that brought React, is read as an app that uses it would have it: with React DOM at the same
  // version, which rendering its parts needs, and React's types, without which each component's type reads as `any`.
  const react = await readFile(join(dir, "node_modules", "react", "package.json"), "utf8").then(
    (text) => (JSON.parse(text) as { version?: string }).version,
    () => undefined
  )
  if (react && /^\d+\.\d+\.\d+$/.test(react)) {
    const major = react.split(".")[0]!
    await npm(` --save-exact react@${react} react-dom@${react} @types/react@${major} @types/react-dom@${major}`)
  }
  await writeFile(installed, `${name}@${version}\n`)
  return dir
}

/**
 * The repository a package's version was published from and its commit, as npm records them, when it does. The
 * repository is the URL git fetches, whichever way the package wrote it (`git+https://….git`, `github:owner/name`).
 */
export async function publishedSource(
  name: string,
  version: string
): Promise<{ repository?: string; commit?: string }> {
  const response = await fetch(`${registry}/${name.replace("/", "%2F")}/${version}`)
  if (!response.ok) throw new Error(`npm has no ${name}@${version} (${response.status})`)
  const { gitHead, repository } = (await response.json()) as {
    gitHead?: string
    repository?: string | { url?: string }
  }
  const url = typeof repository === "string" ? repository : repository?.url
  return {
    ...(url ? { repository: repositoryUrl(url) } : {}),
    ...(gitHead && /^[0-9a-f]{40}$/.test(gitHead) ? { commit: gitHead } : {})
  }
}

/** A repository as npm may record it, as the https URL git fetches. */
export function repositoryUrl(recorded: string): string {
  const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(recorded)
  if (shorthand) return `https://github.com/${shorthand[1]!.replace(/\.git$/, "")}`
  return recorded
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "")
}

/**
 * A repository's files at one commit whose paths match, fetched alone: a shallow fetch without any file's contents,
 * then a sparse checkout of just the matches. A commit never changes, so its files are cached.
 */
export async function repositoryFiles(
  repo: string,
  commit: string,
  matches: RegExp,
  cacheRoot = join(homedir(), ".parity", "cache", "repositories")
): Promise<{ path: string; text: string }[]> {
  const dir = join(cacheRoot, `${repo.replace(/^https?:\/\//, "").replaceAll(/[^\w.-]+/g, "-")}-${commit.slice(0, 12)}`)
  const listed = join(dir, ".parity-files")
  const key = `${commit}\n${matches.source}\n`
  let paths = await readFile(listed, "utf8").then(
    (text) => (text.startsWith(key) ? text.slice(key.length).split("\n").filter(Boolean) : undefined),
    () => undefined
  )
  if (!paths) {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await git(["init", "-q"], dir)
    await git(["fetch", "-q", "--depth", "1", "--filter=blob:none", repo, commit], dir, 300_000)
    const { stdout } = await git(["ls-tree", "-r", "--name-only", "FETCH_HEAD"], dir, 120_000)
    paths = stdout.split("\n").filter((path) => path && matches.test(path))
    if (paths.length > 0) {
      await git(
        ["sparse-checkout", "set", "--no-cone", "--stdin"],
        dir,
        60_000,
        paths.map((path) => `/${path}`).join("\n")
      )
      await git(["checkout", "-q", "FETCH_HEAD"], dir, 600_000)
    }
    await writeFile(listed, key + paths.join("\n"))
  }
  const files: { path: string; text: string }[] = []
  for (const path of paths) {
    const text = await readFile(join(dir, path), "utf8").catch(() => undefined)
    if (text !== undefined) files.push({ path, text })
  }
  return files
}

async function git(args: string[], cwd: string, timeout = 60_000, input?: string): Promise<{ stdout: string }> {
  const child = run("git", args, { cwd, timeout, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  if (input !== undefined) {
    child.child.stdin?.write(input)
    child.child.stdin?.end()
  }
  return child
}

/**
 * One file from a package as npm publishes it, read from its tarball, without installing it or running anything it
 * ships. Each file is cached per version, which never changes once published.
 */
export async function packageFile(
  name: string,
  version: string,
  path: string,
  cacheRoot = join(homedir(), ".parity", "cache", "npm")
): Promise<string> {
  const cached = join(cacheRoot, `${name.replace("/", "+")}@${version}`, ...path.split("/"))
  try {
    return await readFile(cached, "utf8")
  } catch {
    // Not cached yet.
  }
  const meta = await fetch(`${registry}/${name.replace("/", "%2F")}/${version}`)
  if (!meta.ok) throw new Error(`npm has no ${name}@${version} (${meta.status})`)
  const tarball = ((await meta.json()) as { dist?: { tarball?: string } }).dist?.tarball
  if (!tarball) throw new Error(`npm gives no tarball for ${name}@${version}`)
  const archive = await fetch(tarball)
  if (!archive.ok) throw new Error(`${name}@${version}'s tarball couldn't be downloaded (${archive.status})`)
  const file = tarEntry(gunzipSync(Buffer.from(await archive.arrayBuffer())), `package/${path}`)
  if (!file) throw new Error(`${name}@${version} has no ${path}`)
  const text = file.toString("utf8")
  await mkdir(dirname(cached), { recursive: true })
  await writeFile(cached, text)
  return text
}

/** A file in a tar archive by its path, reading the long names pax headers give. */
export function tarEntry(archive: Buffer, wanted: string): Buffer | undefined {
  let offset = 0
  let longName: string | undefined
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) return undefined
    const field = (start: number, length: number) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0.*$/s, "")
    const size = Number.parseInt(field(124, 12).trim() || "0", 8)
    const type = field(156, 1)
    const prefix = field(345, 155)
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100))
    longName = undefined
    const body = archive.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
    if (type === "x") {
      longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"))?.[1]
      continue
    }
    if ((type === "0" || type === "") && name === wanted) return body
  }
  return undefined
}
