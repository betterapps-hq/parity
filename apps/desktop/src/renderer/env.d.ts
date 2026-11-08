/// <reference types="vite/client" />
import type { TelemetryHost } from "../preload/telemetry.ts"
import type { CanvasHost } from "../shared/protocol.ts"

declare global {
  interface Window {
    canvasHost: CanvasHost
    /** Missing outside Electron, as in Storybook. */
    parityTelemetry?: TelemetryHost
  }

  interface ImportMetaEnv {
    /** tldraw's license key. Without one, tldraw shows its license notice on the canvas. */
    readonly VITE_TLDRAW_LICENSE_KEY?: string
  }
}
