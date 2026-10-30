import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, posix } from "node:path"
import { promisify } from "node:util"
import {
  type ComponentSample,
  isMadeValue,
  isSampleRender,
  type MadeValue,
  type SampleChild,
  type SampleRender
} from "@parity-app/core"
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
  /** Folders of docs pages whose Anatomy or Usage blocks show how parts nest, to check the chains against. */
  anatomy?: string[]
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
): Promise<{ files: ExampleFile[]; docs?: ExampleFile[]; source?: ExampleSource; note?: string }> {
  const upstream = await readUpstream(packageDir)
  const repo = normalizeRepo(hints.repo ?? upstream?.repository ?? repositoryOf(pkg))
  if (!repo) return { files: [], note: "No repository is named, so no examples were read." }
  try {
    const found = await findCommit(repo, pkg, upstream?.revision, cacheRoot)
    if (!found) return { files: [], note: `No commit of ${repo} could be matched to ${pkg.name} ${pkg.version}.` }
    const dir = join(cacheRoot, `${slug(repo)}-${found.commit.slice(0, 12)}`)
    const checkedOut = await checkoutExamples(dir, repo, found.commit, hints)
    const files = checkedOut.filter((file) => !/\.mdx?$/.test(file.path))
    const docs = checkedOut.filter((file) => /\.mdx?$/.test(file.path))
    // A folder the preset names that holds nothing at this commit has usually moved upstream.
    const folders = [...(hints.paths ?? []), ...(hints.demos ?? []), ...(hints.anatomy ?? [])]
    const empty = folders.filter(
      (folder) => !checkedOut.some((file) => file.path.replaceAll("\\", "/").includes(folder.replace(/\/$/, "")))
    )
    return {
      files,
      docs,
      source: { repo, commit: found.commit, how: found.how, files: files.length },
      ...(empty.length > 0
        ? { note: `No examples in ${empty.join(", ")} at ${found.commit.slice(0, 10)}; the folder may have moved.` }
        : {})
    }
  } catch (error) {
    return { files: [], note: `Examples weren't read from ${repo}: ${message(error)}` }
  }
}

async function readUpstream(packageDir: string): Promise<{ repository?: string; revision?: string } | undefined> {
  try {
    return JSON.parse(await readFile(join(packageDir, "upstream.json"), "utf8")) as {
      repository?: string
      revision?: string
    }
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
    return {
      ...(gitHead ? { gitHead } : {}),
      ...(packument.time?.[pkg.version] ? { time: packument.time[pkg.version] } : {})
    }
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
  { paths, demos = [], anatomy = [] }: ExampleHints
): Promise<ExampleFile[]> {
  const done = join(dir, ".parity-examples")
  const key = [
    commit,
    "imports",
    ...(paths ?? []),
    ...demos.map((demo) => `demos:${demo}`),
    ...anatomy.map((folder) => `anatomy:${folder}`)
  ].join("\n")
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
          (/\.[jt]sx$/.test(path) && demos.some((prefix) => path.startsWith(prefix))) ||
          (/\.mdx?$/.test(path) && anatomy.some((prefix) => path.startsWith(prefix)))
      )
      .slice(0, 5000)
    const checkout = async (paths: string[]) => {
      await git(
        ["sparse-checkout", "set", "--no-cone", "--stdin"],
        dir,
        60_000,
        paths.map((path) => `/${path}`).join("\n")
      )
      await git(["checkout", "-q", "FETCH_HEAD"], dir, 600_000)
    }
    if (wanted.length > 0) {
      await checkout(wanted)
      // The repository's own files the examples import (Chakra's `compositions/ui/toaster`, which makes its toaster
      // and draws its toasts), as an example of how the parts go together.
      const tree = stdout.split("\n").filter((path) => /\.[jt]sx?$/.test(path) && !skipped.test(path))
      const texts = await Promise.all(wanted.map((path) => readFile(join(dir, path), "utf8").catch(() => "")))
      const imported = localImports(wanted, texts, tree).filter((path) => !wanted.includes(path))
      if (imported.length > 0) {
        wanted.push(...imported.slice(0, 500))
        await checkout(wanted)
      }
    }
    await writeFile(join(dir, ".parity-wanted"), wanted.join("\n"))
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

/**
 * The files of a repository's tree that its example files import, relatively (`./utils`) or by a path the repository
 * maps (`compositions/ui/toaster`, matched by the end of a file's path), but not packages (`react`, `@chakra-ui/react`).
 */
export function localImports(paths: string[], texts: string[], tree: string[]): string[] {
  const local = localResolver(tree)
  const found = new Set<string>()
  paths.forEach((path, index) => {
    for (const match of texts[index]!.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const target = local(path, match[1]!)
      if (target) found.add(target)
    }
  })
  return [...found]
}

/** The file of a tree an import names, relatively or by a mapped path, or none for a package. */
function localResolver(tree: string[]): (from: string, specifier: string) => string | undefined {
  const byStem = new Map<string, string>()
  for (const path of tree) byStem.set(path.replaceAll("\\", "/").replace(/(?:\/index)?\.[jt]sx?$/, ""), path)
  return (from, specifier) => {
    if (specifier.startsWith(".")) return byStem.get(posix.join(posix.dirname(from.replaceAll("\\", "/")), specifier))
    // A package's name has at most one slash after its scope; a mapped path has more, or no scope.
    if (specifier.startsWith("@") ? specifier.split("/").length < 3 : !specifier.includes("/")) return undefined
    const stem = specifier.replace(/^[@~]\//, "")
    // A workspace package's files are under its `src` (`apps/compositions/src/ui/toaster` for `compositions/ui/toaster`).
    for (const [stemmed, target] of byStem) {
      const candidate = stemmed.replace(/\/src(?=\/)/g, "")
      if (candidate === stem || candidate.endsWith(`/${stem}`)) return target
    }
    return undefined
  }
}

/**
 * The methods example files call on a value another file makes and exports (Chakra's `toaster.create({ title, type })`
 * on `compositions/ui/toaster`'s `toaster`), by that file and the name it exports, with arguments the caller spells out:
 * for each method, its fullest call.
 */
function methodCallsOn(
  files: ExampleFile[],
  sourceOf: (file: ExampleFile) => ts.SourceFile,
  pkg: string | undefined,
  reexported: Set<string>
): Map<string, Map<string, MethodCall[]>> {
  const local = localResolver(files.map((file) => file.path))
  const found = new Map<string, Map<string, Map<string, MethodCall>>>()
  for (const file of files) {
    if (!/\.\w+\(/.test(file.text) || !/\bfrom\s+["'](?:\.|[^"'@]+\/|@\/)/.test(file.text)) continue
    const source = sourceOf(file)
    const imported = new Map<string, { file: string; name: string }>()
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const target = local(file.path, statement.moduleSpecifier.text)
      const bindings = statement.importClause?.namedBindings
      if (!target || !bindings || !ts.isNamedImports(bindings)) continue
      for (const element of bindings.elements) {
        imported.set(element.name.text, { file: target, name: (element.propertyName ?? element.name).text })
      }
    }
    if (imported.size === 0) continue
    const context: Context = {
      source,
      resolve: () => undefined,
      scope: declarations(source),
      env: new Map(),
      ...(pkg ? { imports: packageImports(source, pkg, reexported) } : {})
    }
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression)
      ) {
        const on = imported.get(node.expression.expression.text)
        const args = node.arguments.map((argument) => evaluate(argument, context, 0))
        // Only calls that hand it something (`create({ title })`), not ones that clear it (`dismiss()`).
        if (on && args.length > 0 && !args.some((argument) => argument === undefined)) {
          const method = node.expression.name.text
          const byName = found.get(on.file) ?? new Map<string, Map<string, MethodCall>>()
          const calls = byName.get(on.name) ?? new Map<string, MethodCall>()
          const call: MethodCall = { method, ...(args.length > 0 ? { args } : {}) }
          const before = calls.get(method)
          if (!before || JSON.stringify(call).length > JSON.stringify(before).length) calls.set(method, call)
          byName.set(on.name, calls)
          found.set(on.file, byName)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return new Map(
    [...found].map(([path, byName]) => [
      path,
      new Map([...byName].map(([name, calls]) => [name, [...calls.values()].slice(0, 3)]))
    ])
  )
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
  /** Every library ancestor of each way a file places it, nearest first, for the chain at any depth (up to 300). */
  paths: string[][]
  /** The same for every use, however many times a file repeats one (up to 300). */
  usePaths: string[][]
  /** The fullest use, as a sample: its props, text, and the library's components inside it. */
  sample?: ComponentSample
  sampleSize: number
  /**
   * Every use draws an item of a list a hook returns (`toasts.map(...)` from `useToastManager()`): runtime data the
   * library hands the app, so a person doesn't place it.
   */
  fromHook: boolean
  /** The family the examples place it in when that isn't its name's (`Table` for React Aria's `Row`). */
  family?: string
  /** Props the sample's use set that only it set, left out of the sample, for a part that can't draw without them. */
  rare?: Record<string, unknown>
  /** The values the package makes that any use gives it, by prop, first seen first (a date picker's dates). */
  made?: Record<string, unknown>
}

/**
 * Reads how a library's components are used in its examples: each element whose tag is one of its components (as
 * written, `Dialog.Content`, or with the dot left out, `Menu.Item` for `MenuItem`), every such element around it, and
 * its props and children. Props are worked out where the file says what they are: literals, names it declares
 * (`config={chartConfig}`), `useState`'s first value, and the items a list maps into elements.
 */
export function readExamples(
  files: ExampleFile[],
  names: string[],
  /** The library's package, whose own functions an example calls for a prop's value (`createTreeCollection`). */
  pkg?: string,
  /** The functions the package exports, called from it though an example imports them from elsewhere. */
  reexported: Set<string> = new Set()
): Map<string, ExampleUse> {
  const known = new Set(names)
  const flat = new Map(names.map((name) => [name.replaceAll(".", ""), name]))
  const resolve = (tag: string) => (known.has(tag) ? tag : flat.get(tag.replaceAll(".", "")))
  const uses = new Map<string, ExampleUse>()
  const sources = new Map<ExampleFile, ts.SourceFile>()
  /** How many uses of each part set each prop. */
  const setBy = new Map<string, Map<string, number>>()
  let kin = new Map<string, string>()
  const sourceOf = (file: ExampleFile) => {
    const source =
      sources.get(file) ?? ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    sources.set(file, source)
    return source
  }
  const imported = importedWrappers(files, sourceOf, resolve)
  const calledOn = methodCallsOn(files, sourceOf, pkg, reexported)
  // Twice: where each part is placed first, then its samples, which keep the parts of its family, and a family takes in
  // the parts the examples only ever place inside it (a table's `Row`, `Cell` and `Column`).
  for (const sampling of [false, true]) {
    if (sampling) kin = kinOf(uses)
    const family = (name: string) => kin.get(name) ?? familyOf(name)
    for (const file of files) {
      // A quick look first: most files in a large repository use none of these components.
      if (!sampling && !names.some((name) => file.text.includes(name.split(".").at(-1)!))) continue
      if (sampling && !sources.has(file)) continue
      const source = sourceOf(file)
      readSource(
        source,
        uses,
        resolve,
        sampling ? family : undefined,
        setBy,
        pkg,
        imported(source),
        reexported,
        calledOn.get(file.path)
      )
    }
  }
  // A part's sample props are its defaults wherever it's drawn, so one that only a single use, or under a quarter of
  // them, sets (React Aria's `colSpan` on two of a dozen `Cell`s) is left out.
  for (const [name, family] of kin) {
    const use = uses.get(name)
    if (use) use.family = family
  }
  // A value the package makes for a part, from any of its uses, goes in its sample: the fullest use may not set the
  // dates a date picker's days need.
  for (const use of uses.values()) {
    if (!use.made || !use.sample) continue
    const missing = Object.entries(use.made).filter(([prop]) => !(prop in (use.sample!.props ?? {})))
    if (missing.length > 0) use.sample.props = { ...Object.fromEntries(missing), ...use.sample.props }
  }
  for (const [name, use] of uses) {
    const props = use.sample?.props
    if (!props || use.count < 5) continue
    for (const prop of Object.keys(props)) {
      // A value the package makes is kept however few set it: a date picker's dates are what its days need.
      if (madeIn(props[prop])) continue
      const set = setBy.get(name)?.get(prop) ?? 0
      if (set >= 2 && set * 4 >= use.usePaths.length) continue
      use.rare = { ...use.rare, [prop]: props[prop] }
      delete props[prop]
    }
    if (Object.keys(props).length === 0) delete use.sample!.props
  }
  return uses
}

/**
 * Reads one file's uses: where each part is placed, or with `family`, only the samples, each keeping its own family's
 * parts.
 */
function readSource(
  source: ts.SourceFile,
  uses: Map<string, ExampleUse>,
  base: (tag: string) => string | undefined,
  family?: (name: string) => string,
  setBy?: Map<string, Map<string, number>>,
  pkg?: string,
  imported: Map<string, Wrapper> = new Map(),
  reexported: Set<string> = new Set(),
  calledOn?: Map<string, MethodCall[]>
): void {
  // A part imported under another name (`Toaster as ChakraToaster`) is that part.
  const aliases = pkg ? importAliases(source, pkg) : new Map<string, string>()
  const own = base
  base = (tag: string) => own(aliases.get(tag) ?? tag)
  const wrapping = new Map([...imported, ...wrappers(source, base)])
  // The example's own wrapper of a part (`<CustomTab>`) is that part where the example places it.
  const resolve = (tag: string) => base(tag) ?? wrapping.get(tag)?.name
  const wrapped = new Set([...wrapping.values()].map((wrapper) => wrapper.root))
  const context: Context = {
    source,
    resolve,
    scope: declarations(source),
    env: new Map(),
    wrapping,
    ...(pkg ? { imports: packageImports(source, pkg, reexported) } : {}),
    ...(calledOn ? { calledOn } : {})
  }
  const placedHere = new Set<string>()
  const hooked = hookResults(source)
  const drawnFromHook = mappedComponents(source, hooked, base)
  context.hooked = hooked
  context.hookItem = hookItem(source, hooked, context)
  const drawnWith = drawnProps(source, drawnFromHook, context)
  const visit = (node: ts.Node, around: string[], mapped: boolean, env: Map<string, unknown>) => {
    let here = around
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tag = opening.tagName.getText(source)
      const name = resolve(tag)
      if (name) {
        const use: ExampleUse = uses.get(name) ?? {
          count: 0,
          topLevel: 0,
          parents: new Map(),
          paths: [],
          usePaths: [],
          sampleSize: -1,
          fromHook: true
        }
        // A wrapper's own element is placed wherever the wrapper is, which its uses count.
        if (!family && !wrapped.has(node)) {
          if (!mapped) use.fromHook = false
          // Each way a file places a component counts once, so one long demo can't outweigh ten short ones.
          const path = [...new Set(around)].filter((parent) => parent !== name)
          if (use.usePaths.length < 300) use.usePaths.push(path)
          const key = `${name}<${path.join("<")}`
          if (!placedHere.has(key)) {
            placedHere.add(key)
            use.count++
            const nearest = path[0]
            if (nearest) use.parents.set(nearest, (use.parents.get(nearest) ?? 0) + 1)
            else use.topLevel++
            if (use.paths.length < 300) use.paths.push(path)
          }
        }
        if (family) {
          const sample = familySample(usedSample(node, { ...context, env }, 0), family(name), family)
          const counts = setBy?.get(name) ?? new Map<string, number>()
          for (const [prop, value] of Object.entries(sample.props ?? {})) {
            counts.set(prop, (counts.get(prop) ?? 0) + 1)
            if (madeIn(value) && !(prop in (use.made ?? {}))) use.made = { ...use.made, [prop]: value }
          }
          setBy?.set(name, counts)
          const size = sampleWeight(sample)
          if (size > use.sampleSize) {
            use.sample = sample
            use.sampleSize = size
          }
        }
        uses.set(name, use)
        here = [name, ...around]
      }
    }
    const declared = declaredName(node)
    const inList = mapped || hookMapped(node, hooked, source) || drawnFromHook.has(declared ?? "")
    // A hook's list items are the sample item inside the callback that maps them, and in the example's own
    // component they're drawn with.
    let inner = env
    const callback = mapCallback(node)
    const mappedList = callback && ((node as ts.CallExpression).expression as ts.PropertyAccessExpression).expression
    const listed = mappedList ? listOf(mappedList, { ...context, env }) : undefined
    if (callback && Array.isArray(listed) && listed[0] !== undefined) {
      // A list the file spells out: its first item, for the parts drawn for each.
      inner = new Map(env)
      bind(callback.parameters[0]?.name, listed[0], inner)
    } else if (callback && hookMapped(node, hooked, source) && context.hookItem) {
      inner = new Map(env)
      bind(callback.parameters[0]?.name, itemFor(callback, context.hookItem, source), inner)
    } else if (declared && drawnWith.has(declared)) {
      inner = new Map(env)
      bind(firstParameter(node), drawnWith.get(declared), inner)
    }
    // JSX passed in a prop (`content={<ChartTooltipContent />}`) is rendered wherever that component puts it, so
    // it isn't placed in the element whose prop it is. A render prop's (`render={({ node }) => ...}`) is drawn inside it.
    ts.forEachChild(node, (child) => {
      if (!ts.isJsxAttributes(child)) visit(child, here, inList, inner)
      else ts.forEachChild(child, (attribute) => visit(attribute, rendersInside(attribute) ? here : [], inList, inner))
    })
  }
  visit(source, [], false, new Map())
}

/**
 * The family each part joins beyond its name's: one the examples nearly always place, and place directly inside one
 * family, belongs to it (`Row` and `Cell` to `Table`), so a table's sample keeps its rows and columns. Not when its own
 * family is usually around it too, or into a layout box that holds every family.
 */
function kinOf(uses: Map<string, ExampleUse>): Map<string, string> {
  const kin = new Map<string, string>()
  // A layout box (`Group`, `Stack`) holds every family, so it takes in none.
  const holds = new Map<string, Set<string>>()
  for (const [name, use] of uses) {
    for (const parent of use.parents.keys()) {
      if (familyOf(parent) === familyOf(name)) continue
      holds.set(familyOf(parent), (holds.get(familyOf(parent)) ?? new Set()).add(familyOf(name)))
    }
  }
  const generic = (family: string) => (holds.get(family)?.size ?? 0) > 8
  for (let round = 0; round < 4; round++) {
    let changed = false
    for (const [name, use] of uses) {
      if (use.count < 2) continue
      // One whose own family is around it (`Toggle.Indicator` in a `Button` in `Toggle.Root`) stays in its own.
      const own = use.paths.filter((path) => path.some((parent) => familyOf(parent) === familyOf(name))).length
      if (own * 2 >= use.paths.length) continue
      const families = new Map<string, number>()
      let placed = 0
      for (const [parent, count] of use.parents) {
        const family = kin.get(parent) ?? familyOf(parent)
        families.set(family, (families.get(family) ?? 0) + count)
        placed += count
      }
      const [family, count] = [...families].sort((a, b) => b[1] - a[1])[0] ?? []
      if (!family || !count || count < placed * 0.75 || family === familyOf(name) || kin.get(name) === family) continue
      // A part named for the family (`SubmenuTrigger` in a `Menu`) joins it even where examples also draw it alone, and
      // though the family holds many others.
      const namedFor = name.toLowerCase().includes(family.toLowerCase())
      if (!namedFor && (use.topLevel * 10 > use.count || generic(family))) continue
      kin.set(name, family)
      changed = true
    }
    if (!changed) break
  }
  return kin
}

/** An example's own component that draws one of the library's parts. */
interface Wrapper {
  name: string
  root: ts.Node
  spread: boolean
}

/**
 * The wrappers a file imports from another example file beside it (React Aria's stories take `MyMenuItem` from
 * `./utils`). Only ones that pass their props on count: a wrapper's own element is sampled from its file, not this one.
 */
function importedWrappers(
  files: ExampleFile[],
  sourceOf: (file: ExampleFile) => ts.SourceFile,
  resolve: (tag: string) => string | undefined
): (source: ts.SourceFile) => Map<string, Wrapper> {
  const byPath = new Map(files.map((file) => [file.path.replaceAll("\\", "/"), file]))
  const declared = new Map<ExampleFile, Map<string, Wrapper>>()
  return (source) => {
    const found = new Map<string, Wrapper>()
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const specifier = statement.moduleSpecifier.text
      const bindings = statement.importClause?.namedBindings
      if (!specifier.startsWith(".") || !bindings || !ts.isNamedImports(bindings)) continue
      const base = posix.join(posix.dirname(source.fileName.replaceAll("\\", "/")), specifier)
      const file = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]
        .map((extension) => byPath.get(base + extension))
        .find((item) => item !== undefined)
      if (!file) continue
      let theirs = declared.get(file)
      if (!theirs) {
        theirs = wrappers(sourceOf(file), resolve, false)
        declared.set(file, theirs)
      }
      for (const element of bindings.elements) {
        const wrapper = theirs.get((element.propertyName ?? element.name).text)
        if (wrapper?.spread) found.set(element.name.text, wrapper)
      }
    }
    return found
  }
}

/**
 * The example's own components that return one of the library's parts and no other element (`const CustomTab = (props)
 * => <Tab {...props} />`), each with the part, its element, and whether it hands its props on. With `usedHere`, only
 * those the file places, as against ones it declares for other files.
 */
function wrappers(
  source: ts.SourceFile,
  resolve: (tag: string) => string | undefined,
  usedHere = true
): Map<string, Wrapper> {
  const found = new Map<string, Wrapper>()
  const tags = new Set<string>()
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.add(node.tagName.getText(source))
    const declared = declaredName(node)
    if (declared && !resolve(declared)) {
      let fn: ts.Node | undefined = ts.isVariableDeclaration(node) ? node.initializer && unwrap(node.initializer) : node
      if (fn && ts.isCallExpression(fn)) fn = fn.arguments.find((argument) => ts.isFunctionLike(argument))
      const body =
        fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn))
          ? returned(fn)
          : undefined
      // A fragment counts when the part is its only element (`<><Row {...props} />{loading && <Loader />}</>`).
      const elements =
        body && ts.isJsxFragment(body)
          ? body.children.filter((child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
          : []
      const root = elements.length === 1 ? elements[0] : body
      const opening = root && openingOf(root)
      const name = opening && resolve(opening.tagName.getText(source))
      if (root && opening && name) {
        const spread = opening.attributes.properties.some(ts.isJsxSpreadAttribute)
        found.set(declared, { name, root, spread })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (usedHere) for (const declared of found.keys()) if (!tags.has(declared)) found.delete(declared)
  return found
}

interface Context {
  source: ts.SourceFile
  resolve: (tag: string) => string | undefined
  /** What each name the file declares is set to; `useState`'s first value for its state. */
  scope: Map<string, ts.Expression>
  /** Names bound while mapping a list: the callback's parameters, as each item. */
  env: Map<string, unknown>
  /** Names bound to what a library hook returns, and a sample item for the lists among them. */
  hooked?: Set<string>
  hookItem?: Record<string, unknown>
  /** The example's own wrappers of the library's parts, by name. */
  wrapping?: Map<string, { name: string; root: ts.Node; spread: boolean }>
  /** The functions the file imports from the library's package, by the name it uses, with where they come from. */
  imports?: Map<string, { import: string; export: string }>
  /** The methods other files call on the values this one makes, by the name it declares them under. */
  calledOn?: Map<string, MethodCall[]>
}

type MethodCall = NonNullable<MadeValue["methods"]>[number]

/** The names a file imports from a package or its subpaths (`@base-ui/react/toast`), with what each is there. */
/** Whether a prop's value is one the package makes, or a list holding one. */
function madeIn(value: unknown): boolean {
  return isMadeValue(value) || (Array.isArray(value) && value.some(isMadeValue))
}

/** The library's parts a file imports under names of its own, by those names. */
function importAliases(source: ts.SourceFile, pkg: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const from = statement.moduleSpecifier.text
    const bindings = statement.importClause?.namedBindings
    if ((from !== pkg && !from.startsWith(`${pkg}/`)) || !bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if (element.propertyName) found.set(element.name.text, element.propertyName.text)
    }
  }
  return found
}

function packageImports(
  source: ts.SourceFile,
  pkg: string,
  reexported: Set<string> = new Set()
): Map<string, { import: string; export: string }> {
  const found = new Map<string, { import: string; export: string }>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const from = statement.moduleSpecifier.text
    const own = from === pkg || from.startsWith(`${pkg}/`)
    const bindings = statement.importClause?.namedBindings
    if (from.startsWith(".") || !bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      const name = (element.propertyName ?? element.name).text
      // One the package exports too is called from the package, which the project has.
      if (own) found.set(element.name.text, { import: from, export: name })
      else if (reexported.has(name)) found.set(element.name.text, { import: pkg, export: name })
    }
  }
  return found
}

function sampleOf(node: ts.JsxElement | ts.JsxSelfClosingElement, context: Context, depth: number): ComponentSample {
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  const props: Record<string, unknown> = {}
  const skipped = (name: string) => name === "key" || name === "className" || name === "style" || name.startsWith("on")
  for (const attribute of opening.attributes.properties) {
    // Props spread from an object the file spells out (`{...buttonProps}`).
    if (ts.isJsxSpreadAttribute(attribute)) {
      const spread = evaluate(attribute.expression, context, 0)
      if (typeof spread !== "object" || spread === null || Array.isArray(spread)) continue
      for (const [name, value] of Object.entries(spread)) if (!skipped(name)) props[name] = value
      continue
    }
    if (!ts.isJsxAttribute(attribute)) continue
    const name = attribute.name.getText(context.source)
    if (skipped(name)) continue
    const value = attributeValue(attribute.initializer, context)
    if (value !== undefined) props[name] = value
  }
  const children: SampleChild[] = []
  if (ts.isJsxElement(node) && depth < 4) collectChildren(node.children, context, depth, children)
  return {
    ...(Object.keys(props).length > 0 ? { props } : {}),
    ...(children.length > 0 ? { children } : {})
  }
}

/**
 * An element's sample. The example's own wrapper that doesn't hand its props on (`<Item title="Docs">`) shows its own
 * element's props, and the children it's given when that element has none of its own.
 */
function usedSample(
  element: ts.JsxElement | ts.JsxSelfClosingElement,
  context: Context,
  depth: number
): ComponentSample {
  const tag = (ts.isJsxElement(element) ? element.openingElement : element).tagName.getText(context.source)
  const wrapper = context.wrapping?.get(tag)
  const here = sampleOf(element, context, depth)
  if (!wrapper || wrapper.spread) return here
  const own = sampleOf(wrapper.root as ts.JsxElement | ts.JsxSelfClosingElement, context, depth)
  return {
    ...(own.props ? { props: own.props } : {}),
    ...((own.children ?? here.children) ? { children: own.children ?? here.children } : {})
  }
}

function collectChildren(
  nodes: ts.NodeArray<ts.JsxChild>,
  context: Context,
  depth: number,
  children: SampleChild[]
): void {
  for (const child of nodes) {
    if (children.length >= 4) return
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ").trim()
      if (text) children.push(text.slice(0, 60))
    } else if (ts.isJsxFragment(child)) collectChildren(child.children, context, depth, children)
    else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) pushElement(child, context, depth, children)
    else if (ts.isJsxExpression(child) && child.expression) {
      pushExpression(unwrap(child.expression), context, depth, children)
    }
  }
}

function pushElement(
  element: ts.JsxElement | ts.JsxSelfClosingElement,
  context: Context,
  depth: number,
  children: SampleChild[]
): void {
  const tag = (ts.isJsxElement(element) ? element.openingElement : element).tagName.getText(context.source)
  const name = context.resolve(tag)
  if (name) {
    const sample = usedSample(element, context, depth + 1)
    // One the example gave an element this can't show (the demo's own checkbox) still isn't bare, so it doesn't take
    // its own sample's props where it's inserted. Text it can't read is still shown with its own sample's.
    const filled =
      ts.isJsxElement(element) &&
      element.children.some((child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
    children.push({ component: name, ...sample, ...(filled && !sample.children ? { children: [] } : {}) })
  } else {
    // An HTML element or the example's own component: its text still says what goes there.
    const text = textIn(element)
    if (text) children.push(text)
  }
}

/** A `{...}` child: a list mapped into elements (a few of its items), a condition's element, or text. */
function pushExpression(expression: ts.Expression, context: Context, depth: number, children: SampleChild[]): void {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    const render = renderOf(expression, context, depth)
    if (render) children.push(render)
    return
  }
  if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)) {
    pushElement(expression, context, depth, children)
    return
  }
  if (ts.isJsxFragment(expression)) {
    collectChildren(expression.children, context, depth, children)
    return
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    pushExpression(unwrap(expression.right), context, depth, children)
    return
  }
  if (ts.isConditionalExpression(expression)) {
    pushExpression(unwrap(expression.whenTrue), context, depth, children)
    return
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "map"
  ) {
    const callback = expression.arguments[0]
    if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return
    const body = returned(callback)
    if (!body) return
    const list = listOf(expression.expression.expression, context)
    // A list the file doesn't spell out still shows what goes in it, once.
    let items: unknown[]
    if (Array.isArray(list)) items = list.slice(0, 3)
    else if (context.hookItem && context.hooked && hookMapped(expression, context.hooked, context.source))
      items = [itemFor(callback, context.hookItem, context.source)]
    else items = [undefined]
    items.forEach((item, index) => {
      const env = new Map(context.env)
      if (item !== undefined) bind(callback.parameters[0]?.name, item, env)
      const second = callback.parameters[1]?.name
      if (second && ts.isIdentifier(second)) env.set(second.text, index)
      pushExpression(body, { ...context, env }, depth, children)
    })
    return
  }
  const value = evaluate(expression, context, 0)
  if (typeof value === "string" || typeof value === "number") children.push(String(value).slice(0, 60))
}

/**
 * A function that returns elements, as a sample's render function: what it returns, and whether it spreads its first
 * parameter onto them (`(params) => <TextField {...params} />`).
 */
function renderOf(
  callback: ts.ArrowFunction | ts.FunctionExpression,
  context: Context,
  depth: number
): SampleRender | undefined {
  // A render that picks between elements (`isBranch ? <BranchControl /> : <Item />`) shows the first.
  let body = returned(callback)
  if (body && ts.isConditionalExpression(body)) body = unwrap(body.whenTrue)
  if (!body || !(ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) || ts.isJsxFragment(body))) return undefined
  const inner: SampleChild[] = []
  pushExpression(body, context, depth, inner)
  if (inner.length === 0) return undefined
  const first = callback.parameters[0]?.name
  const opening = openingOf(body)
  const argument = first && ts.isIdentifier(first) ? first.text : undefined
  const takes = (expression: ts.Expression | undefined) =>
    !!argument && !!expression && ts.isIdentifier(expression) && expression.text === argument
  const attributes = opening?.attributes.properties ?? []
  const spread = attributes.some((attribute) => ts.isJsxSpreadAttribute(attribute) && takes(attribute.expression))
  const pass = attributes.flatMap((attribute) =>
    ts.isJsxAttribute(attribute) &&
    attribute.initializer &&
    ts.isJsxExpression(attribute.initializer) &&
    takes(attribute.initializer.expression)
      ? [attribute.name.getText(context.source)]
      : []
  )
  return { $render: inner, ...(spread ? { spread: true as const } : {}), ...(pass.length > 0 ? { pass } : {}) }
}

/** The JSX a callback returns, from an expression body or its first `return`. */
function returned(
  callback: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration
): ts.Expression | undefined {
  if (!callback.body) return undefined
  if (!ts.isBlock(callback.body)) return unwrap(callback.body)
  const found = callback.body.statements.find(ts.isReturnStatement)
  return found?.expression ? unwrap(found.expression) : undefined
}

function bind(name: ts.BindingName | undefined, value: unknown, env: Map<string, unknown>): void {
  if (!name) return
  if (ts.isIdentifier(name)) env.set(name.text, value)
  else if (ts.isObjectBindingPattern(name) && typeof value === "object" && value !== null) {
    for (const element of name.elements) {
      const key = element.propertyName ?? element.name
      if (ts.isIdentifier(key) || ts.isStringLiteral(key))
        bind(element.name, (value as Record<string, unknown>)[key.text], env)
    }
  } else if (ts.isArrayBindingPattern(name) && Array.isArray(value)) {
    name.elements.forEach((element, index) => {
      if (!ts.isOmittedExpression(element)) bind(element.name, value[index], env)
    })
  }
}

/** What each name a file declares is set to: `const x = ...`, and `const [x] = useState(...)`'s first value. */
function declarations(source: ts.SourceFile): Map<string, ts.Expression> {
  const scope = new Map<string, ts.Expression>()
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = unwrap(node.initializer)
      if (ts.isIdentifier(node.name) && !scope.has(node.name.text)) scope.set(node.name.text, initializer)
      // Names taken from what a call returns (`const { collection } = useListCollection(...)`) point at the call, so a
      // list read from them finds its options.
      if (ts.isObjectBindingPattern(node.name) && ts.isCallExpression(initializer)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name) && !scope.has(element.name.text)) scope.set(element.name.text, initializer)
        }
      }
      const state =
        ts.isArrayBindingPattern(node.name) &&
        ts.isCallExpression(initializer) &&
        /(?:^|\.)use(?:State|Controllable\w*)$/.test(initializer.expression.getText(source))
      const first = state ? (node.name as ts.ArrayBindingPattern).elements[0] : undefined
      const argument = state ? (initializer as ts.CallExpression).arguments[0] : undefined
      if (first && !ts.isOmittedExpression(first) && ts.isIdentifier(first.name) && argument) {
        if (!scope.has(first.name.text)) scope.set(first.name.text, unwrap(argument))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return scope
}

/** Hooks that hold the example's own values, not data the library hands it. */
const ownValueHooks = /(?:^|\.)use(?:State|Reducer|Memo|Callback|Ref|DeferredValue|Transition|Controllable\w*)$/

/**
 * The names a file binds to what a library hook returns (`const { toasts } = Toast.useToastManager()`), or to what a
 * library factory makes (`const manager = Toast.createToastManager()`), whose items reach the same lists.
 */
function hookResults(source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  const made = (expression: ts.Expression) =>
    isHookCall(expression, source) ||
    (ts.isCallExpression(expression) && /(?:^|\.)create[A-Z]\w*$/.test(expression.expression.getText(source)))
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && made(unwrap(node.initializer))) {
      if (ts.isIdentifier(node.name)) names.add(node.name.text)
      else {
        for (const element of node.name.elements) {
          if (!ts.isOmittedExpression(element) && ts.isIdentifier(element.name)) names.add(element.name.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

function isHookCall(expression: ts.Expression, source: ts.SourceFile): boolean {
  if (!ts.isCallExpression(expression)) return false
  const callee = expression.expression.getText(source)
  return /(?:^|\.)use[A-Z]\w*$/.test(callee) && !ownValueHooks.test(callee)
}

/**
 * The example's own components drawn only for a hook's list items (`toasts.map((toast) => <MyToast toast={toast} />)`),
 * and those they draw in turn, so the library parts inside them count as mapped too.
 */
function mappedComponents(
  source: ts.SourceFile,
  hooked: Set<string>,
  resolve: (tag: string) => string | undefined
): Set<string> {
  const bodies = new Map<string, ts.Node>()
  const visit = (node: ts.Node) => {
    const name = declaredName(node)
    if (name) bodies.set(name, node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  const tagsIn = (node: ts.Node, found: string[] = []) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source)
      if (bodies.has(tag) && !resolve(tag)) found.push(tag)
    }
    ts.forEachChild(node, (child) => {
      tagsIn(child, found)
    })
    return found
  }
  const found = new Set<string>()
  const queue: string[] = []
  const lists = (node: ts.Node) => {
    if (hookMapped(node, hooked, source)) queue.push(...tagsIn(node))
    else ts.forEachChild(node, lists)
  }
  lists(source)
  while (queue.length > 0) {
    const next = queue.pop()!
    if (found.has(next)) continue
    found.add(next)
    queue.push(...tagsIn(bodies.get(next)!))
  }
  return found
}

/**
 * A sample item for the lists a library keeps, across its examples: the fullest object they hand one of `values`, what
 * the package makes and exports (`toast.add({ title, description })` with Buildkit's `toast`).
 */
export function exampleItem(files: ExampleFile[], values: Set<string>): Record<string, unknown> | undefined {
  let best: Record<string, unknown> | undefined
  if (values.size === 0) return undefined
  for (const file of files) {
    if (![...values].some((value) => file.text.includes(`${value}.`))) continue
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    const context: Context = { source, resolve: () => undefined, scope: declarations(source), env: new Map() }
    const item = hookItem(source, values, context)
    if (item && Object.keys(item).length > Object.keys(best ?? {}).length) best = item
  }
  return best
}

/**
 * A sample item for the lists a hook returns: the fullest object the file hands one of the hook's results
 * (`toastManager.add({ title, description })`), which is what the library puts in the list.
 */
function hookItem(source: ts.SourceFile, hooked: Set<string>, context: Context): Record<string, unknown> | undefined {
  let best: Record<string, unknown> | undefined
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      let root = unwrap(node.expression.expression)
      while (ts.isPropertyAccessExpression(root)) root = unwrap(root.expression)
      const argument = node.arguments[0] && unwrap(node.arguments[0])
      if (ts.isIdentifier(root) && hooked.has(root.text) && argument && ts.isObjectLiteralExpression(argument)) {
        const value = evaluate(argument, context, 0) as Record<string, unknown> | undefined
        if (value && Object.keys(value).length > Object.keys(best ?? {}).length) best = value
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return best
}

/** The item a map callback gets, with an `id` when it reads one (`key={toast.id}`), as lists key their items. */
function itemFor(
  callback: ts.ArrowFunction | ts.FunctionExpression,
  item: Record<string, unknown>,
  source: ts.SourceFile
): Record<string, unknown> {
  const name = callback.parameters[0]?.name
  const readsId = !!name && ts.isIdentifier(name) && callback.getText(source).includes(`${name.text}.id`)
  return readsId && item.id === undefined ? { id: "1", ...item } : item
}

/** The props each of the example's own components gets where a hook's list is mapped into it. */
function drawnProps(source: ts.SourceFile, drawn: Set<string>, context: Context): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>()
  const { hooked, hookItem: item } = context
  if (drawn.size === 0 || !item || !hooked) return found
  const visit = (node: ts.Node) => {
    const callback = hookMapped(node, hooked, source) ? (node as ts.CallExpression).arguments[0] : undefined
    if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      ts.forEachChild(node, visit)
      return
    }
    const env = new Map<string, unknown>()
    bind(callback.parameters[0]?.name, itemFor(callback, item, source), env)
    const inner = (child: ts.Node) => {
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
        const tag = child.tagName.getText(source)
        if (drawn.has(tag) && !found.has(tag)) {
          const props: Record<string, unknown> = {}
          for (const attribute of child.attributes.properties) {
            if (!ts.isJsxAttribute(attribute)) continue
            const value = attributeValue(attribute.initializer, { ...context, env })
            if (value !== undefined) props[attribute.name.getText(source)] = value
          }
          found.set(tag, props)
        }
      }
      ts.forEachChild(child, inner)
    }
    inner(callback)
  }
  visit(source)
  return found
}

/** A declared component's first parameter, for its props. */
function firstParameter(node: ts.Node): ts.BindingName | undefined {
  let fn: ts.Node | undefined = ts.isVariableDeclaration(node) ? node.initializer && unwrap(node.initializer) : node
  if (fn && ts.isCallExpression(fn)) fn = fn.arguments.find((argument) => ts.isFunctionLike(argument))
  if (fn && (ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
    return fn.parameters[0]?.name
  }
  return undefined
}

/** The opening tag of a JSX element, or the element itself when it closes itself. */
function openingOf(node: ts.Node): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined {
  if (ts.isJsxElement(node)) return node.openingElement
  return ts.isJsxSelfClosingElement(node) ? node : undefined
}

/** The name of a component a file declares: `function Name()` or `const Name = ...`, capitalised. */
function declaredName(node: ts.Node): string | undefined {
  let name: string | undefined
  if (ts.isFunctionDeclaration(node) && node.name) name = node.name.text
  else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) name = node.name.text
  return name && /^[A-Z]/.test(name) ? name : undefined
}

/** Whether a prop is a render function (`render={({ node }) => ...}`), which the component draws inside itself. */
function rendersInside(attribute: ts.Node): boolean {
  const value = ts.isJsxAttribute(attribute) && attribute.initializer
  const expression = value && ts.isJsxExpression(value) && value.expression && unwrap(value.expression)
  return !!expression && (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression))
}

/** The callback of a `list.map(callback)` call. */
function mapCallback(node: ts.Node): ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return undefined
  if (node.expression.name.text !== "map") return undefined
  const callback = node.arguments[0]
  return callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback : undefined
}

/**
 * A list a file maps: its value, or a field of the options a library factory or hook was given
 * (`createListCollection({ items })`, `useListCollection({ initialItems })`, where `initialItems` is what `items`
 * starts as). Only lists are read this way, so a prop given the collection itself isn't mistaken for its options.
 */
function listOf(expression: ts.Expression, context: Context): unknown {
  const value = evaluate(expression, context, 0)
  if (value !== undefined) return value
  expression = unwrap(expression)
  if (!ts.isPropertyAccessExpression(expression)) return undefined
  let made = unwrap(expression.expression)
  if (ts.isIdentifier(made)) {
    const declared = context.scope.get(made.text)
    if (declared) made = unwrap(declared)
  }
  if (!ts.isCallExpression(made)) return undefined
  if (!/(?:^|\.)(?:create|use)[A-Z]\w*$/.test(made.expression.getText(context.source))) return undefined
  const argument = made.arguments[0] && unwrap(made.arguments[0])
  if (!argument || !ts.isObjectLiteralExpression(argument)) return undefined
  const options = evaluate(argument, context, 0) as Record<string, unknown> | undefined
  const field = expression.name.text
  return options?.[field] ?? options?.[`initial${field[0]!.toUpperCase()}${field.slice(1)}`]
}

/** Whether a node is `list.map(...)` over a hook's result (`toasts.map`, `manager.toasts.map`, `useItems().map`). */
function hookMapped(node: ts.Node, hooked: Set<string>, source: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
  if (node.expression.name.text !== "map") return false
  let list = unwrap(node.expression.expression)
  if (isHookCall(list, source)) return true
  while (ts.isPropertyAccessExpression(list)) list = unwrap(list.expression)
  return ts.isIdentifier(list) && hooked.has(list.text)
}

function unwrap(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    expression = expression.expression
  }
  return expression
}

function attributeValue(initializer: ts.JsxAttributeValue | undefined, context: Context): unknown {
  if (!initializer) return true
  if (ts.isStringLiteral(initializer)) return initializer.text
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expression = unwrap(initializer.expression)
    // A render prop (`renderInput`), kept as the elements it returns.
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return renderOf(expression, context, 0)
    // Elements as a prop's value (`control={<Checkbox />}`).
    if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression) || ts.isJsxFragment(expression)) {
      const inner: SampleChild[] = []
      pushExpression(expression, context, 0, inner)
      return inner.length > 0 ? { $element: inner } : undefined
    }
    const value = evaluate(expression, context, 0)
    // Values kept small: a sample shows the shape, not a whole dataset.
    return value !== undefined && JSON.stringify(value).length <= 2000 ? value : undefined
  }
  return undefined
}

/**
 * The value an expression has, when the file says: literals, arrays and objects of them, the names it declares, and
 * a mapped item's fields, and calls of the package's own functions as `$call`s. Anything else (other calls, functions,
 * imports) is undefined.
 */
function evaluate(expression: ts.Expression, context: Context, depth: number): unknown {
  if (depth > 6) return undefined
  expression = unwrap(expression)
  if (ts.isStringLiteralLike(expression)) return expression.text.slice(0, 200)
  // A template whose every part the file spells out.
  if (ts.isTemplateExpression(expression)) {
    let text = expression.head.text
    for (const span of expression.templateSpans) {
      const value = evaluate(span.expression, context, depth + 1)
      if (typeof value !== "string" && typeof value !== "number") return undefined
      text += `${value}${span.literal.text}`
    }
    return text.slice(0, 200)
  }
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  ) {
    return -Number(expression.operand.text)
  }
  if (ts.isIdentifier(expression)) {
    if (context.env.has(expression.text)) return context.env.get(expression.text)
    const declared = context.scope.get(expression.text)
    const value = declared ? evaluate(declared, context, depth + 1) : undefined
    const methods = context.calledOn?.get(expression.text)
    return methods && isMadeValue(value) ? { ...value, methods } : value
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const items = expression.elements
      .flatMap((element) => {
        // A spread list the file spells out (`[...defaults, extra]`) adds its items.
        if (!ts.isSpreadElement(element)) return [evaluate(element, context, depth + 1)]
        const spread = evaluate(element.expression, context, depth + 1)
        return Array.isArray(spread) ? spread : []
      })
      .slice(0, 8)
      .filter((item) => item !== undefined)
    return items.length > 0 ? items : undefined
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const object: Record<string, unknown> = {}
    for (const property of expression.properties) {
      // A spread object the file spells out (`{ ...defaults, size }`) adds its fields, which later ones override.
      if (ts.isSpreadAssignment(property)) {
        const spread = evaluate(property.expression, context, depth + 1)
        if (typeof spread === "object" && spread !== null && !Array.isArray(spread)) Object.assign(object, spread)
        continue
      }
      const key =
        property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? property.name.text
          : undefined
      if (!key) continue
      let value: unknown
      if (ts.isPropertyAssignment(property)) value = evaluate(property.initializer, context, depth + 1)
      else if (ts.isShorthandPropertyAssignment(property)) value = evaluate(property.name, context, depth + 1)
      if (value !== undefined) object[key] = value
    }
    return object
  }
  // A call of one of the package's own functions (`createTreeCollection({ rootNode })`), with arguments the file spells
  // out, as a value the canvas makes by calling it; not a hook, which only runs inside a component. A function among
  // the options is left out, so the package's default is used.
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    const callee = context.imports?.get(expression.expression.text)
    if (!callee || !/^[a-z]/.test(callee.export) || /^use[A-Z]/.test(callee.export)) return undefined
    const args = expression.arguments.map((argument) => evaluate(argument, context, depth + 1))
    if (args.some((argument) => argument === undefined)) return undefined
    return { $call: { import: callee.import, export: callee.export }, ...(args.length > 0 ? { args } : {}) }
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    const object = evaluate(expression.expression, context, depth + 1)
    const key = ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : evaluate(expression.argumentExpression, context, depth + 1)
    if (typeof object !== "object" || object === null || (typeof key !== "string" && typeof key !== "number")) {
      return undefined
    }
    return (object as Record<string | number, unknown>)[key]
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
    children.reduce((sum, child) => {
      if (typeof child === "string") return sum
      return sum + (isSampleRender(child) ? sampleWeight({ children: child.$render }) : sampleWeight(child))
    }, 0)
  )
}

/** A component's family: its namespace (`Dialog` for `Dialog.Title`), else the first word of its name. */
export function familyOf(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot !== -1) return name.slice(0, dot)
  // A plural is its singular's family (`Tabs` with `TabList` and `Tab`).
  const word = /^[A-Z][a-z0-9]*/.exec(name)?.[0] ?? name
  return /[^s]s$/.test(word) ? word.slice(0, -1) : word
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

/** A parent the examples put a part in, outermost first, and the share of its placed uses that have it. */
export interface ExampleLevel {
  parent: string
  share: number
}

/**
 * The parents the examples put a component in, at any depth, outermost first: every library ancestor at least half
 * its placed uses have, in the order they're usually nested. A level some examples leave out (`DropdownMenuGroup`)
 * is still here when most have it, with its share, so it can be marked optional. As with `nearestParent`, most uses
 * must be placed at all, and `sameFamily` keeps only its own family's. `share` lowers the share a level needs, for a
 * part that fails without a level fewer than half show (`Slider.Control`). Shares are counted per file, so one long
 * demo can't outvote ten short ones, and per use, so a level most uses show isn't lost; a level either count keeps
 * is kept, with the larger share.
 */
export function exampleLevels(
  uses: Map<string, ExampleUse>,
  name: string,
  sameFamily: boolean,
  share = 0.5
): ExampleLevel[] | undefined {
  const use = uses.get(name)
  if (!use || use.paths.length === 0) return undefined
  const family = familyOf(name)
  const count = (all: string[][]) => {
    const paths = all.map((path) => (sameFamily ? path.filter((parent) => familyOf(parent) === family) : path))
    const placed = paths.filter((path) => path.length > 0)
    if (placed.length * 2 < paths.length) return []
    const seen = new Map<string, { count: number; depth: number }>()
    for (const path of placed) {
      path.forEach((parent, depth) => {
        const entry = seen.get(parent) ?? { count: 0, depth: 0 }
        entry.count++
        entry.depth += depth
        seen.set(parent, entry)
      })
    }
    return [...seen]
      .filter(([, entry]) => entry.count >= placed.length * share)
      .map(([parent, entry]) => ({ parent, share: entry.count / placed.length, depth: entry.depth / entry.count }))
  }
  const merged = new Map<string, { parent: string; share: number; depth: number }>()
  for (const level of [...count(use.paths), ...count(use.usePaths)]) {
    const known = merged.get(level.parent)
    if (!known || level.share > known.share) merged.set(level.parent, level)
  }
  const levels = [...merged.values()]
    .sort((a, b) => b.depth - a.depth)
    .slice(-8)
    .map(({ parent, share }) => ({ parent, share }))
  return levels.length > 0 ? levels : undefined
}

/** A sample with only its own family's components in it, as text where others were. */
export function familySample(
  sample: ComponentSample,
  family: string,
  familyIn: (name: string) => string = familyOf
): ComponentSample {
  const keep = (child: SampleChild): SampleChild | undefined => {
    if (typeof child === "string") return child
    if (isSampleRender(child)) {
      const inner = child.$render.flatMap((item) => keep(item) ?? [])
      return inner.length > 0 ? { ...child, $render: inner } : undefined
    }
    return familyIn(child.component) === family
      ? { ...child, ...(child.children ? { children: child.children.flatMap((inner) => keep(inner) ?? []) } : {}) }
      : undefined
  }
  const children = (sample.children ?? []).flatMap((child) => keep(child) ?? [])
  return { ...(sample.props ? { props: sample.props } : {}), ...(children.length > 0 ? { children } : {}) }
}
