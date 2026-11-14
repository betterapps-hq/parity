import type { Adapter } from "@parity-app/core"
import { peerVersions } from "@parity-app/core"
import routerExtension from "@parity-app/extension-tanstack-router/package.json" with { type: "json" }

/** A tool one of Parity's own extensions gives: its prefix and name, and its versions from its peer dependencies. */
export type ExtensionTool = Pick<Adapter, "id" | "name"> & { versions: NonNullable<Adapter["versions"]> }

/**
 * The tools Parity's own extensions give (PAR-1095), found when the project's package.json declares one of their peer
 * dependencies and listed with their versions among what it uses. Their behaviour is the extensions' own.
 */
export const extensionTools: ExtensionTool[] = [routerExtension].flatMap(({ parity, peerDependencies }) => {
  const versions = peerVersions(peerDependencies)

  return versions ? [{ id: parity.prefix, name: parity.displayName, versions }] : []
})
