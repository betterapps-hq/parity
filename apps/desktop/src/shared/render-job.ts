import { type ComponentSource, type FrameGeometry, modeGlobals, type ResolvedMode } from "@parity-app/core"
import type { RenderJob } from "./protocol.ts"

/**
 * The mode of a frame the offscreen window draws: the frame's size and window as core's `frameGeometry` resolved them,
 * so it draws as the live frame does, and the mode's classes, attributes and options. Bitmaps and agents' frames both
 * build theirs here.
 */
export function renderJobMode(mode: ResolvedMode, frame: FrameGeometry): RenderJob["mode"] {
  return {
    width: frame.width,
    ...(frame.height === undefined ? {} : { height: frame.height }),
    viewport: { width: frame.viewport.width, height: frame.viewport.height },
    classNames: mode.classNames,
    attributes: mode.attributes,
    globals: modeGlobals(mode)
  }
}

/**
 * Where each component a frame's tree draws comes from, as `path#export` in order of id: from the components the guest
 * was given since it loaded (`given`, a job's `components`) or else those it was served with. A kept bitmap is named by
 * these rather than by how they reached the guest, so a frame drawn while the type checker added components to the guest
 * is found again in a later session, whose guest is served them all from the start (PAR-179). A component it has no
 * source for is listed as `null`.
 */
export function drawnComponents(
  tree: unknown,
  served: Readonly<Record<string, Pick<ComponentSource, "path" | "export">>>,
  given: RenderJob["components"] = {}
): [string, string | null][] {
  const ids = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else if (value && typeof value === "object") {
      const node = value as { kind?: unknown; component?: unknown }
      if (node.kind === "component" && typeof node.component === "string") ids.add(node.component)
      for (const child of Object.values(value)) visit(child)
    }
  }
  visit(tree)
  const own = <T>(record: Readonly<Record<string, T>>, id: string) =>
    Object.hasOwn(record, id) ? record[id] : undefined
  return [...ids].sort().map((id) => {
    const source = own(given, id) ?? own(served, id)
    return [id, source ? `${source.path}#${source.export}` : null]
  })
}
