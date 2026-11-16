import { appPageModeScript } from "@parity-app/project"
import type * as Vite from "vite"

/**
 * Puts `appPageModeScript` first in the app's own page, served by the guest's development server alone, before any of
 * the app's own scripts run.
 */
export function appPageModes(): Vite.Plugin {
  return {
    name: "canvas:app-page-modes",
    apply: "serve",
    transformIndexHtml: () => [{ tag: "script", children: appPageModeScript, injectTo: "head-prepend" }]
  }
}
