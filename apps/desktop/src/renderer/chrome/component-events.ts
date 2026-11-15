import { detachInstance, findNode, pushOverrides } from "@parity-app/core"
import { type ProjectDoc, type TransactResult, updateContainer, updateContainers } from "@parity-app/multiplayer"
import { type DocSession, projectLibrary } from "../project-doc.ts"
import { track } from "../report-error.ts"

/**
 * `component.changed` (PAR-728): what Detach, Push to main or Make component did to which design's layers, and the
 * component, by id.
 */
export function recordComponentChange(
  action: "detach" | "push" | "extract",
  design: string,
  layers: readonly string[],
  component: string
): void {
  track("component.changed", { action, design, layers: [...layers], component })
}

/**
 * Detaches one of a design's instances into plain layers, as one undo step, and records it, from the inspector's Detach
 * and Object > Detach instance alike. One that changed nothing records nothing; one that throws records nothing
 * either.
 */
export function detachAndRecord(designs: DocSession, key: string, instanceId: string): void {
  const root = designs.doc.design(key)?.root
  const instance = root && findNode(root, instanceId)

  if (instance?.type !== "instance") {
    return
  }

  const library = projectLibrary(designs)

  const changed = changes(
    updateContainer(designs.doc, key, "Detach instance", (container) => detachInstance(container, instanceId, library))
  )

  if (changed) {
    recordComponentChange("detach", key, [instanceId], instance.design)
  }
}

/**
 * Pushes a copy's overrides to the component it follows, so every instance gets them, as one undo step, and records
 * it. Given `inner`, only the overrides of that layer inside the copy, by its key in the overrides and its path.
 */
export function pushAndRecord(
  doc: ProjectDoc,
  key: string,
  mainKey: string,
  instanceId: string,
  inner?: { key: string; path: string }
): void {
  const main = doc.design(mainKey)

  if (!main) {
    return
  }

  const changed = changes(
    updateContainers(doc, [key, mainKey], `Push to ${main.name}`, ([design, component]) => {
      const pushed = pushOverrides(design!, instanceId, component!, inner && [inner.key])

      return [pushed.container, pushed.component]
    })
  )

  if (changed) {
    recordComponentChange("push", key, [inner?.path ?? instanceId], main.id)
  }
}

/** Whether a change was made: applied, and not one that left everything as it was. */
function changes(result: TransactResult): boolean {
  return result.ok && result.change !== undefined
}
