import { dirname, isAbsolute } from "node:path"
import { findPackage, packageEntry, type PnpProject, pnpProject, splitSpecifier } from "@parity-app/project"
import type * as Vite from "vite"

/*
 * In a Plug'n'Play project, Vite asks Yarn's runtime where every bare import leads. For a file outside the project,
 * such as Parity's guest modules and the packages they import, Yarn answers as Node would, with the file `require`
 * would load rather than the package's folder Vite expects, so Vite can't resolve them. Those imports are resolved
 * here instead.
 */

/**
 * Resolves bare imports from files outside a Plug'n'Play project, or nothing for a project installed another way. The
 * renderer's runtime packages, React among them, resolve as the project's own files get them, so the guest shares the
 * app's copy, the one Vite's optimizer bundled.
 */
export function importsOutsidePnp(root: string, runtimePackages: readonly string[]): Vite.Plugin | undefined {
  const project = pnpProject(root)
  const inProject = `${root.replaceAll("\\", "/")}/package.json`

  return (
    project && {
      name: "canvas:imports-outside-pnp",
      enforce: "pre",
      async resolveId(id, importer, options) {
        const outside = outsideImport(project, id, importer)

        if (!outside) {
          return undefined
        }

        return runtimePackages.includes(outside.name)
          ? this.resolve(id, inProject, { ...options, skipSelf: true })
          : resolveOutsidePnp(outside)
      }
    }
  )
}

/** A bare import from a file outside the project: its package and importer. Nothing for any other import. */
export function outsideImport(
  project: PnpProject,
  id: string,
  importer: string | undefined
): { name: string; subpath: string; file: string } | undefined {
  const file = importer?.split("?")[0]

  // Bare specifiers only: not relative, absolute, a URL, `node:` or a virtual module's `\0` id.
  if (!file || !isAbsolute(file) || !/^[@\w]/.test(id) || id.includes(":") || project.api.findPackageLocator(file)) {
    return undefined
  }

  return { ...splitSpecifier(id), file }
}

/**
 * Where a bare import from a file outside the project leads: the package found the way Node finds it from that file,
 * and the module its exports give a browser. Nothing when it isn't there, which Vite then reports.
 */
export async function resolveOutsidePnp({
  name,
  subpath,
  file
}: {
  name: string
  subpath: string
  file: string
}): Promise<string | undefined> {
  const installed = await findPackage(dirname(file), name)

  return (installed && packageEntry(installed, "browser", subpath))?.replaceAll("\\", "/")
}
