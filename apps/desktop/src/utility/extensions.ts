import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { hasAddon } from "@parity-app/extension-storybook-a11y/accessibility"
import accessibilityPackage from "@parity-app/extension-storybook-a11y/package.json" with { type: "json" }
import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import {
  type ExtensionEdits,
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
import { extensionProcesses } from "./extension-processes.ts"
import { extensionStateStore } from "./extension-state.ts"
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
  }),
  // Storybook's accessibility checks, where the project has Storybook and its accessibility addon (PAR-1096).
  builtIn(accessibilityPackage, "storybook-a11y", ({ open }) =>
    open.info.storybook && hasAddon(readPackageJson(open.info.root)) ? {} : undefined
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
    processes: extensionProcesses((projectId) => projects.get(projectId))
  })
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
  hosts.open({ id, root, name, open }, main?.extensions ?? {})
}

/** Ends a project's hosts as it closes. */
export async function closeExtensions(hosts: ExtensionHosts<ExtensionProject>, projectId: string): Promise<void> {
  projects.delete(projectId)
  await hosts.close(projectId)
}
