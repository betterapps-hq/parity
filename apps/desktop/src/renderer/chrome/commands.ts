import { findNode } from "@parity-app/core"
import { type ExportSize, exportFiles, selectedDesigns, selectedNodes } from "@parity-app/editor"
import { containerEntries, containerEntry, designsLabel } from "@parity-app/multiplayer"
import type { EventAttributes, registeredEvents } from "@parity-app/telemetry"
import { layerLabel } from "../canvas/kinds.tsx"
import { projectLibrary } from "../project-doc.ts"
import { errorCode, reportError, track } from "../report-error.ts"
import { serviceCall } from "../service-call.ts"
import { request } from "../service.ts"
import { lines, notify } from "../toasts.tsx"
import { type ProjectDesigns, type ProjectSession, workspace } from "../workspace.ts"
import { getPreferences } from "./preferences.ts"

/**
 * What the window shares beyond its commands: the active tab's session, what's selected in it, and exporting, which the
 * Export section runs at its own sizes. The commands themselves run only through `actions.ts`, which records them.
 */

export function activeSession(): ProjectSession | undefined {
  return workspace.getActive()?.session
}

/**
 * Removes the frame bitmaps kept on disk (PAR-158). The canvas keeps showing the ones it has, and new ones are kept
 * again as frames are captured.
 */
export async function clearBitmapCache(): Promise<void> {
  try {
    await request("frames.clearStored", undefined)
    notify.done("Cleared the bitmap cache", { timeout: 2000 })
  } catch (error) {
    reportError(error, { operation: "frames.clearStored", title: "Couldn't clear the cache" })
  }
}

/** A design, or a layer of one, to export, with the name its files take. */
export interface ExportTarget {
  design: string
  node?: string
  name: string
}

/** What exporting or copying as a PNG acts on: the selected layers, or else the selected designs, named as Layers names them. */
export function selectedTargets(session: ProjectDesigns & Pick<ProjectSession, "info">): ExportTarget[] {
  const { doc } = session
  const selection = session.selection.get()
  const entry = selection.design ? containerEntry(doc, selection.design) : undefined
  const nodes = selectedNodes(selection)
  const entries = containerEntries(doc)
  const library = projectLibrary(session)

  return entry && nodes.length > 0
    ? nodes.flatMap((node) => {
        const layer = findNode(entry.container.root, node)

        return layer
          ? [{ design: entry.key, node, name: layerLabel(layer, entries, library, session.info.libraries) }]
          : []
      })
    : selectedDesigns(selection).flatMap((key) => {
        const design = containerEntry(doc, key)

        return design ? [{ design: key, name: design.container.name }] : []
      })
}

/**
 * Exports designs and layers at `sizes` to a folder the person picks (PAR-185), each file named after its layer (see
 * `exportFiles`), as the canvas draws them, saved or not. A toast says how many files it wrote, with a button to show
 * the first, and warns of any it couldn't draw.
 */
export async function exportLayers(
  projectId: string,
  targets: readonly ExportTarget[],
  sizes: readonly ExportSize[]
): Promise<void> {
  if (targets.length === 0) {
    return
  }

  const folder = await window.canvasHost.pickFolder("Export to")

  if (!folder) {
    return
  }

  const files = exportFiles(
    targets.map((target) => target.name),
    sizes
  )

  const exported: Exported = { kind: "layers", ...writtenAt(sizes), designs: targets.length }

  const run = async (): Promise<void> => {
    const answer = await serviceCall({
      // A layer's name could be any length, so the notification counts files.
      progress: files.length === 1 ? "Exporting a file…" : `Exporting ${files.length} files…`,
      run: () =>
        request("layers.export", {
          projectId,
          folder,
          layers: targets.map(({ design, node }) => (node ? { design, node } : { design })),
          files
        }),
      done({ files: written, warnings }, took) {
        track("export.done", { ...exported, durationMs: took, files: written.length, warnings: warnings.length })

        return {
          success: written.length === 1 ? "Exported 1 file" : `Exported ${written.length} files`,
          description: folder,
          action: written[0]
            ? { label: "Open folder", run: () => void window.canvasHost.showItem(written[0]!) }
            : undefined
        }
      },
      failed: {
        operation: "layers.export",
        title: "Couldn't export",
        retry: () => void run(),
        track: (error, took) => trackExportFailed({ ...exported, durationMs: took }, error)
      }
    })

    if (answer && answer.warnings.length > 0) {
      notify.warning("Some layers were left out", { description: lines(answer.warnings) })
    }
  }

  await run()
}

/** What an export wrote, for `export.done` and `export.failed`, which add how long it took. */
type Exported = Omit<EventAttributes<typeof registeredEvents, "export.failed">, "code" | "durationMs">

/** The formats and scales an export at `sizes` writes, each once. */
function writtenAt(sizes: readonly ExportSize[]): Pick<Exported, "formats" | "scales"> {
  return {
    formats: [...new Set(sizes.map((size) => size.format))],
    scales: [...new Set(sizes.map((size) => size.scale))]
  }
}

function trackExportFailed(exported: Exported & { durationMs: number }, cause: unknown): void {
  const failed: EventAttributes<typeof registeredEvents, "export.failed"> = { ...exported }
  const code = errorCode(cause)

  if (code) {
    failed.code = code
  }

  track("export.failed", failed)
}

/**
 * File > Export all: renders every design, in each of its states and the modes shown beside it, at each of the export
 * sizes the Export section writes layers at, in a folder the person picks.
 */
export async function exportAllImages(
  session: Pick<ProjectSession, "id" | "doc"> | undefined = activeSession()
): Promise<void> {
  if (!session) {
    return
  }

  const { doc } = session
  const designs = containerEntries(doc).map((entry) => entry.key)

  if (designs.length === 0) {
    notify.info("Nothing to export", { description: "This project has no screens or components yet." })

    return
  }

  const folder = await window.canvasHost.pickFolder("Export images to")

  if (!folder) {
    return
  }

  const sizes = getPreferences().exportSizes
  const label = designsLabel(doc, designs)
  const exported: Exported = { kind: "designs", ...writtenAt(sizes), designs: designs.length }

  const run = async (): Promise<void> => {
    const answer = await serviceCall({
      // A design's name could be any length, so the notification names its kind.
      progress: `Exporting ${designs.length === 1 ? `a ${label}` : label}…`,
      // Designs export as they are on the canvas, saved or not, and exporting doesn't save them.
      run: () => request("designs.export", { projectId: session.id, folder, designs, sizes }),
      done({ files, warnings }, took) {
        track("export.done", { ...exported, durationMs: took, files: files.length, warnings: warnings.length })

        return {
          success: files.length === 1 ? "Exported 1 image" : `Exported ${files.length} images`,
          description: folder,
          action: files[0] ? { label: "Open folder", run: () => void window.canvasHost.showItem(files[0]!) } : undefined
        }
      },
      failed: {
        operation: "designs.export",
        title: "Couldn't export",
        retry: () => void run(),
        track: (error, took) => trackExportFailed({ ...exported, durationMs: took }, error)
      }
    })

    if (answer && answer.warnings.length > 0) {
      notify.warning("Some images may be incomplete", { description: lines(answer.warnings) })
    }
  }

  await run()
}

export function exit(): void {
  void window.canvasHost.quit()
}

/** The selected design, when it's selected on its own rather than one of its layers. */
export function selectedDesign(session: ProjectDesigns | undefined = activeSession()) {
  const current = session?.selection.get()

  return session && current?.design && !current.node && !current.designs?.length
    ? containerEntry(session.doc, current.design)
    : undefined
}
