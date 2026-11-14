import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { parseManifest, type ServedTool, type ToolServer, type ToolServers } from "@parity-app/core"
import { isText } from "@parity-app/core/values/evaluate"
import { logNote } from "../shared/log.ts"
import { findRoutedServer, readPortless } from "./portless.ts"
import { adoptProcess, choosePort, managedProcess, startProcess, stopManaged } from "./process-manager.ts"

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
  void stopManaged(id, "extension")
}

function ensure(project: ServedProject, adapter: string, server: ToolServer): Promise<ServedTool> {
  const id = processId(project.id, adapter)
  const existing = serving.get(id)
  // One the process manager no longer knows has stopped since, or crashed, or its project closed.
  const known = managedProcess(id) !== undefined

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
  const listing = { id, name: server.name, projectId: project.id, project: project.name }

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
    const port = Number(new URL(existing.url).port)
    adoptProcess({
      ...listing,
      owner: { kind: "parity", role: "tool", adopted: true },
      endpoint: { url: existing.url, port, protocol: "http" },
      foundBy: existing.url === usual ? "port" : "provider",
      provider: "parity"
    })

    return existing
  }

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

  const script = join(dirname(manifestPath), bin)
  let url = ""

  // The tool's command line runs on Parity's own Node, in the project's folder: Electron runs as plain Node here.
  const started = await startProcess({
    ...listing,
    lifetime: "server",
    owner: { kind: "parity", role: "tool" },
    runKind: "bin",
    command: server.package,
    // Asked until it answers as the tool's server, the way the adapter tells one.
    answers: (base) => server.serves(base),
    fingerprint: `${adapter}:${server.package}`,
    async launch() {
      const port = await choosePort(server.port)
      url = `http://localhost:${port}`
      logNote(`[service] starting ${server.name} for ${project.name} at ${url}`)

      return {
        command: process.execPath,
        args: [script, ...server.args(port)],
        cwd: project.root,
        env: { ...withoutUndefined(process.env), ELECTRON_RUN_AS_NODE: "1", BROWSER: "none" },
        port,
        portMoved: port !== server.port
      }
    },
    restartFromList: async () => {
      stopTool(id)
      await ensure(project, adapter, server)
    }
  })

  await started.ready()

  return { url, address: url }
}

/** The service's environment, without the variables it doesn't set. */
function withoutUndefined(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined))
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
