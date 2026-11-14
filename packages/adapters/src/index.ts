import { type Adapters, peerVersions } from "@parity-app/core"
import storybookExtension from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { reactRenderer } from "@parity-app/react-adapter"
import { storybookAdapter } from "@parity-app/storybook-adapter"
import { builders } from "./builders.ts"

export { type ExtensionTool, extensionTools } from "./tools.ts"

/**
 * Every adapter Parity opens projects with, by what it integrates: the one list the project service, Storybook's
 * example project and the validation projects read. Adding an adapter means adding it here.
 */
export const adapters: Adapters = {
  renderers: [reactRenderer],
  builders,
  // Storybook's supported versions are its extension's peer dependencies.
  entities: [
    {
      ...storybookAdapter,
      versions: peerVersions(storybookExtension.peerDependencies, storybookExtension.parity.versions)
    }
  ]
}
