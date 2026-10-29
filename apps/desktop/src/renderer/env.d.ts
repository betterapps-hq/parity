/// <reference types="vite/client" />
import type { CanvasHost } from "../shared/protocol.ts"

declare global {
  interface Window {
    canvasHost: CanvasHost
  }

  interface ImportMetaEnv {
    /** tldraw's license key. Without one, tldraw shows its license notice on the canvas. */
    readonly VITE_TLDRAW_LICENSE_KEY?: string
  }
}
