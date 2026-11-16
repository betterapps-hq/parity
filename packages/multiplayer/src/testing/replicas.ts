import type { DocBackend, OpenOptions } from "../types.ts"

/** Two backends that exchange changes, for the concurrent tests. A provider that syncs offers one. */
export interface ReplicaPair {
  open(options: OpenOptions): { a: DocBackend; b: DocBackend; exchange(): void }
}
