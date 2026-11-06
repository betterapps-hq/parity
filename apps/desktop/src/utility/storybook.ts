import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { parseManifest } from "@parity-app/core"
import { parseData } from "@parity-app/core"
import { z } from "zod"
import type { ServiceMethods } from "../shared/protocol.ts"
import { findRoutedServer, readPortless } from "./portless.ts"
import { adoptServer, choosePort, knownServers, startServer, stopServer } from "./process-manager.ts"
import type { OpenProject } from "./projects.ts"

/** A running Storybook: where Parity reaches it, and where the browser opens it, by its Portless name when it has one. */
interface Served {
  url: string
  address: string
}

/** An entry of Storybook's `/index.json`: a story or a docs page, and the file it comes from. */
const indexEntry = z.looseObject({ id: z.string(), type: z.enum(["story", "docs"]), importPath: z.string() })

type IndexEntry = z.infer<typeof indexEntry>

/** Storybook's `/index.json`. Its entries are checked one by one, so one of a kind Parity doesn't know is left out. */
const storyIndexFile = z.looseObject({ entries: z.record(z.string(), z.unknown()).optional() })

/** Each project's Storybook as it's found or started, so two opens at once share one. */
const serving = new Map<string, Promise<Served>>()

/**
 * Opens a component's stories: its docs page when it has one, else its first story. Starts the project's Storybook
 * first when it isn't running, which can take a while the first time. Without a component, Storybook's home.
 */
export async function openStorybook(
  { info }: OpenProject,
  { component }: ServiceMethods["storybook.open"]["params"]
): Promise<ServiceMethods["storybook.open"]["result"]> {
  const storybook = info.storybook
  if (!storybook) throw new Error(`${info.name} has no Storybook`)
  const files = component ? (storybook.stories[component] ?? []) : []
  if (component && files.length === 0) throw new Error(`${component} has no stories`)
  // A Storybook that stopped since it was last used, closed by hand or crashed, is started again.
  let served = await ensureStorybook(info)
  let entries = await storyIndex(served.url).catch(() => undefined)
  if (!entries) {
    stopStorybook(info.id)
    served = await ensureStorybook(info)
    entries = await storyIndex(served.url)
  }
  const { address } = served
  if (!component) return { url: address }
  const mine = entries.filter((entry) => files.some((file) => sameFile(entry.importPath, file.path)))
  const target = mine.find((entry) => entry.type === "docs") ?? mine.find((entry) => entry.type === "story")
  return { url: target ? `${address}/?path=/${target.type}/${target.id}` : address }
}

/** Stops the Storybook Parity started for a project, or lets go of one it found running. */
function stopStorybook(projectId: string): void {
  serving.delete(projectId)
  stopServer(processId(projectId))
}

/** Starts a project's Storybook again, as from the status bar's processes. */
async function restartStorybook(info: OpenProject["info"]): Promise<void> {
  stopStorybook(info.id)
  await ensureStorybook(info)
}

function processId(projectId: string): string {
  return `storybook:${projectId}`
}

function ensureStorybook(info: OpenProject["info"]): Promise<Served> {
  const projectId = info.id
  const existing = serving.get(projectId)
  // One the process manager no longer knows has stopped since, or crashed, or its project closed.
  const known = knownServers(projectId).some((server) => server.id === processId(projectId))
  if (existing && known) return existing
  const ready: Promise<Served> = start(info).catch((error: unknown) => {
    if (serving.get(projectId) === ready) serving.delete(projectId)
    throw error
  })
  serving.set(projectId, ready)
  return ready
}

async function start(info: OpenProject["info"]): Promise<Served> {
  const projectId = info.id
  const storybook = info.storybook!
  const storyPaths = Object.values(storybook.stories).flatMap((files) => files.map((file) => file.path))
  /** Whether a Storybook answers at `base` with this project's stories. With none to check, any Storybook does. */
  const servesProject = (base: string) =>
    storyIndex(base).then(
      (served) =>
        storyPaths.length === 0 || served.some((item) => storyPaths.some((path) => sameFile(item.importPath, path))),
      () => false
    )
  const listing = {
    id: processId(projectId),
    kind: "storybook",
    name: "Storybook",
    projectId,
    project: info.name
  } as const

  // A Storybook already serving this project is used as it is: one Portless routes to, which opens at its name, or else
  // one on its usual port. Without stories to check, a routed Storybook could be any project's.
  const wanted = storybook.port ?? 6006
  const usual = `http://localhost:${wanted}`
  const routed =
    storyPaths.length > 0
      ? await findRoutedServer(await readPortless(), servesProject, (base) => servesFrom(base, info.root))
      : undefined
  const existing = routed ?? ((await servesProject(usual)) ? { url: usual, address: usual } : undefined)
  if (existing) {
    adoptServer({ ...listing, url: existing.url })
    return existing
  }

  const port = await choosePort(wanted)
  const url = `http://localhost:${port}`
  const require = createRequire(join(info.root, "package.json"))
  let manifestPath: string
  try {
    manifestPath = require.resolve("storybook/package.json")
  } catch {
    throw new Error("Storybook isn't installed in the project. Install its dependencies first.")
  }
  const manifest = parseManifest(readFileSync(manifestPath, "utf8"), manifestPath)
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : (manifest.bin?.storybook ?? Object.values(manifest.bin ?? {})[0])
  if (!bin) throw new Error("Storybook's command line couldn't be found")
  console.log(`[service] starting Storybook for ${info.name} at ${url}`)
  // Storybook's command line runs on Parity's own Node, in the project's folder: Electron runs as plain Node here.
  const server = startServer({
    ...listing,
    command: process.execPath,
    args: [
      join(dirname(manifestPath), bin),
      "dev",
      "--port",
      String(port),
      "--no-open",
      "--ci",
      "--config-dir",
      storybook.configDir
    ],
    cwd: info.root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", BROWSER: "none" },
    url,
    ready: (base) => storyIndex(base).then(() => true),
    restart: () => restartStorybook(info)
  })
  await server.ready
  return { url, address: url }
}

/** The stories and docs pages a Storybook at `base` serves, from its `/index.json`. Rejects when it serves none. */
export async function storyIndex(base: string): Promise<IndexEntry[]> {
  const response = await fetch(`${base}/index.json`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error(`Storybook answered ${response.status}`)
  const body = parseData(storyIndexFile, await response.json(), "/index.json")
  return Object.values(body.entries ?? {}).flatMap((value) => {
    const entry = indexEntry.safeParse(value)
    return entry.success ? [entry.data] : []
  })
}

/**
 * Whether a Storybook serves files from the project's folder, to tell its checkout's from a worktree's that serves the
 * same stories. Vite, which builds most Storybooks Parity opens, serves only the folders it allows and answers Forbidden
 * for the rest; with another builder, it can't tell.
 */
function servesFrom(base: string, root: string): Promise<boolean> {
  const file = `${root.replaceAll("\\", "/").replace(/^\//, "")}/package.json`
  return fetch(`${base}/@fs/${file}`, { signal: AbortSignal.timeout(5000) }).then(
    (response) => response.ok,
    () => false
  )
}

/** Storybook's import paths start with `./`; Parity's are plain, relative to the root. */
function sameFile(importPath: string, path: string): boolean {
  return importPath.replace(/^\.\//, "") === path.replace(/^\.\//, "")
}
