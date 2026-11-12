import { join } from "node:path"
import { type RenderNode, renderedComponents } from "@parity-app/core"
import {
  type CodeSnapshot,
  contentReader,
  importedFiles,
  moduleClosure,
  readTsconfig,
  resolvePathAlias,
  sharedPreviewFiles,
  traceDigest
} from "@parity-app/project"
import { z } from "zod"
import type { RenderJob } from "../shared/protocol.ts"
import type { OpenProjects } from "./projects.ts"

/** How many hex digits of each file's hash a trace keeps: 64 bits, enough to tell one file's versions apart. */
const fileHashDigits = 16

/**
 * What a frame read when it was captured (PAR-994), kept inside its bitmap: each project file, relative to the root,
 * with a hash of its contents, so what changed can be told file by file, and the digest of them all with Parity's
 * renderer. The bitmap is the frame as it's drawn now while the same files hash to the same digest.
 */
export const frameTrace = z.object({
  files: z.record(z.string(), z.string().regex(/^(?:[0-9a-f]{16}|-)$/, "expected a file hash")),
  digest: z.string().regex(/^[0-9a-f]{40}$/, "expected a trace digest")
})

export type FrameTrace = z.infer<typeof frameTrace>

/** What traces need of the open projects. */
export type TraceProjects = Pick<OpenProjects, "codeServedAt" | "previewProject" | "loadedFiles">

/** What frame traces do: take a job's trace before it's captured, and say whether a kept one still holds. */
export interface FrameTraces {
  /** The files a job's frame reads and their digest now; none when its project or code isn't known. */
  trace(job: RenderJob): Promise<FrameTrace | undefined>
  /** Whether the files a trace lists hash to its digest now, with the renderer drawing the job. */
  holds(job: RenderJob, trace: FrameTrace): Promise<boolean>
}

/**
 * Frame traces for the projects open in `projects`. A frame reads its components' files and everything they import,
 * found two ways and listed together, since a file listed that the frame doesn't read costs a capture at most, where
 * one left out could show a bitmap of old code as current: what the builder says the components load
 * (`BuilderSession.loadedFiles`), as Vite's module graph resolved them, and Parity's own scan of their imports, as
 * component previews find theirs (PAR-207), which also reads the stylesheets' `@import`s. Then the files every frame
 * depends on: the root's package.json, tsconfigs and tool configs, and the lockfiles, which stand for the packages.
 */
export function frameTraces(projects: TraceProjects): FrameTraces {
  const read = contentReader()
  const aliases = new WeakMap<CodeSnapshot, (specifier: string) => string | undefined>()

  const aliasFor = (root: string, snapshot: CodeSnapshot) => {
    let alias = aliases.get(snapshot)

    if (!alias) {
      const tsconfig = readTsconfig(root)
      alias = (specifier) => resolvePathAlias(root, tsconfig, specifier)
      aliases.set(snapshot, alias)
    }

    return alias
  }

  /** Each file's hash now, as a trace keeps it. */
  const hashesOf = async (root: string, files: readonly string[]) =>
    Object.fromEntries(
      await Promise.all(
        files.map(async (path) => [path, (await read(join(root, path))).hash.slice(0, fileHashDigits)] as const)
      )
    )

  return {
    async trace(job) {
      const project = projects.previewProject(job.projectId)
      const served = projects.codeServedAt(job.projectId, job.guestUrl)

      if (!project || !served) {
        return undefined
      }

      const snapshot = await served.code
      const { root } = project
      const alias = aliasFor(root, snapshot)

      // SAFETY: the window builds a job's tree with `renderJob`, which gives render nodes; the service's checks leave the
      // tree as it came, since only the render window draws it.
      const components = [...new Set(renderedComponents(job.tree as RenderNode[]))].flatMap((id) => {
        const own = project.sources[id]

        // A library's components are its package, which the lockfile stands for.
        if (own?.library) {
          return []
        }

        const path = own?.path ?? job.components?.[id]?.path

        return path ? [path.replace(/^\.\//, "")] : []
      })

      const [scanned, loaded] = await Promise.all([
        moduleClosure([...components, ...project.stylesheets], async (path) => {
          const { text } = await read(join(root, path))

          return text === undefined ? [] : importedFiles(path, text, snapshot.files, alias)
        }),
        components.length > 0 ? projects.loadedFiles(job.projectId, components) : undefined
      ])

      const files = [...new Set([...scanned, ...(loaded ?? []), ...sharedPreviewFiles(snapshot)])].sort((a, b) =>
        a.localeCompare(b, "en")
      )

      const hashes = await hashesOf(root, files)

      return { files: hashes, digest: traceDigest(snapshot.salt, Object.entries(hashes)) }
    },

    async holds(job, trace) {
      const project = projects.previewProject(job.projectId)
      const served = projects.codeServedAt(job.projectId, job.guestUrl)

      if (!project || !served) {
        return false
      }

      const hashes = await hashesOf(project.root, Object.keys(trace.files))

      return traceDigest((await served.code).salt, Object.entries(hashes)) === trace.digest
    }
  }
}
