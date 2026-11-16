import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, posix } from "node:path"
import type { AppStyles } from "@parity-app/core"
import { chooseAppStyles, type Imported, isStylesheetFile, type Walked } from "@parity-app/project"
import { babelFromRoot } from "./babel.ts"
import type { Bundler, BundlerCompilation, BundlerConfig, BundlerModule, BundlerStats } from "./bundler.ts"
import { filePath } from "./graph.ts"

/*
 * Which global stylesheets an app loads, asked of its own bundler (`BuilderAdapter.styles`). The bundler has no list of
 * them until it has built the app, so this builds the app's entries once with the project's config, output thrown away,
 * then walks the module graph from them to the modules that import stylesheets, as Vite's walks its client graph. The
 * choice among what it finds is the one every builder makes (`chooseAppStyles`).
 */

/** The most modules followed: an app's entry reaches its root module long before this, packages included. */
const moduleLimit = 5000

/**
 * The global stylesheets the app at `root` loads, as the bundler resolves them. `config` is the project's, as its tool
 * resolved it; `configFile` is from the root, and counts among the files the answer came from.
 */
export async function bundledAppStyles(
  bundler: Bundler,
  config: BundlerConfig,
  root: string,
  configFile?: string
): Promise<AppStyles> {
  const output = await mkdtemp(join(tmpdir(), `parity-${bundler.name.toLowerCase()}-styles-`))

  try {
    const compilation = await buildOnce(bundler, {
      ...config,
      // Relative paths in the config are from where its CLI runs: the project's folder.
      context: config.context ?? root,
      mode: "development",
      devServer: undefined,
      devtool: false,
      output: { ...config.output, path: output, clean: false },
      module: { ...config.module, rules: config.module?.rules?.map((rule) => babelFromRoot(rule, root)) },
      // Its own cache, if it has one, isn't the one to write.
      cache: false
    })

    const graphRoot = root.replaceAll("\\", "/")

    const walked = walkStyles(compilation, graphRoot)

    const styles = await chooseAppStyles(walked, graphRoot, async (specifier, importer) =>
      walked.specifiers.get(`${importer}\0${specifier}`)
    )

    return configFile ? { ...styles, from: [...new Set([...styles.from, configFile])] } : styles
  } finally {
    await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

function buildOnce(bundler: Bundler, config: BundlerConfig): Promise<BundlerCompilation> {
  const compiler = bundler.compiler(config)

  return new Promise((resolve, reject) => {
    compiler.run((error, stats?: BundlerStats) => {
      compiler.close(() => {
        if (error || !stats) {
          reject(error ?? new Error(`${bundler.name} built nothing`))
        } else {
          resolve(stats.compilation)
        }
      })
    })
  })
}

/** A dynamic import loads its module later, as a route's page does: not what the app loads up front. */
function isStatic(type: string | undefined): boolean {
  return !!type && !/import\(\)|context|worker|url/.test(type)
}

/** A stylesheet the page loads as it is: not a CSS module scoped to a component, nor one read as text. */
function isGlobalStylesheet(resource: string): boolean {
  const [path, query = ""] = resource.split("?")

  return !/\.module\.[^./]+$/.test(path!) && !/(?:^|&)(?:inline|raw)(?:&|=|$)/.test(query)
}

/**
 * Walks the graph from the app's entries, a level for each of the app's own modules deep, until a level imports
 * stylesheets. A package's modules on the way, as a framework's entry reaching the app's root, count as no step deeper,
 * but what the app's own modules import from packages isn't followed: it isn't the app.
 */
export function walkStyles(
  compilation: BundlerCompilation,
  root: string
): Walked & { specifiers: Map<string, string> } {
  const graph = compilation.moduleGraph

  const own = (module: BundlerModule | null | undefined): boolean => {
    const file = module?.resource && filePath(module.resource)

    return !!file && file.startsWith(`${root}/`) && !file.includes("/node_modules/")
  }

  const found: Imported[] = []
  const read = new Set<string>()
  /** What each import of a stylesheet resolved to, by importer and specifier, as the walk met them. */
  const specifiers = new Map<string, string>()
  const seen = new Set<BundlerModule>()

  let level = [...compilation.entries.values()].flatMap((entry) =>
    entry.dependencies.flatMap((dependency) => graph.getModule(dependency) ?? [])
  )

  for (let depth = 0; level.length > 0 && found.length === 0 && seen.size < moduleLimit; depth++) {
    const deeper: BundlerModule[] = []
    let frontier = level

    while (frontier.length > 0 && seen.size < moduleLimit) {
      const batch = frontier.filter((module) => !seen.has(module))
      frontier = []

      for (const module of batch) {
        seen.add(module)
        const fromApp = own(module)

        if (fromApp) {
          read.add(filePath(module.resource!))
        }

        for (const connection of graph.getOutgoingConnections(module)) {
          const child = connection.module

          if (!child || !isStatic(connection.dependency?.type)) {
            continue
          }

          const resource = child.resource ?? ""

          if (resource && isStylesheetFile(filePath(resource))) {
            if (fromApp && isGlobalStylesheet(resource)) {
              const file = filePath(resource)
              const importer = filePath(module.resource!)
              found.push({ file, importer, depth })

              if (connection.dependency?.request) {
                specifiers.set(`${importer}\0${connection.dependency.request}`, file)
              }
            }
          } else if (own(child)) {
            deeper.push(child)
          } else if (!fromApp || !resource) {
            // A framework's or a virtual module stands for the app's code, whoever imports it.
            frontier.push(child)
          }
        }
      }
    }

    level = deeper
  }

  // Each found once, in the order the walk met them, the order the app loads them in.
  const unique = found.filter(
    (one, index) => found.findIndex((other) => other.file === one.file && other.importer === one.importer) === index
  )

  return { found: unique, read: [...read].map((file) => posix.normalize(file)), specifiers }
}
