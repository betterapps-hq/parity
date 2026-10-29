import { useSyncExternalStore } from "react"
import { type Editor, useEditor } from "tldraw"

const hosts = new WeakMap<Editor, HTMLElement>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Where design titles draw: a layer in the canvas's page space, above every board. Each board is a layer of its
 * own, so a title drawn inside its board would sit under any board drawn after it. Mounted as tldraw's `OnTheCanvas`.
 */
export function TitleLayer() {
  const editor = useEditor()
  return (
    <div
      ref={(element) => {
        if (element) hosts.set(editor, element)
        else hosts.delete(editor)
        for (const listener of listeners) listener()
      }}
      className="pointer-events-none absolute top-0 left-0 z-[1000000]"
    />
  )
}

/** A canvas's title layer, once it's mounted. */
export function useTitleLayer(editor: Editor): HTMLElement | undefined {
  return useSyncExternalStore(subscribe, () => hosts.get(editor))
}
