import { createHash } from "node:crypto"
import { readdir, stat } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import type { FileStamp, ServedLog } from "@parity-app/core"
import type * as Vite from "vite"

/*
 * What a project's builder served its pages, so a reopened project's next builder can tell whether the pages' copies
 * are current (see `@parity-app/core`'s served.ts). Each module is noted once its response is sent, with the files Vite
 * made it from: its own file and what it imports, which for a stylesheet includes every file Tailwind scanned.
 */

/** A file's time and size, or null when it's missing. */
export async function stampOf(path: string): Promise<FileStamp> {
  try {
    const found = await stat(path)
    return { mtime: found.mtimeMs, size: found.size }
  } catch {
    return null
  }
}

export async function stampsOf(paths: Iterable<string>): Promise<Record<string, FileStamp>> {
  return Object.fromEntries(await Promise.all([...new Set(paths)].map(async (path) => [path, await stampOf(path)])))
}

export function hashCode(code: string): string {
  return createHash("sha1").update(code).digest("base64url")
}

/** A served URL as Vite's module graph knows it: `/@id/` URLs name a module by id, `__x00__` standing for `\0`. */
export function moduleUrl(url: string): string {
  return url.startsWith("/@id/") ? url.slice("/@id/".length).replace("__x00__", "\0") : url
}

const lockfiles = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock"]

/**
 * Files every module the server makes depends on: its config and what that imports, the lockfile Vite hashes its
 * prebundled dependencies by (in the root or any folder above), the environment files `import.meta.env` comes from,
 * and the root's package.json and TypeScript configs. A change to one of them makes every module new.
 */
export async function buildFiles(config: Vite.ResolvedConfig): Promise<string[]> {
  const root = config.root
  const files = [join(root, "package.json")]
  if (config.configFile) files.push(config.configFile, ...config.configFileDependencies)
  for (let folder = root; ; folder = dirname(folder)) {
    files.push(...lockfiles.map((name) => join(folder, name)))
    if (dirname(folder) === folder) break
  }
  const envDir = (config as { envDir?: string | false }).envDir
  if (typeof envDir === "string") {
    for (const name of [".env", ".env.local", `.env.${config.mode}`, `.env.${config.mode}.local`]) {
      files.push(join(envDir, name))
    }
  }
  const names = await readdir(root).catch(() => [] as string[])
  files.push(...names.filter((name) => /^[tj]sconfig(\..+)?\.json$/i.test(name)).map((name) => join(root, name)))
  return files
}

/** Notes each module the server sends, once, as it was sent, with the files it was made from. */
export function servedModules(log: ServedLog): Vite.Plugin {
  return {
    name: "parity:served-modules",
    apply: "serve",
    configureServer(server) {
      const graph = server.environments.client.moduleGraph
      const noting = new Set<string>()
      const note = async (url: string) => {
        const module = await graph.getModuleByUrl(moduleUrl(url)).catch(() => undefined)
        const code = module?.transformResult?.code
        if (!module || code === undefined || log.has(module.url) || noting.has(module.url)) return
        noting.add(module.url)
        const files = [module.file, ...[...module.importedModules].map((imported) => imported.file)].filter(
          (file): file is string => !!file && isAbsolute(file)
        )
        log.serve(module.url, code, await stampsOf(files))
        noting.delete(module.url)
      }
      // Before Vite's own middleware, so each response is seen; noted once sent, when Vite has made the module.
      server.middlewares.use((request, response, next) => {
        if (request.method === "GET") {
          response.once("finish", () => {
            if ((response.statusCode === 200 || response.statusCode === 304) && request.url) void note(request.url)
          })
        }
        next()
      })
    }
  }
}

/** Makes a served module again, as it would be served now, for the log to compare with what was served. */
export async function remake(server: Vite.ViteDevServer, url: string): Promise<string | undefined> {
  const client = server.environments.client
  const module = await client.moduleGraph.getModuleByUrl(url)
  if (module) client.moduleGraph.invalidateModule(module)
  return (await client.transformRequest(url))?.code
}
