// Reads components with the TypeScript checker off the service's main thread: it can take seconds on a large project.
import { realpathSync, statSync } from "node:fs"
import { freemem } from "node:os"
import { resolve } from "node:path"
import { parentPort } from "node:worker_threads"
import {
  type CheckResult,
  type ConfigChange,
  configChange,
  type ConfigInputs,
  configInputs,
  type ConfigStamps,
  componentOptions,
  reactFinder,
  reactProbe,
  readTsconfig,
  withReactProbe
} from "@parity-app/code"
import type { ComponentInfo, ComponentSource } from "@parity-app/core"
import ts from "typescript"

/**
 * What's asked of the worker. `known` comes with a project's first request to a worker started again after one that
 * stopped while idle: the app's files that one's program had read, so this one's reads them too. `lockfiles` are the
 * project's lockfiles as `findLockfiles` finds them now, relative to the root.
 */
type Request =
  | {
      id: number
      kind: "props"
      root: string
      components: Record<string, ComponentSource>
      files?: string[]
      known?: string[]
      lockfiles: string[]
    }
  | { id: number; kind: "check"; root: string; files: string[]; known?: string[]; lockfiles: string[] }
  | { id: number; kind: "close"; root: string }

parentPort?.on("message", (request: Request) => {
  try {
    parentPort?.postMessage({ id: request.id, result: answer(request) })
  } catch (error) {
    parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) })
  }
})

/** Answers one request as the worker thread does, exported so tests run the same code without a thread. */
export function answer(request: Request): CheckResult | Record<string, ComponentInfo> | undefined {
  if (request.kind === "close") {
    checkers.delete(request.root)
    return undefined
  }
  if (request.kind === "check") return check(request.root, request.files, request.known ?? [], request.lockfiles)
  const files = [...(request.files ?? []), ...(request.known ?? [])]
  return props(request.root, request.components, files, request.lockfiles)
}

/** How components are found and their props read: React's, the one renderer so far. */
const finder = reactFinder

/**
 * The components the app's files export, as TypeScript's checker sees them: what each export's type is, not how it's
 * written, so aliases such as `const Select = SelectPrimitive.Root` and components returning only `children` count.
 * The capitalised exports it leaves out come with why.
 */
function check(root: string, files: string[], known: string[], lockfiles: string[]): CheckResult {
  return finder.check(
    root,
    files,
    programFor(
      root,
      [...files, ...known].map((file) => resolve(root, file)),
      lockfiles
    )
  )
}

/** Each component's props, from the project's program, which also gets the app's `files` the checker reads next. */
function props(
  root: string,
  components: Record<string, ComponentSource>,
  files: string[],
  lockfiles: string[]
): Record<string, ComponentInfo> {
  const program = programFor(
    root,
    [...finder.propsFiles(root, components), ...files.map((file) => resolve(root, file))],
    lockfiles
  )
  return finder.props(root, components, program)
}

/**
 * A project's checker: one program for listing components and reading props, rebuilt when its files change, and made
 * again from the project's config, its compiler options read afresh, when one of the config inputs changes.
 */
interface Checker {
  options: ts.CompilerOptions
  host: ts.CompilerHost
  /** The files its host parsed. A checker made again after a config change keeps installed packages' ones. */
  parsed: ParseCache
  rootNames: Set<string>
  program?: ts.Program
  /** The project's own files the program read, with when each last changed. */
  read: Map<string, number>
  /** The tsconfigs, package.json and lockfiles its options and installed declarations come from, and how they stood. */
  inputs: ConfigInputs
  stamps: ConfigStamps
  used: number
}

/** Parsed files by the settings they were parsed with and their path, with when each last changed (0 if installed). */
type ParseCache = Map<string, { time: number; file: ts.SourceFile }>

const checkers = new Map<string, Checker>()
/** Projects whose checkers are kept between requests; the least recently used beyond this is let go. */
const keptCheckers = 2
/** Below this much free memory a new program isn't built, and components stay as the parse found them. */
const minimumFreeMb = 1024

function programFor(root: string, files: string[], lockfiles: string[]): ts.Program {
  let checker = checkers.get(root)
  if (!checker) checker = newChecker(root, lockfiles)
  else {
    const stamps = stampInputs(root, { ...checker.inputs, lockfiles })
    const change = configChange(checker.stamps, stamps)
    if (change !== "none") checker = newChecker(root, lockfiles, { checker, change, stamps })
  }
  checker.used = Date.now()
  const before = checker.rootNames.size
  for (const file of files) checker.rootNames.add(resolve(file).replaceAll("\\", "/"))
  if (checker.program && checker.rootNames.size === before && !changed(checker)) return checker.program
  // Files deleted since aren't asked for again.
  for (const name of checker.rootNames) if (modified(name) === -1) checker.rootNames.delete(name)
  const free = freemem() / 2 ** 20
  if (free < minimumFreeMb) {
    throw new Error(
      `Only ${Math.round(free)} MB of memory is free, so the type checker didn't run. Components are as the parse found them.`
    )
  }
  checker.program = ts.createProgram({
    rootNames: [...checker.rootNames, reactProbe(root)],
    options: checker.options,
    host: checker.host,
    ...(checker.program ? { oldProgram: checker.program } : {})
  })
  checker.read = new Map(
    checker.program
      .getSourceFiles()
      .filter((file) => !isInstalled(file.fileName))
      .map((file) => [file.fileName, modified(file.fileName)])
  )
  for (const [other, kept] of [...checkers].sort(([, a], [, b]) => b.used - a.used).slice(keptCheckers)) {
    if (kept !== checker) checkers.delete(other)
  }
  return checker.program
}

/**
 * Makes a project's checker from its config as it is now. One made again after a `change` keeps the files earlier
 * requests asked for and, unless the dependencies changed, the installed packages' declarations it had parsed.
 */
function newChecker(
  root: string,
  lockfiles: string[],
  previous?: { checker: Checker; change: ConfigChange; stamps: ConfigStamps }
): Checker {
  const tsconfig = readTsconfig(root)
  const options = componentOptions({ allowImportingTsExtensions: true, ...tsconfig.app?.options })
  const inputs = configInputs(tsconfig, lockfiles)
  const stamps = stampInputs(root, inputs)
  // An input stamped before the configs were read keeps that stamp, so a change made while they were read is seen next.
  for (const kind of ["configs", "lockfiles"] as const) {
    for (const path of Object.keys(stamps[kind])) {
      const before = previous?.stamps[kind][path]
      if (before !== undefined) stamps[kind][path] = before
    }
  }
  const parsed: ParseCache = new Map()
  if (previous && previous.change !== "dependencies") {
    for (const [key, kept] of previous.checker.parsed) if (kept.time === 0) parsed.set(key, kept)
  }
  const checker: Checker = {
    options,
    host: withReactProbe(cachingHost(options, parsed), root),
    parsed,
    rootNames: previous?.checker.rootNames ?? new Set(),
    read: new Map(),
    inputs,
    stamps,
    used: 0
  }
  checkers.set(root, checker)
  return checker
}

/** How each config input stands now. Tsconfigs are relative to the root's real path, as the config reader lists them. */
function stampInputs(root: string, inputs: ConfigInputs): ConfigStamps {
  const realRoot = realPath(root)
  const stamp = (base: string, paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, stampOf(resolve(base, path))]))
  return { configs: stamp(realRoot, inputs.configs), lockfiles: stamp(root, inputs.lockfiles) }
}

function stampOf(path: string): string {
  try {
    const stats = statSync(path)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return "missing"
  }
}

function realPath(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/** Whether any of the project's own files the program read has changed since. */
function changed(checker: Checker): boolean {
  for (const [file, time] of checker.read) if (modified(file) !== time) return true
  return false
}

/**
 * A compiler host that keeps each file it parses in `parsed`, so a rebuilt program reuses them: installed packages'
 * declarations, most of what a program holds, are parsed once until a lockfile changes, and the project's own files
 * again only when they change. Each is kept under the settings it was parsed with, which a config change can change.
 */
function cachingHost(options: ts.CompilerOptions, parsed: ParseCache): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, language, onError, create) => {
    const time = isInstalled(fileName) ? 0 : modified(fileName)
    const settings =
      typeof language === "object" ? `${language.languageVersion}:${language.impliedNodeFormat ?? ""}` : `${language}`
    const key = `${settings}:${fileName}`
    const kept = parsed.get(key)
    if (kept && kept.time === time) return kept.file
    const file = getSourceFile(fileName, language, onError, create)
    if (file) parsed.set(key, { time, file })
    return file
  }
  return host
}

function isInstalled(fileName: string): boolean {
  return fileName.includes("/node_modules/")
}

function modified(fileName: string): number {
  try {
    return statSync(fileName).mtimeMs
  } catch {
    return -1
  }
}
