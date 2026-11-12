import { findNode } from "@parity-app/core"
import { type ExportSize, exportFiles, selectedDesigns, selectedNodes } from "@parity-app/editor"
import type { EventAttributes, registeredEvents } from "@parity-app/telemetry"
import { toast } from "sonner"
import { layerLabel } from "../canvas/kinds.tsx"
import { errorCode, errorMessage, reportError, track } from "../report-error.ts"
import { request } from "../service.ts"
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
    toast.success("Bitmap cache cleared", { duration: 2000 })
  } catch (error) {
    reportError(error, {
      operation: "frames.clearStored",
      title: "The bitmap cache couldn't be cleared",
      description: errorMessage(error)
    })
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
  const { store } = session
  const selection = session.selection.get()
  const entry = selection.design ? store.getEntry(selection.design) : undefined
  const nodes = selectedNodes(selection)
  const entries = store.getEntries()
  const library = store.getComponentLibrary()

  return entry && nodes.length > 0
    ? nodes.flatMap((node) => {
        const layer = findNode(entry.container.root, node)

        return layer
          ? [{ design: entry.key, node, name: layerLabel(layer, entries, library, session.info.libraries) }]
          : []
      })
    : selectedDesigns(selection).flatMap((key) => {
        const design = store.getEntry(key)

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

  const began = performance.now()

  const files = exportFiles(
    targets.map((target) => target.name),
    sizes
  )

  const progress = toast.loading(
    files.length === 1 ? `Exporting ${files[0]!.name}…` : `Exporting ${files.length} files…`
  )

  const exported: Exported = {
    kind: "layers",
    formats: [...new Set(sizes.map((size) => size.format))],
    scales: [...new Set(sizes.map((size) => size.scale))],
    designs: targets.length
  }

  try {
    const { files: written, warnings } = await request("layers.export", {
      projectId,
      folder,
      layers: targets.map(({ design, node }) => (node ? { design, node } : { design })),
      files
    })

    track("export.done", {
      ...exported,
      durationMs: since(began),
      files: written.length,
      warnings: warnings.length
    })
    toast.success(written.length === 1 ? "Exported 1 file" : `Exported ${written.length} files`, {
      id: progress,
      description: folder,
      action: written[0] ? { label: "Show", onClick: () => void window.canvasHost.showItem(written[0]!) } : undefined
    })

    if (warnings.length > 0) {
      toast.warning("Some layers couldn't be drawn", {
        description: warnings.join("\n"),
        classNames: { description: "whitespace-pre-line" }
      })
    }
  } catch (error) {
    trackExportFailed({ ...exported, durationMs: since(began) }, error)
    reportError(error, {
      operation: "layers.export",
      title: "Couldn't export",
      id: progress,
      description: errorMessage(error)
    })
  }
}

/** What an export wrote, for `export.done` and `export.failed`, which add how long it took. */
type Exported = Omit<EventAttributes<typeof registeredEvents, "export.failed">, "code" | "durationMs">

/** The whole milliseconds since `began`, a `performance.now()`. */
function since(began: number): number {
  return Math.round(performance.now() - began)
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
 * File > Export all: renders every design, in each of its states and the modes shown beside it, to PNGs at the export
 * scale, in a folder the person picks.
 */
export async function exportAllImages(
  session: Pick<ProjectSession, "id" | "store"> | undefined = activeSession()
): Promise<void> {
  if (!session) {
    return
  }

  const { store } = session
  const designs = store.getEntries().map((entry) => entry.key)

  if (designs.length === 0) {
    toast.info("There are no screens or components to export")

    return
  }

  const folder = await window.canvasHost.pickFolder("Export images to")

  if (!folder) {
    return
  }

  const began = performance.now()
  const scale = getPreferences().exportScale
  const named = designs.length === 1 ? store.getEntry(designs[0]!)?.container.name : undefined
  const progress = toast.loading(`Exporting ${named ?? store.designsLabel(designs)}…`)
  const exported: Exported = { kind: "designs", formats: ["png"], scales: [scale], designs: designs.length }

  try {
    // Designs export as they are on the canvas, saved or not, and exporting doesn't save them.
    const { files, warnings } = await request("designs.export", {
      projectId: session.id,
      folder,
      designs,
      scale
    })

    track("export.done", { ...exported, durationMs: since(began), files: files.length, warnings: warnings.length })
    toast.success(files.length === 1 ? "Exported 1 image" : `Exported ${files.length} images`, {
      id: progress,
      description: folder,
      action: files[0] ? { label: "Show", onClick: () => void window.canvasHost.showItem(files[0]!) } : undefined
    })

    if (warnings.length > 0) {
      toast.warning("Some previews had problems", {
        description: warnings.join("\n"),
        // One warning to a line.
        classNames: { description: "whitespace-pre-line" }
      })
    }
  } catch (error) {
    trackExportFailed({ ...exported, durationMs: since(began) }, error)
    reportError(error, {
      operation: "designs.export",
      title: "Couldn't export",
      id: progress,
      description: errorMessage(error)
    })
  }
}

export function exit(): void {
  void window.canvasHost.quit()
}

/** The selected design, when it's selected on its own rather than one of its layers. */
export function selectedDesign(session: ProjectDesigns | undefined = activeSession()) {
  const current = session?.selection.get()

  return current?.design && !current.node && !current.designs?.length
    ? session?.store.getEntry(current.design)
    : undefined
}
