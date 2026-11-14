import { fileURLToPath } from "node:url"
import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import {
  type ExtensionHosts,
  type ExtensionWindow,
  extensionHosts,
  type InstalledExtension,
  readExtension
} from "@parity-app/extensions"
import { z } from "zod"
import { logNote } from "../shared/log.ts"
import { forkChild } from "./children.ts"
import { environment } from "./environment.ts"
import { extensionStateStore } from "./extension-state.ts"
import { local, readPortless } from "./portless.ts"
import { adoptServer, choosePort, knownServers, startServer, stopServer } from "./process-manager.ts"
import type { OpenProject } from "./projects.ts"

/*
 * The extensions Parity runs, each in a host of its own for each open project (see `@parity-app/extensions`). Each host
 * is a forked Node process started through the service's one child lifecycle, with the service's key-free environment,
 * so main ends it should the service crash. Parity's own extensions are built in: their manifests are read from their
 * packages as the service starts, and their code is bundled beside the service, loaded only when a host activates.
 */

/** An open project, as hosts see it. */
export interface ExtensionProject {
  id: string
  root: string
  name: string
  open: OpenProject
}

const hostScript = fileURLToPath(new URL("./extension-host.mjs", import.meta.url))

/** A built-in extension: its `package.json`, its bundled code beside the service, and how it detects its tool. */
function builtIn(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a package.json, read by readExtension
  packageJson: unknown,
  bundle: string,
  detect: InstalledExtension<ExtensionProject>["detect"]
): InstalledExtension<ExtensionProject> {
  return {
    package: readExtension(packageJson),
    main: fileURLToPath(new URL(`./extensions/${bundle}.mjs`, import.meta.url)),
    detect
  }
}

/** Parity's own extensions. Until each has a `detect` module, what Parity's detection found stands in. */
const builtIns = (): InstalledExtension<ExtensionProject>[] => [
  builtIn(storybookPackage, "storybook", ({ open }) => {
    const found = open.info.storybook

    // What detection found goes to the host as JSON carries it, without the fields it leaves out, which structuredClone
    // would keep.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    return found ? { detected: z.json().parse(JSON.parse(JSON.stringify(found))) } : undefined
  })
]

/** Every open project's extensions, telling `window` what changes and asking the person through it. */
export function startExtensions(window: ExtensionWindow): ExtensionHosts<ExtensionProject> {
  return extensionHosts<ExtensionProject>({
    extensions: builtIns(),
    start(extension, project) {
      logNote(`[service] starting ${extension.package.manifest.displayName} for ${project.name}`)

      return forkChild(hostScript, { cwd: project.root, echo: true })
    },
    state: extensionStateStore(environment().PARITY_EXTENSION_STATE_FILE),
    window,
    servers: {
      async serve(projectId, extension, server) {
        const id = serverId(projectId, extension, server.id)
        const known = knownServers(projectId).find((candidate) => candidate.id === id)

        if (known) {
          return { url: known.url }
        }

        const project = projects.get(projectId)

        if (!project) {
          throw new Error(`No project ${projectId} is open`)
        }

        const port = await choosePort(server.port)
        const url = `http://localhost:${port}`

        const ready = (base: string) =>
          fetch(`${base}${server.readyPath}`, { signal: AbortSignal.timeout(3000) }).then((response) => response.ok)

        logNote(`[service] starting ${server.name} for ${project.name} at ${url}`)

        const started = startServer({
          id,
          kind: "extension",
          name: server.name,
          projectId,
          project: project.name,
          // On Parity's own Node, in the project's folder: Electron runs as plain Node here.
          command: process.execPath,
          args: [server.script, ...server.args.map((arg) => arg.replaceAll("{port}", String(port)))],
          cwd: project.root,
          env: { ...process.env, ...server.env, ELECTRON_RUN_AS_NODE: "1" },
          url,
          ready
        })

        await started.ready

        return { url }
      },
      adopt(projectId, extension, server) {
        const project = projects.get(projectId)

        if (project) {
          adoptServer({
            id: serverId(projectId, extension, server.id),
            kind: "extension",
            name: server.name,
            projectId,
            project: project.name,
            url: server.url
          })
        }
      },
      stop: (projectId, extension, id) => stopServer(serverId(projectId, extension, id)),
      async routed() {
        const portless = await readPortless()

        return portless.routes.map((route) => ({ url: local(route.port), address: portless.address(route.hostname) }))
      },
      stopAll(projectId, extension) {
        for (const server of knownServers(projectId)) {
          if (server.id.startsWith(serverId(projectId, extension, ""))) {
            stopServer(server.id)
          }
        }
      }
    }
  })
}

/** The open projects hosts were told of, by id, for their servers' folders and names. */
const projects = new Map<string, { root: string; name: string }>()

/** Tells the hosts a project opened, which starts the extensions that activate when detected. */
export function openExtensions(hosts: ExtensionHosts<ExtensionProject>, open: OpenProject): void {
  const { id, root, name } = open.info
  projects.set(id, { root, name })
  hosts.open({ id, root, name, open })
}

/** Ends a project's hosts as it closes. */
export async function closeExtensions(hosts: ExtensionHosts<ExtensionProject>, projectId: string): Promise<void> {
  projects.delete(projectId)
  await hosts.close(projectId)
}

/** A server's id in the process manager: one per extension, server and project. */
function serverId(projectId: string, extension: string, id: string): string {
  return `extension:${extension}:${projectId}:${id}`
}
