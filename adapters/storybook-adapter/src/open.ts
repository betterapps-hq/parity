import {
  type ActionContext,
  type ActionResult,
  type EntitiesSource,
  type PackageManifest,
  parseData,
  type ToolServer
} from "@parity-app/core"
import { z } from "zod"
import { readStoryFile } from "./csf.ts"
import { storyFilePattern } from "./screens.ts"

/** An entry of Storybook's `/index.json`: a story or a docs page, and the file it comes from. */
const indexEntry = z.looseObject({ id: z.string(), type: z.enum(["story", "docs"]), importPath: z.string() })

type IndexEntry = z.infer<typeof indexEntry>

/** Storybook's `/index.json`. Its entries are checked one by one, so one of a kind Parity doesn't know is left out. */
const storyIndexFile = z.looseObject({ entries: z.record(z.string(), z.unknown()).optional() })

/**
 * Opens a component's stories: its docs page when it has one, else its first story; without a component, Storybook's
 * home. Starts the project's Storybook first when it isn't running, which can take a while the first time, and again
 * when the one running stopped answering.
 */
export async function openStorybook(context: ActionContext): Promise<ActionResult> {
  const { component, source, servers } = context
  const stories = await storyFiles(source)
  const files = component ? stories.filter((file) => file.component === component).map((file) => file.path) : []

  if (component && files.length === 0) {
    throw new Error(`${component} has no stories`)
  }

  const server = storybookServer(
    context,
    stories.map((file) => file.path)
  )
  let served = await servers.serve(server)
  let entries = await storyIndex(served.url).catch(() => undefined)

  if (!entries) {
    served = await servers.serve(server, { fresh: true })
    entries = await storyIndex(served.url)
  }

  if (!component) {
    return { open: served.address }
  }

  const mine = entries.filter((entry) => files.some((file) => sameFile(entry.importPath, file)))
  const target = mine.find((entry) => entry.type === "docs") ?? mine.find((entry) => entry.type === "story")

  return { open: target ? `${served.address}/?path=/${target.type}/${target.id}` : served.address }
}

/**
 * The project's Storybook: `storybook dev` with its config folder, on the port its script asks for, else 6006. One
 * already running is the project's when it serves one of its story files; with none to check, any Storybook is.
 */
export function storybookServer({ detection, project }: ActionContext, storyPaths: readonly string[]): ToolServer {
  const configDir = detection.config?.replace(/\/[^/]+$/, "") ?? ".storybook"

  return {
    name: "Storybook",
    package: "storybook",
    port: scriptPort(project.pkg) ?? 6006,
    args: (port) => ["dev", "--port", String(port), "--no-open", "--ci", "--config-dir", configDir],
    serves: (base) =>
      storyIndex(base).then(
        (served) =>
          storyPaths.length === 0 ||
          served.some((entry) => storyPaths.some((path) => sameFile(entry.importPath, path))),
        () => false
      )
  }
}

/** The port a `storybook dev` script asks for: `-p 6006`, `--port 6006` or `--port=6006`. */
function scriptPort(pkg: PackageManifest): number | undefined {
  for (const command of Object.values(pkg.scripts ?? {})) {
    if (/\bstorybook\s+dev\b/.test(command)) {
      const port = Number(/(?:^|\s)(?:-p|--port)(?:=|\s+)(\d+)/.exec(command)?.[1])

      if (port) {
        return port
      }
    }
  }

  return undefined
}

/** The project's story files, each with the key of the component its meta names, when it's one of the project's. */
async function storyFiles(source: EntitiesSource): Promise<{ path: string; component?: string }[]> {
  const files = await source.files(storyFilePattern)

  return Promise.all(
    files.map(async (path) => {
      const meta = readStoryFile((await source.read(path)) ?? "", path).component
      const component = meta && (await source.componentFor(path, meta.specifier, meta.name))

      return { path, component }
    })
  )
}

/** The stories and docs pages a Storybook at `base` serves, from its `/index.json`. Rejects when it serves none. */
export async function storyIndex(base: string): Promise<IndexEntry[]> {
  const response = await fetch(`${base}/index.json`, { signal: AbortSignal.timeout(3000) })

  if (!response.ok) {
    throw new Error(`Storybook answered ${response.status}`)
  }

  const body = parseData(storyIndexFile, await response.json(), "/index.json")

  return Object.values(body.entries ?? {}).flatMap((value) => {
    const entry = indexEntry.safeParse(value)

    return entry.success ? [entry.data] : []
  })
}

/** Storybook's import paths start with `./`; Parity's are plain, relative to the root. */
function sameFile(importPath: string, path: string): boolean {
  return importPath.replace(/^\.\//, "") === path.replace(/^\.\//, "")
}
