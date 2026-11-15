import { createHash } from "node:crypto"
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type { BuilderSession, BuilderStartOptions, CodeChange } from "@parity-app/core"
import { gatherChanges } from "@parity-app/project"
import { componentModuleSource, guestFiles, guestModuleSource } from "./browser-modules.ts"
import type { Bundler, BundlerCompilation, BundlerConfig, BundlerStats } from "./bundler.ts"
import { writeElementSourcesLoader, writeGuestAddressLoader } from "./element-sources.ts"
import { changedComponents, entryImports, filePath, loadedFiles, providedExports } from "./graph.ts"
import { guestConfig } from "./guest-config.ts"
import { componentPath, entryPath, guestEntrySource, isSourcePath, loadablePaths } from "./guest-entry.ts"
import { freePort, portFree, serveGuest } from "./server.ts"

/** What starts a guest build: the bundler and config the project's own tool gives, and what Parity asks for. */
export interface BundledGuestOptions {
  bundler: Bundler
  /** The project's config, as its tool resolved it: a webpack-shaped config object. */
  config: BundlerConfig
  start: BuilderStartOptions
}

/** How long a component found since the guest loaded may take to come into its build. */
const addedWithin = 30_000

/**
 * Builds the guest with the project's own bundler and config in watch mode, and serves it to the canvas: the
 * `BuilderSession` a webpack-shaped builder gives. Its first build has to finish before this settles, so the canvas's
 * first request isn't the one that waits.
 */
export async function startBundledGuest({ bundler, config, start }: BundledGuestOptions): Promise<BuilderSession> {
  // The bundler is given paths as the system writes them; the module graph's are compared with forward slashes.
  const root = await realpath(start.root)
  const graphRoot = root.replaceAll("\\", "/")
  const renderer = await realpath(start.rendererGuestPath)
  const port = start.port !== undefined && (await portFree(start.port)) ? start.port : await freePort()
  const origin = `http://127.0.0.1:${port}`
  const key = `parity_guest_${port}`
  // A folder of the builder's own: the project's dev server, often running alongside, keeps its cache.
  const folder = join(root, "node_modules", ".cache", `parity-${bundler.name.toLowerCase()}`)
  const output = join(folder, "out")
  await mkdir(folder, { recursive: true })

  // Each build starts from an empty folder; after that, earlier builds' hot updates stay for a page that's behind.
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  const loader = await writeElementSourcesLoader(folder, root)
  const guestUrl = `${origin}/guest.js`
  const addressLoader = await writeGuestAddressLoader(folder, guestUrl)
  const entry = join(folder, "guest-entry.js")
  const extra = new Set<string>()
  /** The paths the entry, as last written, can load: discovery changes `start.config` before the entry is rewritten. */
  let written = new Set<string>()

  const writeEntry = async () => {
    const paths = new Set(loadablePaths(start.config, [...extra]))
    await writeFile(entry, guestEntrySource(start.config, { root, renderer, key, extra: [...extra] }), "utf8")
    written = paths
  }

  await writeEntry()

  const compiler = bundler.compiler(
    guestConfig(config, bundler, {
      root,
      entry,
      styles: start.config.styles.map((path) => entryPath(root, path)),
      packageStyles: start.config.packageStyles ?? [],
      output,
      publicPath: `${origin}/`,
      key,
      elementSources: loader.file,
      renderer: { file: renderer, loader: addressLoader },
      componentExtensions: [".tsx", ".jsx", ".ts", ".js"],
      dedupe: dedupedPackages(root, start.renderer.runtimePackages),
      standIns: start.renderer.developmentStandIns ?? {}
    })
  )

  const build = buildState()
  const listeners = new Set<(change: CodeChange) => void>()

  const changes = gatherChanges((change) => {
    for (const listener of listeners) {
      listener(change)
    }
  })

  let cssDigest: string | undefined

  /** How many times the build has been invalidated: a build's results only count if no newer build has started. */
  let invalidations = 0

  compiler.hooks.invalid.tap("parity:guest", () => {
    invalidations++
    build.invalidated()
  })
  compiler.hooks.failed.tap("parity:guest", (error) => build.failed(error))
  compiler.hooks.done.tap("parity:guest", (stats) => {
    const first = build.compilation === undefined

    const components = Object.values(start.config.components)
      .filter((component) => !component.library)
      .map((component) => component.path)

    // Each changed file's components, read now: the compilation is the bundler's to reuse once the next build starts.
    const reached = new Map(
      [...(compiler.modifiedFiles ?? []), ...(compiler.removedFiles ?? [])].flatMap((file) =>
        filePath(file) === filePath(entry)
          ? []
          : [[file, changedComponents(stats.compilation, graphRoot, [file], components)] as const]
      )
    )

    // The CSS of the components' chunks, as this build named them; earlier builds' files stay for pages behind.
    const componentCss = [...stats.compilation.chunks].flatMap((chunk) =>
      chunk.name === "styles" || chunk.name === "package-styles"
        ? []
        : [...chunk.files].filter((file) => file.endsWith(".css")).sort()
    )

    const at = invalidations

    // The canvas reads the gathered CSS once the build is done.
    void gatherCss(output, componentCss)
      .then(() => {
        if (invalidations === at) {
          build.done(stats)
        }

        return Promise.all([cssOf(output), changedSince(reached.keys(), watchStarted)])
      })
      .then(([digest, changed]) => {
        const restyled = cssDigest !== undefined && digest !== cssDigest
        cssDigest = digest

        if (first) {
          return
        }

        const paths = changed.flatMap((file) => reached.get(file)!)
        changes.stamp()
        changes.add({ paths: [...new Set(paths)], styles: restyled })
      })
  })

  const watchStarted = Date.now()
  // Failures come through the `failed` hook.
  const watching = compiler.watch({ aggregateTimeout: 50, ignored: watchIgnored }, () => undefined)

  const close = async () => {
    changes.stop()
    loader.stop()
    await new Promise<void>((resolve) => watching.close(() => resolve()))
    await new Promise<void>((resolve) => compiler.close(() => resolve()))
  }

  try {
    const stats = await build.first

    if (!(await readFile(join(output, guestFiles.main)).catch(() => undefined))) {
      throw new Error(
        `${bundler.name} didn't build the guest: ${stats.toString({ all: false, errors: true, colors: false })}`
      )
    }
  } catch (error) {
    await close()
    throw error
  }

  /** A component's module, once the build has it: added to the guest's entry first if it isn't there. */
  const component = async (path: string): Promise<string> => {
    if (!written.has(path)) {
      extra.add(path)
      await writeEntry()
      // The module may be in the build already, as another's import: it's the rewritten entry's build that loads it.
      await build.until(
        (compilation) => entryImports(compilation, filePath(entry), entryPath(graphRoot, path)),
        addedWithin
      )
    }

    const compilation = await build.settled()
    const names = providedExports(compilation, entryPath(graphRoot, path)) ?? exportsInConfig(start.config, path)

    return componentModuleSource(key, path, names)
  }

  const server = await serveGuest({
    port,
    output,
    // What the tool's dev server serves as it is, as `public/images/photo.jpg` at `/images/photo.jpg`.
    folders: [join(root, "public")],
    allowedOrigins: start.allowedOrigins,
    ready: () => build.settled().then(() => undefined),
    module: async (url) => {
      if (url.pathname === `/guest.js`) {
        return guestModuleSource(key)
      }

      // A component found since the guest loaded may come without a stamp.
      const path = componentPath(decodeURIComponent(url.pathname))

      const loadable = loadablePaths(start.config, [...extra]).includes(path)

      // A stamped request for a module of the project's own, which the canvas may know before discovery does; a stamped
      // public file (`/images/photo.png?t=1`) is served as it is.
      const stampedSource =
        url.searchParams.has("t") &&
        isSourcePath(path) &&
        (await stat(join(root, path)).then(
          (stats) => stats.isFile(),
          () => false
        ))

      return loadable || stampedSource ? component(path) : undefined
    }
  })

  return {
    guestUrl,
    toolVersion: bundler.version,
    restyledGuestUrl: (stamp) => `${guestUrl}?styles=${stamp}`,
    loadedFiles: async (files) => loadedFiles(await build.settled(), graphRoot, files),
    codeChanges(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await close()
    }
  }
}

/** The names the project's components in a file are exported by, for a module the bundler can't name the exports of. */
function exportsInConfig(config: BuilderStartOptions["config"], path: string): string[] {
  return Object.values(config.components)
    .filter((source) => !source.library && componentPath(source.path) === path)
    .map((source) => source.export.split(".")[0]!)
}

/**
 * The folder the project resolves each of the renderer's runtime packages to (React's), so the guest's modules all share
 * that copy. A package the project doesn't have is left to the bundler.
 */
function dedupedPackages(root: string, packages: readonly string[]): Record<string, string> {
  const require = createRequire(join(root, "package.json"))

  return Object.fromEntries(
    packages.flatMap((name) => {
      try {
        return [[name, dirname(require.resolve(`${name}/package.json`))]]
      } catch {
        return []
      }
    })
  )
}

/**
 * The files among `files` written or deleted since `since`: a watcher's first rebuild can name every file it watches as
 * changed or removed, whatever their age, and only those written since it started, or gone, have changed.
 */
async function changedSince(files: Iterable<string>, since: number): Promise<string[]> {
  const list = [...files]

  const times = await Promise.all(
    list.map((file) =>
      stat(file).then(
        (stats) => stats.mtimeMs,
        () => Number.POSITIVE_INFINITY
      )
    )
  )

  return list.filter((_, index) => times[index]! >= since)
}

/**
 * What the watcher leaves alone: Git's folder and packages, as the tools do by default, but the guest's entry, which
 * lives in a package cache folder and changes when a component is added to it.
 */
export const watchIgnored = /[\\/](?:\.git[\\/]|node_modules[\\/](?!\.cache[\\/]parity-[^\\/]+[\\/]guest-entry\.js$))/

/** Writes the CSS files `files`, in the output folder, as one, for the guest module to read. */
async function gatherCss(output: string, files: readonly string[]): Promise<void> {
  const texts = await Promise.all(files.map((file) => readFile(join(output, file), "utf8").catch(() => "")))
  await writeFile(join(output, guestFiles.componentStyles), texts.filter(Boolean).join("\n"), "utf8")
}

/** A digest of the CSS the build wrote, which changes when any of it does, whatever changed it. */
async function cssOf(output: string): Promise<string> {
  const hash = createHash("sha1")

  for (const file of [guestFiles.styles, guestFiles.packageStyles, guestFiles.componentStyles]) {
    hash.update(await readFile(join(output, file)).catch(() => Buffer.alloc(0)))
    hash.update("\0")
  }

  return hash.digest("hex")
}

/** Where the watch build is: building, or done with a compilation, and who's waiting for what. */
function buildState() {
  let building = true
  let compilation: BundlerCompilation | undefined
  let error: Error | undefined
  const waiting = new Set<() => void>()
  const { promise: first, resolve: settleFirst, reject: failFirst } = Promise.withResolvers<BundlerStats>()

  const wake = () => {
    // A waiter takes itself out as it finishes, which a Set's iteration allows.
    for (const wait of waiting) {
      wait()
    }
  }

  return {
    first,
    get compilation() {
      return compilation
    },
    invalidated() {
      building = true
    },
    failed(cause: Error) {
      building = false
      error = cause
      failFirst(cause)
      wake()
    },
    done(stats: BundlerStats) {
      building = false
      error = undefined
      compilation = stats.compilation
      settleFirst(stats)
      wake()
    },
    /** The latest compilation, once nothing is building. */
    settled(): Promise<BundlerCompilation> {
      return this.until(() => true)
    },
    /** The first compilation, once nothing is building, that `test` passes; within `timeout` milliseconds if given. */
    until(test: (compilation: BundlerCompilation) => boolean, timeout?: number): Promise<BundlerCompilation> {
      return new Promise((resolve, reject) => {
        const timer =
          timeout === undefined ? undefined : setTimeout(() => finish(new Error("The build took too long")), timeout)

        const finish = (failure?: Error) => {
          waiting.delete(check)
          clearTimeout(timer)

          if (failure) {
            reject(failure)
          } else {
            resolve(compilation!)
          }
        }

        function check() {
          if (building) {
            return
          }

          if (error && !compilation) {
            finish(error)
          } else if (compilation && test(compilation)) {
            finish()
          }
        }

        waiting.add(check)
        check()
      })
    }
  }
}
