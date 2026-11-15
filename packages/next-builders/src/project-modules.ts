import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { join, posix } from "node:path"
import { importSpecifiers, type ProjectTsconfig, resolvePathAlias } from "@parity-app/code"
import { isStylesheetFile } from "@parity-app/project"
import { type GuestAppFile, guestRoutes, projectImport } from "./guest-app.ts"

/*
 * The project's modules one at a time, for the canvas to load a component Next hasn't built for the guest, or one whose
 * code changed, without starting the builder again (PAR-1159). Next builds a client module only for a page that renders
 * it, so each module the canvas asks for gets a page of the guest app's own, whose client component imports it whole:
 * the page's React Server Components payload names that component's id and the chunks that hold it and its imports.
 */

/** The folder of the guest app's modules that each import one of the project's whole, from the guest app's folder. */
export const projectModuleFolder = "app/parity-modules"

/** A module of the project's, as the guest app reaches it: its page's route, and the files that make the page. */
export interface ProjectModulePage {
  /** The module's file, from the project's root. */
  path: string
  /** The page's route, where Next renders it. */
  route: string
  /** The guest app's client module that imports the project's module, from the guest app's folder. */
  file: string
  /** The client module and the page. */
  files: GuestAppFile[]
}

/** The page that brings one of the project's modules into the guest app, by the module's path from the root. */
export function projectModulePage(path: string): ProjectModulePage {
  const name = path
    .replace(/\.[^./]+$/, "")
    .replaceAll(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  const key = `${name.slice(-60)}-${createHash("sha256").update(path).digest("hex").slice(0, 8)}`
  const file = `${projectModuleFolder}/${key}.tsx`
  const pageFile = `app/(parity)${guestRoutes.guest}/modules/${key}/page.tsx`
  const fromPage = posix.relative(posix.dirname(pageFile), file).replace(/\.tsx$/, "")

  const module = `// Written by Parity's Next.js builder for the canvas.
"use client"

import * as projectModule from ${JSON.stringify(`../${projectImport(path)}`)}

export const parityModule = projectModule

export default function ParityModule() {
  return null
}
`

  const page = `// Written by Parity's Next.js builder for the canvas.
import ParityModule from ${JSON.stringify(fromPage)}

export default function Page() {
  return <ParityModule />
}
`

  return {
    path,
    route: `${guestRoutes.guest}/modules/${key}`,
    file,
    files: [
      { path: file, text: module },
      { path: pageFile, text: page }
    ]
  }
}

/** Whether a path, from the root, is a module of the project's own a component can come from. */
export function isProjectSourcePath(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path) && !path.split("/").includes("node_modules") && !path.startsWith(".next/")
}

/** The files a module may name by a path without its extension, in the order bundlers try them. */
const extensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"]

/**
 * What the project's modules import, file by file, read from their sources as written: enough to tell which of the
 * project's components reach a file that changed, through imports however deep. A file reads again once it changes.
 */
export function projectImports(root: string, tsconfig: ProjectTsconfig) {
  const imports = new Map<string, Promise<string[]>>()

  const exists = (path: string) =>
    stat(join(root, path)).then(
      (stats) => stats.isFile(),
      () => false
    )

  /** The file a specifier names, from `from`, when it's the project's own. */
  const resolved = async (from: string, specifier: string): Promise<string | undefined> => {
    const target = specifier.startsWith(".")
      ? posix.join(posix.dirname(from), specifier)
      : resolvePathAlias(root, tsconfig, specifier)

    if (!target || target.startsWith("../") || target.split("/").includes("node_modules")) {
      return undefined
    }

    const candidates = [
      target,
      ...extensions.map((extension) => `${target}${extension}`),
      ...extensions.map((extension) => `${target}/index${extension}`)
    ]

    for (const candidate of candidates) {
      if (await exists(candidate)) {
        return candidate
      }
    }

    return undefined
  }

  const read = (path: string): Promise<string[]> => {
    let found = imports.get(path)

    if (!found) {
      found = readFile(join(root, path), "utf8").then(
        async (source) => {
          const specifiers = importSpecifiers(source, isStylesheetFile(path))
          const files = await Promise.all(specifiers.map((specifier) => resolved(path, specifier)))

          return files.filter((file) => file !== undefined)
        },
        () => []
      )
      imports.set(path, found)
    }

    return found
  }

  return {
    /** Forgets what a changed file imports, so it reads again. */
    changed: (path: string) => imports.delete(path),
    /** The modules among `modules` that are `file` or import it, however deep. */
    async reaching(modules: Iterable<string>, file: string): Promise<string[]> {
      const reached: string[] = []

      for (const module of modules) {
        const seen = new Set<string>()
        const queue = [module]

        for (let index = 0; index < queue.length; index++) {
          const path = queue[index]!

          if (path === file) {
            reached.push(module)
            break
          }

          if (!seen.has(path)) {
            seen.add(path)
            queue.push(...(await read(path)))
          }
        }
      }

      return reached
    }
  }
}
