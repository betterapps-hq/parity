import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { parseManifest, type ServedTool, type ToolServer, type ToolServers } from "@parity-app/core"
import { isText } from "@parity-app/core/values/evaluate"
import { logNote } from "../shared/log.ts"
import { findRoutedServer, readPortless } from "./portless.ts"
import { adoptServer, choosePort, knownServers, startServer, stopServer } from "./process-manager.ts"

/** The project a tool's servers run for. */
export interface ServedProject {
  id: string
  name: string
  root: string
}

/** Each tool's server as it's found or started, by its process id, so two asks at once share one. */
const serving = new Map<string, Promise<ServedTool>>()

/**
 * How an adapter's action gets its tool's servers for a project: through the process manager, which lists each with
 * the project's processes and stops it with the project. One already serving the project is used as it is.
 */
export function toolServers(project: ServedProject, adapter: string): ToolServers {
  return {
    serve: (server, options) => {
      if (options?.fresh) {
        stopTool(processId(project.id, adapter))
      }

      return ensure(project, adapter, server)
    }
  }
}

function processId(projectId: string, adapter: string): string {
  return `${adapter}:${projectId}`
}

/** Stops the server Parity started for a tool, or lets go of one it found running. */
function stopTool(id: string): void {
  serving.delete(id)
  stopServer(id)
}

function ensure(project: ServedProject, adapter: string, server: ToolServer): Promise<ServedTool> {
  const id = processId(project.id, adapter)
  const existing = serving.get(id)
  // One the process manager no longer knows has stopped since, or crashed, or its project closed.
  const known = knownServers(project.id).some((each) => each.id === id)

  if (existing && known) {
    return existing
  }

  const ready: Promise<ServedTool> = start(project, adapter, server).catch((cause: unknown) => {
    if (serving.get(id) === ready) {
      serving.delete(id)
    }

    throw cause
  })

  serving.set(id, ready)

  return ready
}

async function start(project: ServedProject, adapter: string, server: ToolServer): Promise<ServedTool> {
  const id = processId(project.id, adapter)
  const listing = { id, kind: "tool", name: server.name, projectId: project.id, project: project.name } as const

  // A server already serving this project is used as it is: one Portless routes to, which opens at its name, or else
  // one on its usual port.
  const usual = `http://localhost:${server.port}`

  const existing =
    (await findRoutedServer(
      await readPortless(),
      (base) => server.serves(base),
      (base) => servesFrom(base, project.root)
    )) ?? ((await server.serves(usual)) ? { url: usual, address: usual } : undefined)

  if (existing) {
    adoptServer({ ...listing, url: existing.url })

    return existing
  }

  const port = await choosePort(server.port)
  const url = `http://localhost:${port}`
  const require = createRequire(join(project.root, "package.json"))
  let manifestPath: string

  try {
    manifestPath = require.resolve(`${server.package}/package.json`)
  } catch {
    throw new Error(`${server.name} isn't installed in the project. Install its dependencies first.`)
  }

  const manifest = parseManifest(readFileSync(manifestPath, "utf8"), manifestPath)
  const bins = isText(manifest.bin) ? undefined : manifest.bin
  const bin = isText(manifest.bin) ? manifest.bin : (bins?.[server.package] ?? Object.values(bins ?? {})[0])

  if (!bin) {
    throw new Error(`${server.name}'s command line couldn't be found`)
  }

  logNote(`[service] starting ${server.name} for ${project.name} at ${url}`)

  // The tool's command line runs on Parity's own Node, in the project's folder: Electron runs as plain Node here.
  const started = startServer({
    ...listing,
    command: process.execPath,
    args: [join(dirname(manifestPath), bin), ...server.args(port)],
    cwd: project.root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", BROWSER: "none" },
    url,
    ready: (base) => server.serves(base),
    restart: async () => {
      stopTool(id)
      await ensure(project, adapter, server)
    }
  })

  await started.ready

  return { url, address: url }
}

/**
 * Whether a server serves files from the project's folder, to tell its checkout's from a worktree's that serves the
 * same files. Vite, which builds most tools' servers Parity opens, serves only the folders it allows and answers
 * Forbidden for the rest; with another builder, it can't tell.
 */
function servesFrom(base: string, root: string): Promise<boolean> {
  const file = `${root.replaceAll("\\", "/").replace(/^\//, "")}/package.json`

  return fetch(`${base}/@fs/${file}`, { signal: AbortSignal.timeout(5000) }).then(
    (response) => response.ok,
    () => false
  )
}
