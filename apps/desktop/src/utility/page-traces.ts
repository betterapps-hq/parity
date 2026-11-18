import { stat } from "node:fs/promises"
import { join } from "node:path"
import type { FrameTrace } from "@parity-app/change-detection"
import {
  appEntries,
  type CodeSnapshot,
  contentReader,
  folderRouteFiles,
  importedFiles,
  moduleClosure,
  type PageTrace,
  type PageTraceInput,
  pageTrace,
  pageTraceFiles,
  readTsconfig,
  resolvePathAlias,
  routeChain,
  sharedPreviewFiles,
  traceDigest
} from "@parity-app/project"
import type { PageJob } from "../shared/protocol.ts"
import type { ServiceParams } from "../shared/service-params.ts"
import type { OpenProjects, PageProject } from "./projects.ts"

/** How many hex digits of each file's hash a trace keeps, as a frame's does. */
const fileHashDigits = 16

/** What a page trace is salted with beside the code's own salt, so it never matches a frame's. */
const pageSalt = "page:1"

/** What page traces need of the open projects. */
export type PageTraceProjects = Pick<OpenProjects, "pageProject" | "loadedFiles">

/** The page a frozen copy is of, which its trace is taken for. */
export type TracedPage = ServiceParams["pages.trace"]

/**
 * What page traces do: take a page's trace before its picture is captured, say whether a kept one still holds, and give
 * a frozen copy the trace it keeps.
 */
export interface PageTraces {
  /**
   * The files a route's page reads and their digest now; none when its project or code isn't known, or when one of them
   * changed after the job's copy started loading, so what it drew may not be what they hold now.
   */
  trace(job: PageJob): Promise<FrameTrace | undefined>
  /**
   * Whether the files a trace lists hash to its digest now, and it lists every file the page's trace would now, so a
   * file added since, such as a new layout around the route, makes it stale.
   */
  holds(job: PageJob, trace: FrameTrace): Promise<boolean>
  /**
   * The trace a frozen copy keeps (`pageTrace`), which says which changed files make it stale, `changed` when one of its
   * files changed after its page started loading; none when its project or code isn't known.
   */
  copy(page: TracedPage): Promise<(PageTrace & { changed?: true }) | undefined>
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

  /** What a page's trace is chosen from now. */
  const inputOf = async (
    job: Pick<TracedPage, "projectId" | "route" | "landed">,
    project: PageProject,
    snapshot: CodeSnapshot
  ): Promise<PageTraceInput> => {
    const { root } = project
    const tsconfig = readTsconfig(root)
    const alias = (specifier: string) => resolvePathAlias(root, tsconfig, specifier)

    const scan = async (path: string) => {
      const { text } = await read(join(root, path))

      return text === undefined ? [] : importedFiles(path, text, snapshot.files, alias)
    }

    const chain = routeChain(job.route, project.routes)

    // A router naming routes by folder draws them from files in their folders and above, as Next's templates, which no
    // import reaches, so what those import is scanned too.
    const wrapping =
      project.folderRoutes && chain.length > 0 ? folderRouteFiles(chain[0]!, [...snapshot.files.keys()]) : []

    // What mounts the app wraps every page, and only what it imports outside the routes: another route's files are its.
    const routeFiles = new Set(project.routes.map((route) => route.file))
    const html = (await read(join(root, "index.html"))).text
    const entries = appEntries([...snapshot.files.keys()], html)
    const outsideRoutes = (path: string) => (routeFiles.has(path) ? Promise.resolve([]) : scan(path))

    const [scanned, mounting, styles, loaded] = await Promise.all([
      moduleClosure([...chain, ...wrapping], scan),
      moduleClosure(entries, outsideRoutes),
      moduleClosure(project.stylesheets, scan),
      chain.length > 0 ? projects.loadedFiles(job.projectId, chain) : Promise.resolve(undefined)
    ])

    return {
      route: job.route,
      landed: job.landed,
      routes: project.routes,
      folderRoutes: project.folderRoutes,
      loaded,
      // The root's index.html is the page's document where there is one, its markup, inline styles and root classes.
      scanned: [
        ...scanned,
        ...mounting.filter((path) => !routeFiles.has(path)),
        ...(html === undefined ? [] : ["index.html"])
      ],
      styles,
      shared: sharedPreviewFiles(snapshot),
      files: [...snapshot.files.keys()]
    }
  }

  /** The files `pageTraceFiles` chooses for a job's page now. */
  const filesOf = async (job: PageJob, project: PageProject, snapshot: CodeSnapshot) =>
    pageTraceFiles(await inputOf({ ...job, landed: job.copy?.landed ?? true }, project, snapshot))

  return {
    async trace(job) {
      const project = projects.pageProject(job.projectId)

      if (!project) {
        return undefined
      }

      const { root } = project
      const snapshot = await project.code
      const files = await filesOf(job, project, snapshot)
      const loadedAt = job.copy?.loadedAt

      if (loadedAt !== undefined && (await changedSince(root, files, loadedAt))) {
        return undefined
      }

      const hashes = await hashesOf(root, files)

      return { files: hashes, digest: traceDigest(salt(snapshot), Object.entries(hashes)) }
    },

    async holds(job, trace) {
      const project = projects.pageProject(job.projectId)

      if (!project) {
        return false
      }

      const snapshot = await project.code
      const now = await filesOf(job, project, snapshot)

      if (now.some((path) => !(path in trace.files))) {
        return false
      }

      const hashes = await hashesOf(project.root, Object.keys(trace.files))

      return traceDigest(salt(snapshot), Object.entries(hashes)) === trace.digest
    },

    async copy(page) {
      const project = projects.pageProject(page.projectId)

      if (!project) {
        return undefined
      }

      const snapshot = await project.code
      const input = await inputOf(page, project, snapshot)
      const trace = pageTrace(input)
      const changed = await changedSince(project.root, trace.files === "all" ? input.files : trace.files, page.loadedAt)

      return changed ? { ...trace, changed } : trace
    }
  }
}

/** Whether any of `files` was written after `time`, in milliseconds since 1970. A file that's gone counts as unchanged. */
async function changedSince(root: string, files: readonly string[], time: number): Promise<boolean> {
  const times = await Promise.all(
    files.map((path) =>
      stat(join(root, path)).then(
        (info) => info.mtimeMs,
        () => 0
      )
    )
  )

  return times.some((written) => written > time)
}
