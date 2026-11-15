import { detectPeers, type PackageManifest } from "@parity-app/core"
import type { JsonValue } from "@parity-app/extension-api"
import type { ExtensionPackage } from "./manifest.ts"
import { placedPath, type ReadPlace } from "./permissions.ts"

/*
 * Finding an extension's tool in a project from its manifest's `detect` (PAR-1128), with no code of the extension's and
 * nothing Parity knows of the tool: its peer dependencies in the project's package.json, the files Parity's entities
 * detection found, or a path its `read` permission names.
 */

/** What detection reads of a project: its folder, its package.json, and the extensions whose files are its entities. */
export interface DetectedProject {
  root: string
  pkg: PackageManifest
  /** The prefixes of the extensions whose tools' files Parity's entities detection found. */
  entities?: string[]
}

/** Where detection's paths start, and how it checks one is there. */
export interface DetectPlace extends Omit<ReadPlace, "root"> {
  exists(path: string): boolean
}

/**
 * What `extension`'s manifest finds of its tool in `project`: nothing when it isn't there, and with a path rule, the
 * path found, as `parity.project.detected.path` gives it.
 */
export function detectByManifest(
  extension: ExtensionPackage,
  project: DetectedProject,
  place: DetectPlace
): { detected?: JsonValue } | undefined {
  const { detect, prefix } = extension.manifest

  if (detect?.paths?.length) {
    // The first that names something, as a variable's folder while it's set, is the one that counts.
    const named = detect.paths
      .map((path) => placedPath(path, { ...place, root: project.root }))
      .find((path) => path !== undefined)

    if (named !== undefined && place.exists(named)) {
      return { detected: { path: named } }
    }
  }

  if (detect?.entities && project.entities?.includes(prefix)) {
    return {}
  }

  return (detect?.peers ?? detect === undefined) && peersDeclared(extension, project.pkg) ? {} : undefined
}

/** Whether the project's package.json declares one of the packages the extension's peer dependencies name. */
function peersDeclared({ versions }: ExtensionPackage, pkg: PackageManifest): boolean {
  if (!versions) {
    return false
  }

  // A package that ships the tool in its place counts, as Vite+ ships Vite.
  const packages = [...versions.packages, ...Object.keys(versions.distributions ?? {})]

  return detectPeers(pkg, { ...versions, packages }).found
}
