import type { BuilderAdapter } from "@parity-app/core"
import { viteBuilder } from "@parity-app/vite-adapter"

/**
 * The builders Parity opens projects with. A builder's own process imports only these, so it doesn't load the other
 * adapters, such as the React adapter's TypeScript.
 */
export const builders: BuilderAdapter[] = [viteBuilder]
