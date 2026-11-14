import type { Adapters } from "@parity-app/core"
import { reactRenderer } from "@parity-app/react-adapter"
import { storybookAdapter } from "@parity-app/storybook-adapter"
import { tailwindStyles } from "@parity-app/tailwind-adapter"
import { tanstackRouter } from "@parity-app/tanstack-router-adapter"
import { builders } from "./builders.ts"

/**
 * Every adapter Parity opens projects with, by what it integrates: the one list the project service, Storybook's
 * example project and the validation projects read. Adding an adapter means adding it here.
 */
export const adapters: Adapters = {
  renderers: [reactRenderer],
  builders,
  styles: [tailwindStyles],
  routers: [tanstackRouter],
  entities: [storybookAdapter]
}
