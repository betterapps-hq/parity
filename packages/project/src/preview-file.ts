import { readdir } from "node:fs/promises"
import { join } from "node:path"

/** Where a project keeps its preview file for Parity, from its root. */
export const previewFolder = ".parity"

/** The preview file's names, in the order one is picked when there are several, as Storybook takes `preview.*`. */
const previewNames = ["preview.tsx", "preview.ts", "preview.jsx", "preview.js", "preview.mjs"]

/**
 * The project's preview file for Parity, relative to its root (`.parity/preview.tsx`), if it has one. A project
 * written in JavaScript names it `preview.jsx` or `preview.js`, so its own loaders compile it as they do its other
 * files.
 */
export async function findPreviewFile(root: string): Promise<string | undefined> {
  const names = await readdir(join(root, previewFolder)).catch(() => [])
  const found = previewNames.find((name) => names.includes(name))

  return found && `${previewFolder}/${found}`
}
