import {
  type ConnectorInfo,
  type Found,
  isPlaceable,
  offered,
  pictureCredit,
  type Searched
} from "@parity-app/connectors"
import type { ImageDetails } from "@parity-app/core"
import { keepImageDetails, mediaWords } from "@parity-app/editor"
import { toast } from "sonner"
import type { DesignStore } from "../design-store.ts"
import { openLibraryBrowser } from "../library/library-browser.ts"
import { reportError } from "../report-error.ts"
import { request } from "../service.ts"
import type { ProjectSession } from "../workspace.ts"
import { mediaFilesOf } from "./project-media.ts"

/*
 * Adding stock pictures and videos to the project from the Media tab (PAR-839, PAR-841). The library browser searches
 * the stock library, and what's picked is saved into `public/images/` or `public/videos/`, since a stock library's links
 * only show results. The project's main file keeps what each shows and who made it, so the Media tab credits it before
 * any layer uses it.
 */

/** The stock library the Media tab searches: the first offered connector that finds photos. */
export const stockLibrary: ConnectorInfo | undefined = offered.find(({ info }) => info.finds.includes("photos"))?.info

/** Opens the library browser on the stock library, on a search when one is given, to add what's picked. */
export function findStock(
  session: Pick<ProjectSession, "id" | "info" | "store" | "untilClosed">,
  query?: string
): void {
  const library = stockLibrary

  if (!library) {
    return
  }

  const search: Searched | undefined = query ? { query, filters: {} } : undefined

  openLibraryBrowser({
    library,
    search,
    pick: {
      label: (count) => (count === 0 ? "Add to project" : `Add ${count} to project`),
      accepts: isPlaceable,
      take: (picked) => void addStock(session, library, picked)
    }
  })
}

/** A picture or video saved into the project, by the result it came from. */
interface Saved {
  found: Found
  src: string
  path: string
}

/** Picked results in words: "the video", "3 images", "4 files" for some of each. */
function pickedWords(picked: readonly Found[]): string {
  const videos = picked.filter((found) => found.video).length

  return mediaWords({ images: picked.length - videos, videos })
}

/**
 * Saves picked pictures and videos into the project, one at a time in the order picked, saying so while it does. A
 * video saves its footage, not its poster. What each shows and who made it go into the main file as one step, each
 * counts as used once, and they arrive on the wall marked. Any that fail to save are named, and the rest are kept.
 */
export async function addStock(
  session: Pick<ProjectSession, "id" | "info" | "store" | "untilClosed">,
  library: ConnectorInfo,
  picked: readonly Found[]
): Promise<void> {
  const progress = toast.loading(`Adding ${pickedWords(picked)} from ${library.name}…`)

  const saved: Saved[] = []
  const failed: { found: Found; error: unknown }[] = []

  for (const found of picked) {
    try {
      const { src, path } = await request("images.saveFrom", {
        projectId: session.id,
        url: found.video?.url ?? found.image.url,
        name: found.title
      })

      saved.push({ found, src, path })
    } catch (error) {
      failed.push({ found, error })
    }
  }

  if (failed.length > 0) {
    const [first] = failed

    reportError(first?.error, {
      operation: "images.saveFrom",
      title:
        failed.length === 1
          ? `Couldn't add ${first?.found.title}`
          : `Couldn't add ${pickedWords(failed.map(({ found }) => found))}`,
      context: { pictures: failed.length },
      id: progress
    })
  } else {
    toast.dismiss(progress)
  }

  if (saved.length === 0) {
    return
  }

  keepDetails(session.store, library, saved)

  for (const { found, path } of saved) {
    void window.canvasHost.connectors.placed({
      connector: found.connector,
      id: found.id,
      project: session.info.root,
      file: path,
      design: "media"
    })
  }

  const media = mediaFilesOf(session)
  await media.scan()
  media.markFresh(saved.map(({ src }) => src))
}

/** Records what each saved picture or video shows and who made it in the project's main file, as one step. */
function keepDetails(store: DesignStore, library: ConnectorInfo, saved: readonly Saved[]): void {
  const main = store.getDocuments().find((entry) => entry.path === store.mainPath)

  if (!main) {
    return
  }

  const details = Object.fromEntries(
    saved.map(({ found, path }): [string, ImageDetails] => {
      const credit = pictureCredit(found, library)

      return [path, credit ? { alt: found.title, credit } : { alt: found.title }]
    })
  )

  const label =
    saved.length === 1 ? `Add ${saved[0]?.found.title}` : `Add ${pickedWords(saved.map(({ found }) => found))}`

  store.applyDocuments(label, [{ path: main.path, document: keepImageDetails(main.document, details) }])
}
