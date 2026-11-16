import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import type { PackageManifest, PreviewComposer, PreviewDescription } from "@parity-app/core"

/** Where a project keeps its preview file for Parity, from its root. */
export const previewFolder = ".parity"

/** The preview file's names, in the order one is picked when there are several, as Storybook takes `preview.*`. */
export const previewNames = ["preview.tsx", "preview.ts", "preview.jsx", "preview.js", "preview.mjs"]

/**
 * The project's preview file for Parity, relative to its root (`.parity/preview.tsx`), if it has one. A project
 * written in JavaScript names it `preview.jsx` or `preview.js`, so its own loaders compile it as they do its other
 * files.
 */
export async function findPreviewFile(root: string): Promise<string | undefined> {
  const names = await readdir(join(root, previewFolder)).catch((): string[] => [])
  const found = previewNames.find((name) => names.includes(name))

  return found && `${previewFolder}/${found}`
}

/** The preview every frame draws in, as `ProjectConfig` holds it. */
export interface ProjectPreviewFile {
  preview?: string
  previewComposer?: PreviewComposer
}

/**
 * The preview every frame draws in: Parity's file when there is one, which replaces a tool's on the canvas, else the
 * first preview an extension names for its tool (PAR-98) whose file is there and whose composing package the project
 * depends on, else none. Parity knows no tool's files itself: Storybook's extension names `.storybook/preview.*`.
 */
export async function findProjectPreview(
  root: string,
  pkg: PackageManifest,
  previews: readonly PreviewDescription[] = []
): Promise<ProjectPreviewFile> {
  const own = await findPreviewFile(root)

  if (own) {
    return { preview: own }
  }

  const installed = { ...pkg.devDependencies, ...pkg.dependencies }

  for (const { id, files, compose } of previews) {
    const module = compose.from.find((name) => name in installed)
    const path = module && (await firstExisting(root, files))

    if (module && path) {
      return { preview: path, previewComposer: { api: compose.api, module, extension: id } }
    }
  }

  return {}
}

async function firstExisting(root: string, files: readonly string[]): Promise<string | undefined> {
  for (const file of files) {
    if ((await stat(join(root, file)).catch(() => undefined))?.isFile()) {
      return file
    }
  }

  return undefined
}
