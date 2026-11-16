import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { findPreviewFile, offerPreviewFile, type PreviewOffer } from "@parity-app/project"

/**
 * The preview file to offer for the project at `root` (PAR-104): built from the providers its entry renders, and only
 * while it has no preview file of its own.
 */
export async function previewOffer(root: string): Promise<PreviewOffer | undefined> {
  if (await findPreviewFile(root)) {
    return undefined
  }

  return offerPreviewFile((path) => readFile(join(root, path), "utf8").catch(() => undefined))
}

/**
 * Writes the offered preview file, read again from the project as it is now, so what's written is what the person
 * reviewed unless the app changed meanwhile. It never replaces a preview file: one written since the offer was made
 * fails the write. Detection watches the preview file, so the project opens again with it and its frames redraw.
 */
export async function writePreviewFile(root: string): Promise<{ file: string }> {
  const offer = await previewOffer(root)

  if (!offer) {
    throw new Error("The project has a preview file already, or its entry no longer renders any providers")
  }

  const path = join(root, offer.file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, offer.text, { flag: "wx" })

  return { file: offer.file }
}
