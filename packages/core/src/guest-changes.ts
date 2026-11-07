import type { ComponentSource } from "./project.ts"

/**
 * Where a component comes from, as far as a guest is concerned: its file and export, and the version of its code when
 * the file, or one it imports, changed since the guest loaded (PAR-165). A new version loads the module again.
 */
export type GuestComponentSource = Pick<ComponentSource, "path" | "export"> & {
  /** When its code last changed, as the builder stamped it, so the guest imports it again from a new address. */
  version?: number
}

/** What a guest is given and takes back when the components it draws change. */
export interface GuestChanges<Source extends GuestComponentSource = ComponentSource> {
  /** Components new to the list, ones that moved to another file or export, and ones whose code changed. */
  add: Record<string, Source>
  /** Ids no longer listed, for `Guest.removeComponents`, which only takes back ones it was given. */
  drop: string[]
}

/**
 * What a guest does when the components go from `before` to `after`. It's given the ones that are new, that moved or
 * whose code changed, and takes back the ids that are gone, so a frame using one draws as the canvas's does. One it
 * loaded with stays as it loaded, since `removeComponents` ignores ids it wasn't given. The project service works this
 * out from its list before each change, the canvas's guest from the list it last had, and the offscreen renderer from
 * each guest's last job.
 */
export function guestChanges<Source extends GuestComponentSource>(
  before: Readonly<Record<string, GuestComponentSource>>,
  after: Readonly<Record<string, Source>>
): GuestChanges<Source> {
  const add: Record<string, Source> = {}
  for (const [id, source] of Object.entries(after)) {
    const was = Object.hasOwn(before, id) ? before[id] : undefined
    if (!was || was.path !== source.path || was.export !== source.export || was.version !== source.version) {
      add[id] = source
    }
  }
  return { add, drop: Object.keys(before).filter((id) => !Object.hasOwn(after, id)) }
}

/**
 * The versions after the builder says which files' code changed, at `stamp`: every component whose file is among
 * `paths` takes it. The builder lists a file whose own code changed and every file importing it, so a component
 * drawing a changed one loads again too. Paths are relative to the project root, as sources have them.
 */
export function codeChangeVersions(
  sources: Readonly<Record<string, Pick<ComponentSource, "path">>>,
  paths: readonly string[],
  stamp: number,
  versions: Readonly<Record<string, number>> = {}
): Record<string, number> {
  const changed = new Set(paths.map(withoutDot))
  const next = { ...versions }
  for (const [id, source] of Object.entries(sources)) if (changed.has(withoutDot(source.path))) next[id] = stamp
  return next
}

/** Sources with the versions their code has reached, for a guest; one whose code hasn't changed has none. */
export function versionedSources<Source extends Pick<ComponentSource, "path" | "export">>(
  sources: Readonly<Record<string, Source>>,
  versions: Readonly<Record<string, number>>
): Record<string, Source & { version?: number }> {
  return Object.fromEntries(
    Object.entries(sources).map(([id, source]) => {
      const version = versions[id]
      return [id, version === undefined ? source : { ...source, version }]
    })
  )
}

function withoutDot(path: string): string {
  return path.replace(/^\.\//, "")
}
