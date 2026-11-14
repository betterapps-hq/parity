import type { Parity } from "@parity-app/extension-api"

/*
 * TanStack Router as an extension (PAR-1091). For now its package.json is all there is: its peer dependency says which
 * versions Parity supports, and finds the router in a project. Its routes, Open in browser and the status bar's count
 * are still its adapter's, `@parity-app/tanstack-router-adapter`, until providers and node types come to extensions.
 * It activates on no event, so no host starts for it.
 */

/** Nothing yet: the manifest activates it on no event. */
export function activate(_parity: Parity): void {
  // Its routes, the route node type and Open in browser move here with providers.
}
