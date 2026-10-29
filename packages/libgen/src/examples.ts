import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { ComponentSample, SampleChild } from "@parity/core"
import ts from "typescript"

const run = promisify(execFile)

/** Where a library's examples come from, as a preset can say when its repository's layout needs it. */
export interface ExampleHints {
  /** The repository, when it isn't the package's own: a styled kit's examples live upstream. */
  repo?: string
  /** Folders to search, relative to the repository; unset searches the whole repository. */
  paths?: string[]
  /** Folders where every JSX file is an example, whatever it's called (MUI's `docs/data` demos). */
  demos?: string[]
}

/** The commit examples were read at, and how it was matched to the installed version. */
export interface ExampleSource {
  repo: string
  commit: string
  /** `upstream` (a revision the package records), `gitHead` (npm's), `tag`, or `date` (the last commit before it was published). */
  how: "upstream" | "gitHead" | "tag" | "date"
  files: number
}

export interface ExampleFile {
  path: string
  text: string
}

interface PackageJson {
  name?: string
  version?: string
  repository?: string | { url?: string; directory?: string }
}

/** Example and story files: stories, demos, examples and docs' demo files, in TypeScript or JavaScript. */
const examplePath =
  /(?:\.stories\.[jt]sx?$|\.demo\.[\w.-]*\.?[jt]sx?$|-demo\.[jt]sx?$|\/(?:examples?|demos?|stories)\/.*\.[jt]sx?$)/
const skipped = /(?:^|\/)(?:node_modules|dist|build|__tests__|test|tests)\//

/**
 * Downloads a library's examples at the commit its installed version was published from, so how its authors put its
 * parts together can be read rather than guessed. Only the example files are fetched (a shallow, sparse git fetch with
 * no other blobs), into a cache kept per commit. Without git, network or a matching commit it returns no files and
 * says why, and generation goes on without them.
 */
export async function fetchExamples(
  pkg: PackageJson,
  packageDir: string,
  hints: ExampleHints = {},
  cacheRoot = join(homedir(), ".parity", "cache", "examples")
): Promise<{ files: ExampleFile[]; source?: ExampleSource; note?: string }> {
  const upstream = await readUpstream(packageDir)
  const repo = normalizeRepo(hints.repo ?? upstream?.repository ?? repositoryOf(pkg))
  if (!repo) return { files: [], note: "No repository is named, so no examples were read." }
  try {
    const found = await findCommit(repo, pkg, upstream?.revision, cacheRoot)
    if (!found) return { files: [], note: `No commit of ${repo} could be matched to ${pkg.name} ${pkg.version}.` }
    const dir = join(cacheRoot, `${slug(repo)}-${found.commit.slice(0, 12)}`)
    const files = await checkoutExamples(dir, repo, found.commit, hints)
    return { files, source: { repo, commit: found.commit, how: found.how, files: files.length } }
  } catch (error) {
    return { files: [], note: `Examples weren't read from ${repo}: ${message(error)}` }
  }
}

async function readUpstream(packageDir: string): Promise<{ repository?: string; revision?: string } | undefined> {
  try {
    return JSON.parse(await readFile(join(packageDir, "upstream.json"), "utf8")) as { repository?: string; revision?: string }
  } catch {
    return undefined
  }
}

function repositoryOf(pkg: PackageJson): string | undefined {
  return typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url
}

/** A repository URL git can fetch: `git+https://github.com/a/b.git` and `github:a/b` become `https://github.com/a/b`. */
export function normalizeRepo(url: string | undefined): string | undefined {
  if (!url) return undefined
  const short = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(url)
  if (short) return `https://github.com/${short[1]!.replace(/\.git$/, "")}`
  const https = /^(?:git\+)?(?:https?|git|ssh):\/\/(?:git@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url)
  return https ? `https://${https[1]}/${https[2]}` : undefined
}

/** The commit the installed version was published from: recorded upstream, npm's `gitHead`, a tag, or by date. */
async function findCommit(
  repo: string,
  pkg: PackageJson,
  upstream: string | undefined,
  cacheRoot: string
): Promise<{ commit: string; how: ExampleSource["how"] } | undefined> {
  if (upstream && /^[0-9a-f]{40}$/.test(upstream)) return { commit: upstream, how: "upstream" }
  const published = await npmVersion(pkg)
  if (published?.gitHead) return { commit: published.gitHead, how: "gitHead" }
  const name = pkg.name ?? ""
  const version = pkg.version ?? ""
  const tags = new Map<string, string>()
  const { stdout } = await git(["ls-remote", "--tags", repo], undefined, 60_000)
  for (const line of stdout.split("\n")) {
    const [sha, ref] = line.trim().split(/\s+/)
    if (!sha || !ref) continue
    // An annotated tag's own object comes first; the commit it points at is the `^{}` line.
    tags.set(ref.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""), sha)
  }
  const short = name.replace(/^@[^/]+\//, "")
  for (const tag of [`v${version}`, `${name}@${version}`, `${short}@${version}`, `${short}-v${version}`, version]) {
    const sha = tags.get(tag)
    if (sha) return { commit: sha, how: "tag" }
  }
  if (!published?.time) return undefined
  // The last commit on the default branch before the version was published, from a history-only fetch around then.
  const dir = join(cacheRoot, `${slug(repo)}-history`)
  await mkdir(dir, { recursive: true })
  if (!existsSync(join(dir, ".git"))) await git(["init", "-q"], dir)
  const since = new Date(Date.parse(published.time) - 3 * 86_400_000).toISOString()
  await git(["fetch", "-q", "--filter=tree:0", `--shallow-since=${since}`, repo, "HEAD"], dir, 300_000)
  const { stdout: commit } = await git(["rev-list", "-1", `--before=${published.time}`, "FETCH_HEAD"], dir)
  return commit.trim() ? { commit: commit.trim(), how: "date" } : undefined
}

async function npmVersion(pkg: PackageJson): Promise<{ gitHead?: string; time?: string } | undefined> {
  if (!pkg.name || !pkg.version) return undefined
  try {
    const response = await fetch(`https://registry.npmjs.org/${pkg.name.replace("/", "%2F")}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) return undefined
    const packument = (await response.json()) as {
      versions?: Record<string, { gitHead?: string }>
      time?: Record<string, string>
    }
    const gitHead = packument.versions?.[pkg.version]?.gitHead
    return { ...(gitHead ? { gitHead } : {}), ...(packument.time?.[pkg.version] ? { time: packument.time[pkg.version] } : {}) }
  } catch {
    return undefined
  }
}

/**
 * Checks out only the example files of one commit, once: a later run reads them from the cache, unless the folders
 * looked in have changed since.
 */
async function checkoutExamples(
  dir: string,
  repo: string,
  commit: string,
  { paths, demos = [] }: ExampleHints
): Promise<ExampleFile[]> {
  const done = join(dir, ".parity-examples")
  const key = [commit, ...(paths ?? []), ...demos.map((demo) => `demos:${demo}`)].join("\n")
  const cached = await readFile(done, "utf8").catch(() => undefined)
  if (cached !== key) {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await git(["init", "-q"], dir)
    await git(["remote", "add", "origin", repo], dir)
    await git(["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", commit], dir, 300_000)
    const { stdout } = await git(["ls-tree", "-r", "--name-only", "FETCH_HEAD"], dir, 120_000)
    const wanted = stdout
      .split("\n")
      .filter((path) => path && !skipped.test(path))
      .filter(
        (path) =>
          (examplePath.test(path) && (!paths || paths.some((prefix) => path.startsWith(prefix)))) ||
          (/\.[jt]sx$/.test(path) && demos.some((prefix) => path.startsWith(prefix)))
      )
      .slice(0, 5000)
    await writeFile(join(dir, ".parity-wanted"), wanted.join("\n"))
    if (wanted.length > 0) {
      await git(["sparse-checkout", "set", "--no-cone", "--stdin"], dir, 60_000, wanted.map((path) => `/${path}`).join("\n"))
      await git(["checkout", "-q", "FETCH_HEAD"], dir, 600_000)
    }
    await writeFile(done, key)
  }
  const wanted = (await readFile(join(dir, ".parity-wanted"), "utf8")).split("\n").filter(Boolean)
  const files: ExampleFile[] = []
  for (const path of wanted) {
    const text = await readFile(join(dir, path), "utf8").catch(() => undefined)
    if (text !== undefined) files.push({ path, text })
  }
  return files
}

async function git(args: string[], cwd?: string, timeout = 60_000, input?: string): Promise<{ stdout: string }> {
  const child = run("git", args, { cwd, timeout, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  if (input !== undefined) {
    child.child.stdin?.write(input)
    child.child.stdin?.end()
  }
  const { stdout } = await child
  return { stdout: String(stdout) }
}

function slug(repo: string): string {
  return repo.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "-")
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200)
}

/** What a library's examples show about one component: where it's placed, and a typical way it's used. */
export interface ExampleUse {
  /** How often it appears. */
  count: number
  /** How often it appears with no library component around it. */
  topLevel: number
  /** Its nearest library ancestor in each use, counted. */
  parents: Map<string, number>
  /** The fullest use, as a sample: literal props, text, and the library's components inside it. */
  sample?: ComponentSample
  sampleSize: number
}

/**
 * Reads how a library's components are used in its examples: each element whose tag is one of its components (as
 * written, `Dialog.Content`, or with the dot left out, `Menu.Item` for `MenuItem`), the nearest such element around
 * it, and its literal props and children.
 */
export function readExamples(files: ExampleFile[], names: string[]): Map<string, ExampleUse> {
  const known = new Set(names)
  const flat = new Map(names.map((name) => [name.replaceAll(".", ""), name]))
  const resolve = (tag: string) => (known.has(tag) ? tag : flat.get(tag.replaceAll(".", "")))
  const uses = new Map<string, ExampleUse>()
  for (const file of files) {
    // A quick look first: most files in a large repository use none of these components.
    if (!names.some((name) => file.text.includes(name.split(".").at(-1)!))) continue
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    const visit = (node: ts.Node, around: string | undefined) => {
      let here = around
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node
        const name = resolve(opening.tagName.getText(source))
        if (name) {
          const use: ExampleUse = uses.get(name) ?? { count: 0, topLevel: 0, parents: new Map(), sampleSize: -1 }
          use.count++
          if (around) use.parents.set(around, (use.parents.get(around) ?? 0) + 1)
          else use.topLevel++
          const sample = familySample(sampleOf(node, source, resolve, 0), familyOf(name))
          const size = sampleWeight(sample)
          if (size > use.sampleSize) {
            use.sample = sample
            use.sampleSize = size
          }
          uses.set(name, use)
          here = name
        }
      }
      // JSX passed in a prop (`content={<ChartTooltipContent />}`) is rendered wherever that component puts it, so
      // it isn't placed in the element whose prop it is.
      ts.forEachChild(node, (child) => visit(child, ts.isJsxAttributes(child) ? undefined : here))
    }
    visit(source, undefined)
  }
  return uses
}

function sampleOf(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  source: ts.SourceFile,
  resolve: (tag: string) => string | undefined,
  depth: number
): ComponentSample {
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  const props: Record<string, unknown> = {}
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue
    const name = attribute.name.getText(source)
    if (name === "key" || name === "className" || name === "style" || name.startsWith("on")) continue
    const value = literal(attribute.initializer)
    if (value !== undefined) props[name] = value
  }
  const children: SampleChild[] = []
  if (ts.isJsxElement(node) && depth < 4) {
    for (const child of node.children) {
      if (children.length >= 4) break
      if (ts.isJsxText(child)) {
        const text = child.text.replace(/\s+/g, " ").trim()
        if (text) children.push(text.slice(0, 60))
      } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        const tag = (ts.isJsxElement(child) ? child.openingElement : child).tagName.getText(source)
        const name = resolve(tag)
        if (name) children.push({ component: name, ...sampleOf(child, source, resolve, depth + 1) })
        else {
          // An HTML element or the example's own component: its text still says what goes there.
          const text = textIn(child)
          if (text) children.push(text)
        }
      }
    }
  }
  return {
    ...(Object.keys(props).length > 0 ? { props } : {}),
    ...(children.length > 0 ? { children } : {})
  }
}

function literal(initializer: ts.JsxAttributeValue | undefined): unknown {
  if (!initializer) return true
  if (ts.isStringLiteral(initializer)) return initializer.text
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expression = initializer.expression
    if (ts.isStringLiteralLike(expression)) return expression.text
    if (ts.isNumericLiteral(expression)) return Number(expression.text)
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  }
  return undefined
}

function textIn(node: ts.Node): string {
  const parts: string[] = []
  const visit = (child: ts.Node) => {
    if (ts.isJsxText(child)) parts.push(child.text)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 60)
}

function sampleWeight(sample: ComponentSample): number {
  const children = sample.children ?? []
  return (
    children.length * 2 +
    Object.keys(sample.props ?? {}).length +
    children.reduce((sum, child) => sum + (typeof child === "string" ? 0 : sampleWeight(child)), 0)
  )
}

/** A component's family: its namespace (`Dialog` for `Dialog.Title`), else the first word of its name. */
export function familyOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot === -1 ? (/^[A-Z][a-z0-9]*/.exec(name)?.[0] ?? name) : name.slice(0, dot)
}

/**
 * The library component a component is most often placed directly inside in the examples, when at least half its uses
 * agree and most of them have one at all. `sameFamily` keeps only parents of its own family: a component that draws
 * alone is placed in forms and cards too, which says nothing about where it belongs.
 */
export function nearestParent(
  uses: Map<string, ExampleUse>,
  name: string,
  sameFamily: boolean
): { parent: string; share: number; uses: number } | undefined {
  const use = uses.get(name)
  if (!use) return undefined
  const family = familyOf(name)
  const counted = [...use.parents].filter(([parent]) => !sameFamily || familyOf(parent) === family)
  const placed = counted.reduce((sum, [, count]) => sum + count, 0)
  if (placed * 2 < use.count) return undefined
  const [parent, count] = counted.sort((a, b) => b[1] - a[1])[0] ?? []
  if (!parent || !count || count * 2 < placed) return undefined
  return { parent, share: count / use.count, uses: use.count }
}

/** A sample with only its own family's components in it, as text where others were. */
export function familySample(sample: ComponentSample, family: string): ComponentSample {
  const keep = (child: SampleChild): SampleChild | undefined =>
    typeof child === "string"
      ? child
      : familyOf(child.component) === family
        ? { ...child, ...(child.children ? { children: child.children.flatMap((inner) => keep(inner) ?? []) } : {}) }
        : undefined
  const children = (sample.children ?? []).flatMap((child) => keep(child) ?? [])
  return { ...(sample.props ? { props: sample.props } : {}), ...(children.length > 0 ? { children } : {}) }
}
