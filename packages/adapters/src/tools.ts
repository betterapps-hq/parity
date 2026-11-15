import type { Adapter } from "@parity-app/core"
import { peerVersions } from "@parity-app/core"
import tailwindExtension from "@parity-app/extension-tailwind/package.json" with { type: "json" }
import routerExtension from "@parity-app/extension-tanstack-router/package.json" with { type: "json" }

/** A tool one of Parity's own extensions gives: its prefix and name, and its versions from its peer dependencies. */
export type ExtensionTool = Pick<Adapter, "id" | "name"> & {
  versions: NonNullable<Adapter["versions"]>
  /** Whether it styles the project, which detection lists before the tools whose files are entities, as it always has. */
  styles: boolean
}

/**
 * The tools Parity's own extensions give (PAR-1095), found when the project's package.json declares one of their peer
 * dependencies and listed with their versions among what it uses. Their behaviour is the extensions' own.
 */
export const extensionTools: ExtensionTool[] = [tailwindExtension, routerExtension].flatMap((extension) => {
  const versions = peerVersions(
    extension.peerDependencies,
    "versions" in extension.parity ? extension.parity.versions : {}
  )

  const styles = "styles" in extension.parity.contributes.providers

  return versions ? [{ id: extension.parity.prefix, name: extension.parity.displayName, versions, styles }] : []
})
