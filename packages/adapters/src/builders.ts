import { type BuilderAdapter, extensionBuilder } from "@parity-app/core"
import { viteBuilder } from "@parity-app/extension-vite/builder"
import viteExtension from "@parity-app/extension-vite/package.json" with { type: "json" }

/**
 * The builders Parity opens projects with: Vite's, as its extension's manifest describes it, with its entry module's
 * detection and start. A builder's own process imports only these, so it doesn't load the other extensions' code, such
 * as React's TypeScript.
 */
export const builders: BuilderAdapter[] = [{ ...viteBuilder, ...extensionBuilder(viteExtension)! }]
