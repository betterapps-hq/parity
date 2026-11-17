import type { ExtensionStatus, InstalledStatus } from "@parity-app/extension-host"
import { Puzzle } from "lucide-react"
import type { SettingsExtension } from "../../../shared/settings-view.ts"
import type { Extension } from "./definitions.ts"
import { extensionSettings } from "./extension-settings.ts"
import { extensionMark } from "./marks.tsx"

/*
 * The extensions Settings lists (PAR-1129): every installed one, from its manifest, so a new extension shows there with
 * no change to Parity. In an open project, each says what detection found of its tool and what its host says of it.
 */

/** What the open project says of its extensions: what detection found, its extensions' hosts, and what each adds. */
export interface ListedProject {
  /** What detection found of each tool: its id, which is an extension's prefix, and what and where in a sentence. */
  tools: readonly { id: string; summary: string }[]
  /** The extensions running in the project, as their hosts tell the window. */
  running: readonly ExtensionStatus[]
  /** What an extension adds to the project, by its prefix. */
  addsOf?: (prefix: string) => string[]
}

/** Every installed extension as Settings lists it: with no project open, what it runs in; in one, whether it runs. */
export function extensionList(
  installed: readonly InstalledStatus[],
  project: ListedProject | undefined
): SettingsExtension[] {
  return installed.map((extension) => {
    const name = extension.displayName

    const entry: SettingsExtension = {
      id: extension.prefix,
      name,
      icon: extension.icon,
      prefix: extension.prefix,
      settings: extension.contributes.settings ?? {},
      permissions: extension.permissions,
      running: false,
      adds: [],
      found: project ? `No ${name} in this project` : `Runs in projects that use ${name}`
    }

    const tool = project?.tools.find((each) => each.id === extension.prefix)
    const status = project?.running.find((each) => each.id === extension.id)

    if (!project || (!tool && !status)) {
      return entry
    }

    entry.running = true
    entry.found = tool?.summary ?? "Found in this project"
    entry.adds = project.addsOf?.(extension.prefix) ?? []

    if (!status) {
      return entry
    }

    entry.state = status.state
    entry.onStartup = status.activates.includes("onStartup")
    entry.problems = status.settingProblems

    if (status.reason !== undefined) {
      entry.reason = status.reason
    }

    if (status.activatedIn !== undefined) {
      entry.activatedIn = status.activatedIn
    }

    if (status.memory !== undefined) {
      entry.memory = status.memory
    }

    return entry
  })
}

/** The extensions as Settings lists them, from what the window sent: each with its logo and its manifest's settings. */
export function extensionsOfProject(list: readonly SettingsExtension[]): Extension[] {
  return list.map((entry) => {
    const extension: Extension = {
      id: entry.id,
      name: entry.name,
      icon: extensionMark(entry.prefix ?? entry.id, entry.icon, entry.name) ?? Puzzle,
      running: entry.running,
      found: entry.found,
      adds: entry.adds,
      settings: extensionSettings(entry.id, entry.settings)
    }

    for (const key of [
      "prefix",
      "permissions",
      "state",
      "reason",
      "activatedIn",
      "memory",
      "onStartup",
      "problems"
    ] as const) {
      if (entry[key] !== undefined) {
        Object.assign(extension, { [key]: entry[key] })
      }
    }

    return extension
  })
}
