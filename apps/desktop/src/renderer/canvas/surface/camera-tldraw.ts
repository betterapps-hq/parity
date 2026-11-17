import type { CameraPort } from "@parity-app/editor"
import { type Editor, react } from "tldraw"

/** Each canvas's Esc listeners: the camera's, so following ends. */
const escapeListeners = new WeakMap<Editor, Set<() => boolean>>()

/**
 * Esc on the canvas, offered to its camera before the canvas's own shortcuts step back out of the selection, since
 * they take the key (`useShortcuts`). Says whether the camera took it, as it does when it ended following.
 */
export function escapeOnCanvas(editor: Editor): boolean {
  let taken = false

  for (const listener of escapeListeners.get(editor) ?? []) {
    taken = listener() || taken
  }

  return taken
}

/** The camera service's view of a tldraw editor: its camera, its viewport and the canvas's zoom limits. */
export function tldrawCameraPort(editor: Editor): CameraPort {
  /** Calls `listener` each time `read` changes, not on the first read. */
  const onChanged = (name: string, read: () => void, listener: () => void) => {
    let first = true

    return react(name, () => {
      read()

      if (first) {
        first = false
      } else {
        listener()
      }
    })
  }

  return {
    camera: () => {
      const { x, y, z } = editor.getCamera()

      return { x, y, z }
    },
    viewport: () => {
      const { w, h } = editor.getViewportScreenBounds()

      return { width: w, height: h }
    },
    zoomLimits: () => {
      const steps = editor.getCameraOptions().zoomSteps

      return { min: steps[0] ?? 0.01, max: steps.at(-1) ?? 8 }
    },
    setCamera: (camera) => editor.setCamera(camera, { immediate: true }),
    onCamera: (listener) =>
      onChanged(
        "surface camera",
        () => {
          editor.getCamera()
          editor.getViewportScreenBounds()
        },
        listener
      ),
    onNavigate: (listener) =>
      onChanged(
        "surface page",
        () => {
          editor.getCurrentPageId()
        },
        listener
      ),
    onEscape: (listener) => {
      const listeners = escapeListeners.get(editor) ?? new Set()
      escapeListeners.set(editor, listeners)
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    frame: (callback) => {
      const id = requestAnimationFrame(callback)

      return () => cancelAnimationFrame(id)
    },
    now: () => performance.now()
  }
}
