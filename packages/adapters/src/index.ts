import { type Adapters, extensionRenderer, peerVersions } from "@parity-app/core"
import { findComponents } from "@parity-app/extension-react/components"
import reactExtension from "@parity-app/extension-react/package.json" with { type: "json" }
import storybookExtension from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { storybookAdapter } from "@parity-app/storybook-adapter"
import { builders } from "./builders.ts"

export { type ExtensionTool, extensionTools } from "./tools.ts"

/**
 * Every adapter Parity opens projects with, by what it integrates: the one list the project service, Storybook's
 * example project and the validation projects read. Adding an adapter means adding it here.
 */
export const adapters: Adapters = {
  // React's renderer is its extension's, reading components here rather than through its host.
  renderers: [{ ...extensionRenderer(reactExtension)!, findComponents }],
  builders,
  // Storybook's supported versions are its extension's peer dependencies.
  entities: [
    {
      ...storybookAdapter,
      versions: peerVersions(storybookExtension.peerDependencies, storybookExtension.parity.versions)
    }
  ]
}
