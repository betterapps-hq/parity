import { designsUsing, type HistoryEntry, type ProjectImage, removalOf, removeLayers } from "@parity-app/editor"
import { announceEdit } from "../chrome/project-edits.tsx"
import { containerKey } from "../design-store.ts"
import { reportError } from "../report-error.ts"
import { request } from "../service.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { mediaFilesOf } from "./project-media.ts"

/*
 * Removing one of the project's media from the Media tab (PAR-836), as `removalOf` in `@parity-app/editor` decides:
 * its file, the layers that show it, or both. The layers go as one step of the designs' history, and the file as an
 * edit to the project's files, whose Undo puts the file back and, while nothing has changed since, the layers too.
 * One the project's code names isn't removed here: the tab says where it's named instead.
 */

/** Removes an image, with whatever its removal takes. */
export async function removeMedia(
  session: ProjectDesigns & Pick<ProjectSession, "id" | "untilClosed">,
  image: ProjectImage
): Promise<void> {
  const removal = removalOf(image)

  if (removal === "code") {
    return
  }

  const layers = removal === "file" ? undefined : removeLayersShowing(session, image)

  if (removal === "layers" || !image.path) {
    return
  }

  const putBackLayers = () => {
    // Only while removing the layers is still the step Undo would take back, so nothing done since is lost.
    if (layers && session.store.getUndoStep() === layers) {
      session.store.undo()
    }
  }

  const files = mediaFilesOf(session)

  try {
    const { edit } = await request("images.remove", { projectId: session.id, path: image.path })

    announceEdit(session.id, edit, {
      afterUndo: async () => {
        putBackLayers()
        await files.scan()
      }
    })
  } catch (error) {
    // The file stayed, so its layers come back too.
    putBackLayers()
    reportError(error, { operation: "images.remove", title: `Couldn't remove ${image.name}` })

    return
  }

  await files.scan()
}

/**
 * Removes every layer that shows an image, in every design, as one step, and returns that step. A selected layer
 * among them leaves its design selected.
 */
function removeLayersShowing(session: ProjectDesigns, image: ProjectImage): HistoryEntry | undefined {
  const { store, selection } = session
  const designs = designsUsing(image)
  const keys = designs.map((design) => containerKey(design.document, design.design))
  const label = `Remove ${image.name}`

  store.updateContainers(keys, label, (containers) =>
    containers.map((container, index) => removeLayers(container, designs[index]?.layers ?? []).container)
  )

  const current = selection.get()

  const removed = designs.some(
    (design, index) => keys[index] === current.design && current.node && design.layers.includes(current.node)
  )

  if (removed) {
    selection.set({ design: current.design })
  }

  return store.getUndoStep()
}
