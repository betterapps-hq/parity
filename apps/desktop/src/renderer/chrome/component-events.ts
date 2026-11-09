import { detachInstance, findNode, pushOverrides } from "@parity-app/core"
import type { DesignStore } from "../design-store.ts"
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

type Store = Pick<DesignStore, "getEntry" | "updateContainer" | "updateContainers" | "getComponentLibrary">

/**
 * Detaches one of a design's instances into plain layers, as one undo step, and records it, from the inspector's Detach
 * and Object > Detach instance alike. One the store didn't change records nothing; one that throws records nothing
 * either.
 */
export function detachAndRecord(store: Store, key: string, instanceId: string): void {
  const root = store.getEntry(key)?.container.root
  const instance = root && findNode(root, instanceId)
  if (instance?.type !== "instance") return
  const library = store.getComponentLibrary()
  const changed = changes(store, [key], () =>
    store.updateContainer(key, "Detach instance", (container) => detachInstance(container, instanceId, library))
  )
  if (changed) recordComponentChange("detach", key, [instanceId], instance.design)
}

/**
 * Pushes a copy's overrides to the component it follows, so every instance gets them, as one undo step, and records
 * it. Given `inner`, only the overrides of that layer inside the copy, by its key in the overrides and its path.
 */
export function pushAndRecord(
  store: Store,
  key: string,
  mainKey: string,
  instanceId: string,
  inner?: { key: string; path: string }
): void {
  const main = store.getEntry(mainKey)
  if (!main) return
  const changed = changes(store, [key, mainKey], () =>
    store.updateContainers([key, mainKey], `Push to ${main.container.name}`, ([design, component]) => {
      const pushed = pushOverrides(design!, instanceId, component!, inner && [inner.key])
      return [pushed.container, pushed.component]
    })
  )
  if (changed) recordComponentChange("push", key, [inner?.path ?? instanceId], main.container.id)
}

/** Makes a change and says whether any of the designs with these keys is different afterwards. */
function changes(store: Pick<DesignStore, "getEntry">, keys: readonly string[], change: () => void): boolean {
  const before = keys.map((key) => store.getEntry(key)?.container)
  change()
  return keys.some((key, index) => store.getEntry(key)?.container !== before[index])
}
