import type { CameraPort } from "@parity-app/editor"
import { type Editor, react } from "tldraw"

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
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          listener()
        }
      }

      window.addEventListener("keydown", onKey, true)

      return () => window.removeEventListener("keydown", onKey, true)
    },
    frame: (callback) => {
      const id = requestAnimationFrame(callback)

      return () => cancelAnimationFrame(id)
    },
    now: () => performance.now()
  }
}
