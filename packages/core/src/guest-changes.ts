import type { ComponentSource } from "./project.ts"

/** Where a component comes from, as far as a guest is concerned. */
type GuestSource = Pick<ComponentSource, "path" | "export">

/** What a guest is given and takes back when the components it draws change. */
export interface GuestChanges<Source extends GuestSource = ComponentSource> {
  /** Components new to the list, and ones that moved to another file or export, for `Guest.addComponents`. */
  add: Record<string, Source>
  /** Ids no longer listed, for `Guest.removeComponents`, which only takes back ones it was given. */
  drop: string[]
}

/**
 * What a guest does when the components go from `before` to `after`. It's given the ones that are new or that moved,
 * and takes back the ids that are gone, so a frame using one draws as the canvas's does. One it loaded with stays as it
 * loaded, since `removeComponents` ignores ids it wasn't given. The project service works this out from its list before
 * each change, the canvas's guest from the list it last had, and the offscreen renderer from each guest's last job.
 */
export function guestChanges<Source extends GuestSource>(
  before: Readonly<Record<string, GuestSource>>,
  after: Readonly<Record<string, Source>>
): GuestChanges<Source> {
  const add: Record<string, Source> = {}
  for (const [id, source] of Object.entries(after)) {
    const was = Object.hasOwn(before, id) ? before[id] : undefined
    if (!was || was.path !== source.path || was.export !== source.export) add[id] = source
  }
  return { add, drop: Object.keys(before).filter((id) => !Object.hasOwn(after, id)) }
}
