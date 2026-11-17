import type { AdapterIcon } from "@parity-app/core"
import type { CatalogLibrary, LibraryLook, LibraryPreview, LibrarySetting } from "../../../shared/protocol.ts"

/** A component library Parity has a registry file for, as the dialog offers it. */
export interface OfferedLibrary {
  id: string
  name: string
  description: string
  package: string
  version?: string
  /** Its logo, drawn as the extensions' are. */
  logo?: AdapterIcon
  links: NonNullable<CatalogLibrary["links"]>
  installed: boolean
  /** The icon set it comes with, offered alongside. */
  companion?: { id: string; name: string; installed: boolean }
  /** What it asks before it's added, as shadcn's theme and base. */
  settings?: LibrarySetting[]
  look?: LibraryLook
}

/**
 * What a library's registry file holds, as the dialog shows it, with the keyframes its animation tokens run, by name, as
 * the Web Animations API takes them, where they're known.
 */
export type ShownPreview = LibraryPreview & { keyframes?: { name: string; frames: Keyframe[] }[] }

/** The catalog's component libraries as the dialog offers them, each with the icon set offered alongside it. */
export function offeredLibraries(catalog: readonly CatalogLibrary[]): OfferedLibrary[] {
  return catalog.flatMap((library): OfferedLibrary[] => {
    if (library.kind !== "components") {
      return []
    }

    const set = library.companion ? catalog.find((candidate) => candidate.id === library.companion) : undefined

    return [
      {
        id: library.id,
        name: library.name,
        description: library.description,
        package: library.package,
        version: library.version,
        logo: library.logo,
        links: library.links ?? {},
        installed: library.installed,
        companion: set && { id: set.id, name: set.name, installed: set.installed },
        settings: library.settings,
        look: library.look
      }
    ]
  })
}

/** What adding a library takes: its settings when it asks for any, and its icon set when chosen with it. */
export interface LibraryChoice {
  library: string
  settings?: Record<string, string>
  companions: string[]
}
