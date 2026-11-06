import { createHash } from "node:crypto"
import { readdir, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { finiteNumber, jsonText, parseData } from "@parity-app/core"
import { z } from "zod"
import type { PictureFrame, PictureScreen, ProjectPicture } from "../shared/protocol.ts"
import { writeWhole } from "./bitmap-store.ts"
import { environment } from "./environment.ts"
import { topOfPicture } from "./webp.ts"

/**
 * Projects' pictures for the start page (PAR-607), one JSON file each in Parity's app data, which main names
 * (`PARITY_PICTURE_DIR`). The window takes one when a project opens and after each save, and Home reads them back. They
 * aren't a cache: Clear bitmap cache leaves them, and one goes only when the start page stops listing its project.
 * Without a folder, as in tests, nothing is kept.
 */
const folder = environment().PARITY_PICTURE_DIR

/** How long a file being written can sit beside its name before it counts as left behind. */
const partialMs = 60_000

const dataImage = z
  .string()
  .regex(/^data:image\/(?:webp|png);base64,[\d+/=A-Za-z]+$/, "expected a WebP or PNG as a data URL")
const pictureFrame = z.object({
  src: dataImage,
  mode: z.string(),
  width: finiteNumber.positive(),
  height: finiteNumber.positive()
})
const keptPicture = jsonText(
  z.object({
    root: z.string(),
    taken: finiteNumber,
    screens: z.array(z.object({ name: z.string(), main: pictureFrame, phone: pictureFrame.optional() }))
  })
)

/**
 * Keeps a project's picture, in place of the one before, with each frame cut to the top of its window, which is all a
 * picture shows. Gives back the picture as it's kept.
 */
export async function storePicture(root: string, picture: ProjectPicture): Promise<ProjectPicture> {
  const kept: ProjectPicture = { taken: picture.taken, screens: await Promise.all(picture.screens.map(cutScreen)) }
  if (folder) await writeWhole(pictureFile(folder, root), Buffer.from(JSON.stringify({ root, ...kept })))
  return kept
}

/** The pictures kept for these projects, by root. One not kept, or that can't be read, is left out. */
export async function readPictures(roots: readonly string[]): Promise<Record<string, ProjectPicture>> {
  if (!folder) return {}
  const dir = folder
  const read = await Promise.all(roots.map(async (root) => [root, await readPicture(dir, root)] as const))
  return Object.fromEntries(read.filter((entry): entry is readonly [string, ProjectPicture] => entry[1] !== undefined))
}

/**
 * Lets go of every project's picture but these, and of files a write left behind over a minute ago. One being written
 * now is left alone.
 */
export async function keepOnlyPictures(roots: readonly string[]): Promise<void> {
  if (!folder) return
  const dir = folder
  const kept = new Set(roots.map((root) => fileName(root)))
  const names = await readdir(dir).catch((): string[] => [])
  const now = Date.now()
  await Promise.all(
    names
      .filter((name) => !kept.has(name))
      .map(async (name) => {
        const file = join(dir, name)
        if (name.endsWith(".partial")) {
          const { mtimeMs } = await stat(file).catch(() => ({ mtimeMs: now }))
          if (now - mtimeMs < partialMs) return
        }
        await rm(file, { force: true }).catch(() => undefined)
      })
  )
}

async function readPicture(dir: string, root: string): Promise<ProjectPicture | undefined> {
  try {
    const { root: of, taken, screens } = parseData(keptPicture, await readFile(pictureFile(dir, root), "utf8"))
    // Each file says whose it is, so a root never reads another's picture.
    return of === root ? { taken, screens } : undefined
  } catch {
    return undefined
  }
}

async function cutScreen(screen: PictureScreen): Promise<PictureScreen> {
  const main = await cutFrame(screen.main)
  return screen.phone ? { ...screen, main, phone: await cutFrame(screen.phone) } : { ...screen, main }
}

/** A frame's bitmap cut to the top of its window; as it was when it's no taller, or sharp can't cut it. */
async function cutFrame(frame: PictureFrame): Promise<PictureFrame> {
  const data = /^data:image\/(?:webp|png);base64,(.*)$/s.exec(frame.src)?.[1]
  if (!data) return frame
  const top = await topOfPicture(Buffer.from(data, "base64"), frame.height / frame.width).catch(() => undefined)
  return top ? { ...frame, src: `data:image/webp;base64,${top.toString("base64")}` } : frame
}

function pictureFile(dir: string, root: string): string {
  return join(dir, fileName(root))
}

/** A project's file's name: its root hashed, so any root makes a safe name. */
function fileName(root: string): string {
  return `${createHash("sha256").update(root).digest("hex").slice(0, 32)}.json`
}
