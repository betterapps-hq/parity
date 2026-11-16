import { createHash } from "node:crypto"
import { watch } from "node:fs"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { CodeChange } from "@parity-app/core"
import { gatherChanges, isStylesheetFile, type ProjectTsconfig } from "@parity-app/project"
import { guestRoutes } from "./guest-app.ts"
import { readGuestPage } from "./page.ts"
import { isProjectSourcePath, projectImports, projectModulePage } from "./project-modules.ts"
import { exportNames } from "./project-pages.ts"
import type { NextServer } from "./server.ts"

/*
 * The canvas's modules from the project, served one at a time once Next's server is up (PAR-1159): a component found
 * since the guest loaded, and a component whose code changed, which the canvas imports again at `/<path>?t=<stamp>`. The
 * builder watches the project's files and tells the canvas which components a change reaches.
 */

/** One of the project's modules as Next built it for the canvas, for the bundler's loader to serve as an ES module. */
export interface ProjectModule {
  /** The module's file, from the project's root. */
  path: string
  /** The client module that imports it whole: its id in the bundler's runtime and the chunks that hold it. */
  reference: { id: string; chunks: string[] }
  /** The stylesheets Next links for the page, as the module's CSS modules. */
  stylesheets: string[]
  /** What the module exports, by name. */
  names: string[]
  /** The change it's loaded again after, when it is. */
  stamp?: number
}

/** How long Next has to find a page the builder has just written, before the module is taken not to build. */
const pageWait = 20_000

/** Serves the project's modules from the guest app's pages for them, which it writes as the canvas asks. */
export function projectModules(root: string, folder: string, exported: (path: string) => string[]) {
  const written = new Map<string, Promise<void>>()

  const write = (path: string) => {
    let done = written.get(path)

    if (!done) {
      done = Promise.all(
        projectModulePage(path).files.map(async (file) => {
          const target = join(folder, file.path)
          await mkdir(dirname(target), { recursive: true })

          if ((await readFile(target, "utf8").catch(() => undefined)) !== file.text) {
            await writeFile(target, file.text)
          }
        })
      ).then(() => undefined)
      written.set(path, done)
    }

    return done
  }

  return {
    /** The paths the canvas has asked for. */
    served: () => [...written.keys()],
    /** Whether a request's path names a module of the project's the canvas can load. */
    async loadable(path: string): Promise<boolean> {
      return (
        isProjectSourcePath(path) &&
        (await stat(join(root, path)).then(
          (stats) => stats.isFile(),
          () => false
        ))
      )
    },
    /** A module as Next builds it now, rendering its page, which Next finds a moment after it's first written. */
    async module(server: NextServer, path: string, stamp?: number): Promise<ProjectModule> {
      await write(path)
      const page = projectModulePage(path)
      const started = Date.now()
      let answer = await server.fetchText(page.route)

      while (answer.status === 404 && Date.now() - started < pageWait) {
        await new Promise((done) => setTimeout(done, 200))
        answer = await server.fetchText(page.route)
      }

      if (!answer.ok) {
        throw new Error(`Next couldn't build ${path} for the canvas (${answer.status})`)
      }

      const read = readGuestPage(answer.text, page.file)

      if (!read.guest) {
        throw new Error(`Next's page for ${path} doesn't name the module`)
      }

      const text = await readFile(join(root, path), "utf8")
      const names = [...new Set([...exportNames(text, path), ...exported(path)])]
      const module: ProjectModule = { path, reference: read.guest, stylesheets: read.stylesheets, names }

      return stamp === undefined ? module : { ...module, stamp }
    }
  }
}

/** The folders a change in is none of the canvas's: packages, Next's output with the guest app, and git's. */
const unwatched = new Set(["node_modules", ".next", ".git"])

/** What tells the builder which components a change reaches, and whether the guest's CSS changed with it. */
/** Watches a folder and its subfolders, as `fs.watch` does: names relative to the folder. */
export type WatchFolder = (
  folder: string,
  options: { recursive: true },
  listener: (event: string, name: string | null) => void
) => { close(): void }

export interface CodeWatch {
  root: string
  tsconfig: ProjectTsconfig
  /** The project's component files the canvas has, from the root. */
  components(): string[]
  /** A digest of the guest's compiled CSS as Next builds it now. */
  stylesDigest(): Promise<string>
  send(change: CodeChange): void
  /** The project's preview file, whose changes make the guest new (`gatherChanges`). */
  preview?: string
  /** How the folder is watched; `fs.watch` unless a test reports the changes itself. */
  watch?: WatchFolder
}

/**
 * Watches the project's files and tells the canvas each component a change reaches, through imports however deep, and
 * whether the guest's compiled CSS changed, as a stylesheet's change or a new Tailwind class does. Next builds what
 * changed when it's next asked for, so the CSS is asked for before the canvas hears.
 */
export async function watchCodeChanges(options: CodeWatch): Promise<() => void> {
  const imports = projectImports(options.root, options.tsconfig)
  const changes = gatherChanges((change) => options.send(change), undefined, options.preview)
  let digest = await options.stylesDigest().catch(() => "")
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const settle = async () => {
    const files = [...pending]
    pending.clear()

    for (const file of files) {
      imports.changed(file)
    }

    const components = options.preview ? [...options.components(), options.preview] : options.components()
    const reached = (await Promise.all(files.map((file) => imports.reaching(components, file)))).flat()

    // Any file a component imports counts, as a JSON file of data; code and stylesheets may change the compiled CSS
    // too, as a new Tailwind class does. Other files, as a README, change nothing the canvas draws.
    if (reached.length === 0 && !files.some((file) => isProjectSourcePath(file) || isStylesheetFile(file))) {
      return
    }

    const now = await options.stylesDigest().catch(() => digest)
    const restyled = now !== digest || files.some(isStylesheetFile)
    digest = now
    changes.stamp()
    changes.add({ paths: [...new Set(reached)], styles: restyled })
  }

  const watchFolder: WatchFolder = options.watch ?? watch

  const watcher = watchFolder(options.root, { recursive: true }, (_event, name) => {
    const path = name?.replaceAll("\\", "/")

    if (!path || path.split("/").some((part) => unwatched.has(part))) {
      return
    }

    pending.add(path)
    clearTimeout(timer)
    timer = setTimeout(() => void settle(), 60)
  })

  return () => {
    clearTimeout(timer)
    changes.stop()
    watcher.close()
  }
}

/** A digest of the guest's compiled CSS: its styles pages' stylesheets, as Next builds them now. */
export async function guestStylesDigest(server: NextServer): Promise<string> {
  const hash = createHash("sha256")

  for (const route of [guestRoutes.styles, guestRoutes.packageStyles]) {
    const page = await server.fetchText(route)

    for (const stylesheet of readGuestPage(page.text).stylesheets) {
      hash.update((await server.fetchText(stylesheet)).text)
    }
  }

  return hash.digest("hex")
}
