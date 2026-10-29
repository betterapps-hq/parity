/// <reference types="vite/client" />
import type { CanvasHost } from "../shared/protocol.ts"

declare global {
  interface Window {
    canvasHost: CanvasHost
  }
}
