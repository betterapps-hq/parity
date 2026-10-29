// Reads components with the TypeScript checker off the service's main thread: it can take seconds on a large project.
import { statSync } from "node:fs"
import { freemem } from "node:os"
import { resolve } from "node:path"
import { parentPort } from "node:worker_threads"
import { type CheckResult, componentOptions, reactFinder, reactProbe, readTsconfig, withReactProbe } from "@parity/code"
import type { ComponentSource } from "@parity/core"
import ts from "typescript"

/**
 * What's asked of the worker. `known` comes with a project's first request to a worker started again after one that
 * stopped while idle: the app's files that one's program had read, so this one's reads them too.
 */
type Request =
  | {
      id: number
      kind: "props"
      root: string
      components: Record<string, ComponentSource>
      files?: string[]
      known?: string[]
    }
  | { id: number; kind: "check"; root: string; files: string[]; known?: string[] }
  | { id: number; kind: "close"; root: string }

parentPort?.on("message", (request: Request) => {
  try {
    const result =
      request.kind === "close"
        ? void checkers.delete(request.root)
        : request.kind === "check"
          ? check(request.root, request.files, request.known ?? [])
          : props(request.root, request.components, [...(request.files ?? []), ...(request.known ?? [])])
    parentPort?.postMessage({ id: request.id, result })
  } catch (error) {
    parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) })
  }
})

/** How components are found and their props read: React's, the one renderer so far. */
const finder = reactFinder

/**
 * The components the app's files export, as TypeScript's checker sees them: what each export's type is, not how it's
 * written, so aliases such as `const Select = SelectPrimitive.Root` and components returning only `children` count.
 * The capitalised exports it leaves out come with why.
 */
function check(root: string, files: string[], known: string[]): CheckResult {
  return finder.check(
    root,
    files,
    programFor(
      root,
      [...files, ...known].map((file) => resolve(root, file))
    )
  )
}

/** Each component's props, from the project's program, which also gets the app's `files` the checker reads next. */
function props(root: string, components: Record<string, ComponentSource>, files: string[]) {
  const program = programFor(root, [
    ...finder.propsFiles(root, components),
    ...files.map((file) => resolve(root, file))
  ])
  return finder.props(root, components, program)
}

/** A project's checker: one program for listing components and reading props, rebuilt only when its files change. */
interface Checker {
  options: ts.CompilerOptions
  host: ts.CompilerHost
  rootNames: Set<string>
  program?: ts.Program
  /** The project's own files the program read, with when each last changed. */
  read: Map<string, number>
  used: number
}

const checkers = new Map<string, Checker>()
/** Projects whose checkers are kept between requests; the least recently used beyond this is let go. */
const keptCheckers = 2
/** Below this much free memory a new program isn't built, and components stay as the parse found them. */
const minimumFreeMb = 1024

function programFor(root: string, files: string[]): ts.Program {
  let checker = checkers.get(root)
  if (!checker) {
    const options = componentOptions({ allowImportingTsExtensions: true, ...readTsconfig(root).app?.options })
    checker = {
      options,
      host: withReactProbe(cachingHost(options), root),
      rootNames: new Set(),
      read: new Map(),
      used: 0
    }
    checkers.set(root, checker)
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

/** Whether any of the project's own files the program read has changed since. */
function changed(checker: Checker): boolean {
  for (const [file, time] of checker.read) if (modified(file) !== time) return true
  return false
}

/**
 * A compiler host that keeps each file it parses, so a rebuilt program reuses them: installed packages' declarations,
 * most of what a program holds, are parsed once, and the project's own files again only when they change.
 */
function cachingHost(options: ts.CompilerOptions): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true)
  const parsed = new Map<string, { time: number; file: ts.SourceFile }>()
  const { getSourceFile } = host
  host.getSourceFile = (fileName, language, onError, create) => {
    const time = isInstalled(fileName) ? 0 : modified(fileName)
    const kept = parsed.get(fileName)
    if (kept && kept.time === time) return kept.file
    const file = getSourceFile.call(host, fileName, language, onError, create)
    if (file) parsed.set(fileName, { time, file })
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
