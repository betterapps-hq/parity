import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { detectPeers, type PackageManifest } from "@parity-app/core"
import { hasAddon } from "@parity-app/extension-storybook-a11y/accessibility"
import accessibilityPackage from "@parity-app/extension-storybook-a11y/package.json" with { type: "json" }
import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import routerPackage from "@parity-app/extension-tanstack-router/package.json" with { type: "json" }
import {
  type ExtensionEdits,
  type ExtensionHosts,
  type ExtensionWindow,
  extensionHosts,
  type InstalledExtension,
  readExtension
} from "@parity-app/extensions"
import { fillPort, runEnvironment } from "@parity-app/processes"
import { z } from "zod"
import { logNote } from "../shared/log.ts"
import { forkChild } from "./children.ts"
import { environment } from "./environment.ts"
import { extensionStateStore } from "./extension-state.ts"
import { local, readPortless } from "./portless.ts"
import { adoptProcess, choosePort, startProcess, stopManaged, stopManagedPrefixed } from "./process-manager.ts"
import type { OpenProject, ProvidedRoutes } from "./projects.ts"

/*
 * The extensions Parity runs, each in a host of its own for each open project (see `@parity-app/extensions`). Each host
 * is a forked Node process started through the service's one child lifecycle, with the service's key-free environment,
 * so main ends it should the service crash. Parity's own extensions are built in: their manifests are read from their
 * packages as the service starts, and their code is bundled beside the service, loaded only when a host activates.
 */

/**
 * A project, as hosts see it: its package as soon as it's read, so its providers can start while it opens, and once it
 * has opened, the project itself.
 */
export interface ExtensionProject {
  id: string
  root: string
  name: string
  pkg: PackageManifest
  open?: OpenProject
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

/** An extension found by its peer dependencies in the project's package.json, which Parity reads as it opens. */
function byPeers(found: InstalledExtension<ExtensionProject>): InstalledExtension<ExtensionProject> {
  const { versions } = found.package

  return { ...found, detect: ({ pkg }) => (versions && detectPeers(pkg, versions).found ? {} : undefined) }
}

/** Parity's own extensions. Until each has a `detect` module, what Parity's detection found stands in. */
const builtIns = (): InstalledExtension<ExtensionProject>[] => [
  byPeers(builtIn(routerPackage, "tanstack-router", () => undefined)),
  builtIn(storybookPackage, "storybook", ({ open }) => {
    const found = open?.info.storybook

    // What detection found goes to the host as JSON carries it, without the fields it leaves out, which structuredClone
    // would keep.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    return found ? { detected: z.json().parse(JSON.parse(JSON.stringify(found))) } : undefined
  }),
  // Storybook's accessibility checks, where the project has Storybook and its accessibility addon (PAR-1096).
  builtIn(accessibilityPackage, "storybook-a11y", ({ open }) =>
    open?.info.storybook && hasAddon(readPackageJson(open.info.root)) ? {} : undefined
  )
]

/** A project's package.json, as JSON parsed it, or nothing when it can't be read. */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- a package.json can hold anything; its reader checks it
function readPackageJson(root: string): unknown {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  } catch {
    return undefined
  }
}

/**
 * Every open project's extensions, telling `window` what changes and asking the person through it, with their changes
 * to designs and files going through `edits`.
 */
export function startExtensions(window: ExtensionWindow, edits: ExtensionEdits): ExtensionHosts<ExtensionProject> {
  return extensionHosts<ExtensionProject>({
    edits,
    extensions: builtIns(),
    start(extension, project) {
      logNote(`[service] starting ${extension.package.manifest.displayName} for ${project.name}`)

      return forkChild(hostScript, { cwd: project.root, echo: true })
    },
    state: extensionStateStore(environment().PARITY_EXTENSION_STATE_FILE),
    window,
    servers: {
      async serve(projectId, extension, server) {
        const project = projects.get(projectId)

        if (!project) {
          throw new Error(`No project ${projectId} is open`)
        }

        const started = await startProcess({
          id: serverId(projectId, extension, server.id),
          name: server.name,
          lifetime: "server",
          owner: { kind: "extension", extension },
          projectId,
          project: project.name,
          runKind: "bin",
          command: server.id,
          fingerprint: JSON.stringify(server),
          ready: { http: server.readyPath },
          async launch() {
            const port = await choosePort(server.port)
            logNote(`[service] starting ${server.name} for ${project.name} at http://localhost:${port}`)

            // On Parity's own Node, in the project's folder: Electron runs as plain Node here.
            return {
              command: process.execPath,
              args: [server.script, ...fillPort(server.args, port)],
              cwd: project.root,
              env: runEnvironment({ bin: server.id }, process.env, server.env),
              port,
              portMoved: port !== server.port
            }
          }
        })

        const { endpoint } = await started.ready()

        return { url: endpoint?.url ?? "" }
      },
      adopt(projectId, extension, server) {
        const project = projects.get(projectId)

        if (!project) {
          return
        }

        const id = serverId(projectId, extension, server.id)
        const url = new URL(server.url)

        // One it started or adopted before under this id goes first.
        void stopManaged(id, "extension")
          .then(() =>
            adoptProcess({
              id,
              name: server.name,
              owner: { kind: "adopted", by: extension },
              projectId,
              project: project.name,
              endpoint: { url: url.origin, port: Number(url.port || 80), protocol: "http" },
              foundBy: "endpoint"
            })
          )
          .catch((cause: unknown) => logNote(`[service] couldn't adopt ${server.name}: ${String(cause)}`))
      },
      stop: (projectId, extension, id) => void stopManaged(serverId(projectId, extension, id), "extension"),
      async routed() {
        const portless = await readPortless()

        return portless.routes.map((route) => ({ url: local(route.port), address: portless.address(route.hostname) }))
      },
      stopAll(projectId, extension) {
        void stopManagedPrefixed(serverId(projectId, extension, ""), "extension")
      }
    }
  })
}

/**
 * The app's routes, from the router an extension of the project's provides: its host starts as soon as the project's
 * package is read, so it reads them while the builder starts. Nothing when none provides one.
 */
export async function providedRoutes(
  hosts: ExtensionHosts<ExtensionProject>,
  project: { root: string; name: string; pkg: PackageManifest }
): Promise<ProvidedRoutes | undefined> {
  const id = project.root
  projects.set(id, { root: project.root, name: project.name })
  hosts.open({ id, ...project })
  const routes = await hosts.provide(id, "router", "routes")
  const router = hosts.provider(id, "router")

  return routes && router ? { router, routes } : undefined
}

/** The open projects hosts were told of, by id, for their servers' folders and names. */
const projects = new Map<string, { root: string; name: string }>()

/**
 * Tells the hosts a project opened, which starts the extensions that activate when detected, with the project's
 * settings for them as its main `.par` saved them. The window sends them again as they change.
 */
export function openExtensions(hosts: ExtensionHosts<ExtensionProject>, open: OpenProject): void {
  const { id, root, name, mainDocument, documents } = open.info
  projects.set(id, { root, name })
  const main = documents.find((entry) => entry.path === mainDocument)?.document
  hosts.open({ id, root, name, pkg: open.pkg, open }, main?.extensions ?? {})
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
