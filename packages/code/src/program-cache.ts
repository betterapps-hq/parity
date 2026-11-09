import { createHash } from "node:crypto"
import { readFileSync, realpathSync, statSync } from "node:fs"
import { freemem } from "node:os"
import { dirname, resolve } from "node:path"
import type { ComponentInfo } from "@parity-app/core"
import ts from "typescript"
import { type ConfigChange, configChange, type ConfigInputs, configInputs, type ConfigStamps } from "./config-inputs.ts"
import type { ComponentFinder } from "./finder.ts"
import type { CheckResult, ComponentSources } from "./listing.ts"
import { readTsconfig } from "./tsconfig.ts"

/** A request for a project's program. Files are relative to the root, or absolute; lockfiles are relative to it. */
export interface ProgramRequest {
  root: string
  /** The files the program reads, with what they import. Files earlier requests asked for are read too. */
  files: readonly string[]
  /** The project's lockfiles as they're found now, so one appearing or changing is seen. */
  lockfiles: readonly string[]
}

/** Which of the app's `files` export components. `known` are files an earlier program read, to read again. */
export interface CheckRequest {
  root: string
  files: readonly string[]
  known?: readonly string[]
  lockfiles: readonly string[]
}

/** Each of `components`' props. `files` are the app's files the checker reads next, read now so both share a program. */
export interface PropsRequest {
  root: string
  components: ComponentSources
  files?: readonly string[]
  known?: readonly string[]
  lockfiles: readonly string[]
}

export interface ProgramCacheOptions {
  /** Projects whose programs are kept between requests; the least recently used beyond this is let go. Two by default. */
  kept?: number
  /** Below this much free memory, in MB, a new program isn't built. A gigabyte by default. */
  minimumFreeMb?: number
  /** How much memory is free, in MB. The system's, by default. */
  freeMb?: () => number
}

/**
 * One TypeScript program per project, kept between requests, serving a finder's check and props. A program is built
 * again, reusing what it can, when a file it read changes or a request adds files, and made afresh from the project's
 * config when a tsconfig, its `package.json` or a lockfile changes.
 */
export interface ProgramCache {
  program(request: ProgramRequest): ts.Program
  check(request: CheckRequest): CheckResult
  props(request: PropsRequest): Record<string, ComponentInfo>
  /** Lets go of a project's program. */
  close(root: string): void
  /** The projects whose programs are kept, most recently used first. */
  roots(): string[]
}

/**
 * A project's checker: one program for listing components and reading props, rebuilt when its files change, and made
 * again from the project's config, its compiler options read afresh, when one of the config inputs changes.
 */
interface Checker {
  options: ts.CompilerOptions
  host: ts.CompilerHost
  /** Files every program holds besides the app's, such as React's probe. */
  extraRoots: string[]
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

export function programCache(finder: ComponentFinder, settings: ProgramCacheOptions = {}): ProgramCache {
  const kept = settings.kept ?? 2
  const minimumFreeMb = settings.minimumFreeMb ?? 1024
  const freeMb = settings.freeMb ?? (() => freemem() / 2 ** 20)
  const checkers = new Map<string, Checker>()
  let uses = 0

  /**
   * Makes a project's checker from its config as it is now. One made again after a `change` keeps the files earlier
   * requests asked for and, unless the dependencies changed, the installed packages' declarations it had parsed.
   */
  function newChecker(
    root: string,
    lockfiles: readonly string[],
    previous?: { checker: Checker; change: ConfigChange; stamps: ConfigStamps }
  ): Checker {
    const tsconfig = readTsconfig(root)
    const setup = finder.programSetup(root, tsconfig)
    const inputs = configInputs(tsconfig, [...lockfiles])
    const stamps = stampInputs(root, inputs)

    // An input stamped before the configs were read keeps that stamp, so a change made while they were read is seen next.
    for (const kind of ["configs", "lockfiles"] as const) {
      for (const path of Object.keys(stamps[kind])) {
        const before = previous?.stamps[kind][path]

        if (before !== undefined) {
          stamps[kind][path] = before
        }
      }
    }

    const parsed: ParseCache = new Map()

    if (previous) {
      // TypeScript's own lib files come with Parity's TypeScript, not the project's dependencies, so they're kept too.
      const lib = `${dirname(ts.getDefaultLibFilePath(setup.options)).replaceAll("\\", "/")}/`

      for (const [key, kept] of previous.checker.parsed) {
        if (kept.time !== 0) {
          continue
        }

        if (previous.change === "config" || kept.file.fileName.startsWith(lib)) {
          parsed.set(key, kept)
        }
      }
    }

    const checker: Checker = {
      options: setup.options,
      host: setup.host(cachingHost(setup.options, parsed)),
      extraRoots: setup.rootNames,
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

  function program({ root, files, lockfiles }: ProgramRequest): ts.Program {
    let checker = checkers.get(root)

    if (!checker) {
      checker = newChecker(root, lockfiles)
    } else {
      const stamps = stampInputs(root, { ...checker.inputs, lockfiles: [...lockfiles] })
      const change = configChange(checker.stamps, stamps)

      if (change !== "none") {
        checker = newChecker(root, lockfiles, { checker, change, stamps })
      }
    }

    checker.used = ++uses
    const before = checker.rootNames.size

    for (const file of files) {
      checker.rootNames.add(resolve(root, file).replaceAll("\\", "/"))
    }

    if (checker.program && checker.rootNames.size === before && !changed(checker)) {
      return checker.program
    }

    // Files deleted since aren't asked for again.
    for (const name of checker.rootNames) {
      if (modified(name) === -1) {
        checker.rootNames.delete(name)
      }
    }

    const free = freeMb()

    if (free < minimumFreeMb) {
      throw new Error(
        `Only ${Math.round(free)} MB of memory is free, so the type checker didn't run. Components are as the parse found them.`
      )
    }

    checker.program = ts.createProgram({
      rootNames: [...checker.rootNames, ...checker.extraRoots],
      options: checker.options,
      host: checker.host,
      oldProgram: checker.program
    })
    checker.read = new Map(
      checker.program
        .getSourceFiles()
        .filter((file) => !isInstalled(file.fileName))
        .map((file) => [file.fileName, modified(file.fileName)])
    )

    for (const [other] of [...checkers].sort(([, a], [, b]) => b.used - a.used).slice(kept)) {
      if (other !== root) {
        checkers.delete(other)
      }
    }

    return checker.program
  }

  return {
    program,
    check: ({ root, files, known = [], lockfiles }) =>
      finder.check(root, [...files], program({ root, files: [...files, ...known], lockfiles })),
    props: ({ root, components, files = [], known = [], lockfiles }) =>
      finder.props(
        root,
        components,
        program({ root, files: [...finder.propsFiles(root, components), ...files, ...known], lockfiles })
      ),
    close: (root) => void checkers.delete(root),
    roots: () => [...checkers].sort(([, a], [, b]) => b.used - a.used).map(([root]) => root)
  }
}

/** How each config input stands now. Tsconfigs are relative to the root's real path, as the config reader lists them. */
function stampInputs(root: string, inputs: ConfigInputs): ConfigStamps {
  const realRoot = realPath(root)

  const stamp = (base: string, paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, stampOf(resolve(base, path))]))

  return { configs: stamp(realRoot, inputs.configs), lockfiles: stamp(root, inputs.lockfiles) }
}

/** Files this small are stamped by their contents too, so a rewrite within one tick of a coarse clock still shows. */
const hashedBytes = 1024 * 1024

/** An input's size and modification time, and a hash of its contents unless it's large, as a lockfile can be. */
function stampOf(path: string): string {
  try {
    const stats = statSync(path)
    const stamp = `${stats.mtimeMs}:${stats.size}`

    if (stats.size > hashedBytes) {
      return stamp
    }

    return `${stamp}:${createHash("sha1").update(readFileSync(path)).digest("hex")}`
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
  for (const [file, time] of checker.read) {
    if (modified(file) !== time) {
      return true
    }
  }

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
      language instanceof Object ? `${language.languageVersion}:${language.impliedNodeFormat ?? ""}` : `${language}`

    const key = `${settings}:${fileName}`
    const kept = parsed.get(key)

    if (kept && kept.time === time) {
      return kept.file
    }

    const file = getSourceFile(fileName, language, onError, create)

    if (file) {
      parsed.set(key, { time, file })
    }

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
