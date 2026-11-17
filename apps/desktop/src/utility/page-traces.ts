import { join } from "node:path"
import type { FrameTrace } from "@parity-app/change-detection"
import {
  type CodeSnapshot,
  contentReader,
  importedFiles,
  moduleClosure,
  pageTraceFiles,
  readTsconfig,
  resolvePathAlias,
  routeChain,
  sharedPreviewFiles,
  traceDigest
} from "@parity-app/project"
import type { PageJob } from "../shared/protocol.ts"
import type { OpenProjects } from "./projects.ts"

/** How many hex digits of each file's hash a trace keeps, as a frame's does. */
const fileHashDigits = 16

/** What a page trace is salted with beside the code's own salt, so it never matches a frame's. */
const pageSalt = "page:1"

/** What page traces need of the open projects. */
export type PageTraceProjects = Pick<OpenProjects, "pageProject" | "loadedFiles">

/** What page traces do: take a page's trace before its picture is captured, and say whether a kept one still holds. */
export interface PageTraces {
  /** The files a route's page reads and their digest now; none when its project or code isn't known. */
  trace(job: PageJob): Promise<FrameTrace | undefined>
  /** Whether the files a trace lists hash to its digest now. */
  holds(job: PageJob, trace: FrameTrace): Promise<boolean>
}

/**
 * Page traces for the projects open in `projects` (docs/proposals/route-frames.md, "A page's trace"): the files a
 * route's copy and its picture were made from, as `pageTraceFiles` chooses them by builder, each by a hash of its
 * contents.
 */
export function pageTraces(projects: PageTraceProjects): PageTraces {
  const read = contentReader()

  /** Each file's hash now, as a trace keeps it. */
  const hashesOf = async (root: string, files: readonly string[]) =>
    Object.fromEntries(
      await Promise.all(
        files.map(async (path) => [path, (await read(join(root, path))).hash.slice(0, fileHashDigits)] as const)
      )
    )

  const salt = (snapshot: CodeSnapshot) => `${snapshot.salt}\0${pageSalt}`

  return {
    async trace(job) {
      const project = projects.pageProject(job.projectId)

      if (!project) {
        return undefined
      }

      const { root } = project
      const snapshot = await project.code
      const tsconfig = readTsconfig(root)
      const alias = (specifier: string) => resolvePathAlias(root, tsconfig, specifier)

      const scan = async (path: string) => {
        const { text } = await read(join(root, path))

        return text === undefined ? [] : importedFiles(path, text, snapshot.files, alias)
      }

      const chain = routeChain(job.route, project.routes)

      const [scanned, styles, loaded] = await Promise.all([
        moduleClosure(chain, scan),
        moduleClosure(project.stylesheets, scan),
        chain.length > 0 ? projects.loadedFiles(job.projectId, chain) : Promise.resolve(undefined)
      ])

      const files = pageTraceFiles({
        route: job.route,
        routes: project.routes,
        folderRoutes: project.folderRoutes,
        loaded,
        scanned,
        styles,
        shared: sharedPreviewFiles(snapshot),
        files: [...snapshot.files.keys()]
      })

      const hashes = await hashesOf(root, files)

      return { files: hashes, digest: traceDigest(salt(snapshot), Object.entries(hashes)) }
    },

    async holds(job, trace) {
      const project = projects.pageProject(job.projectId)

      if (!project) {
        return false
      }

      const hashes = await hashesOf(project.root, Object.keys(trace.files))

      return traceDigest(salt(await project.code), Object.entries(hashes)) === trace.digest
    }
  }
}
