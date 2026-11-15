import {
  type BuilderAdapter,
  type EntitiesAdapter,
  type ExtensionTool,
  extensionBuilder,
  extensionEntities,
  extensionRenderer,
  extensionTool,
  type RendererAdapter
} from "@parity-app/core"
import { findComponents } from "@parity-app/extension-react/components"
import reactExtension from "@parity-app/extension-react/package.json" with { type: "json" }
import { rspackBuilder } from "@parity-app/extension-rspack/builder"
import rspackExtension from "@parity-app/extension-rspack/package.json" with { type: "json" }
import storybookExtension from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { exportStoryScreen, importStoryScreens } from "@parity-app/extension-storybook/screens"
import tailwindExtension from "@parity-app/extension-tailwind/package.json" with { type: "json" }
import routerExtension from "@parity-app/extension-tanstack-router/package.json" with { type: "json" }
import { turbopackBuilder } from "@parity-app/extension-turbopack/builder"
import turbopackExtension from "@parity-app/extension-turbopack/package.json" with { type: "json" }
import { viteBuilder } from "@parity-app/extension-vite/builder"
import viteExtension from "@parity-app/extension-vite/package.json" with { type: "json" }

/*
 * Parity's own extensions, run here rather than in hosts of their own (PAR-1095): each as its manifest describes it,
 * with its code called directly, so the validation projects are detected as the app detects them.
 */

/** React's renderer, reading components here. */
export const renderers: RendererAdapter[] = [{ ...extensionRenderer(reactExtension)!, findComponents }]

/** Vite's, Rspack's and Turbopack's builders, each with its entry module's detection and start. */
export const builders: BuilderAdapter[] = [
  { ...viteBuilder, ...extensionBuilder(viteExtension)! },
  { ...rspackBuilder, ...extensionBuilder(rspackExtension)! },
  { ...turbopackBuilder, ...extensionBuilder(turbopackExtension)! }
]

/** Storybook's entities provider, importing and exporting here. */
export const entities: EntitiesAdapter[] = [
  { ...extensionEntities(storybookExtension)!, import: importStoryScreens, export: exportStoryScreen }
]

/** The tools of extensions that open projects with nothing else of theirs: Tailwind CSS and TanStack Router. */
export const tools: ExtensionTool[] = [tailwindExtension, routerExtension].flatMap(
  (found) => extensionTool(found) ?? []
)
