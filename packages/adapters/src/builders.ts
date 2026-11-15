import { type BuilderAdapter, extensionBuilder } from "@parity-app/core"
import { rspackBuilder } from "@parity-app/extension-rspack/builder"
import rspackExtension from "@parity-app/extension-rspack/package.json" with { type: "json" }
import { viteBuilder } from "@parity-app/extension-vite/builder"
import viteExtension from "@parity-app/extension-vite/package.json" with { type: "json" }

/**
 * The builders Parity opens projects with: Vite's and Rspack's, as their extensions' manifests describe them, with
 * their entry modules' detection and start. A builder's own process imports only these, so it doesn't load the other extensions' code, such
 * as React's TypeScript.
 */
export const builders: BuilderAdapter[] = [
  { ...viteBuilder, ...extensionBuilder(viteExtension)! },
  { ...rspackBuilder, ...extensionBuilder(rspackExtension)! }
]
