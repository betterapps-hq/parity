import {
  type ComponentRef,
  type ComponentSource,
  type DetectionCorrections,
  type GuestChanges,
  guestChanges,
  type LeftOutExport
} from "@parity-app/core"
import {
  type CheckResult,
  checkedChanges,
  correctedSources,
  filesChanged,
  leftOutChanges,
  type ParsedComponent
} from "./listing.ts"

/**
 * An open project's component list, and what goes into keeping it current. The project service keeps one for each
 * project and makes the next with `nextComponentList`.
 */
export interface ComponentList {
  /** Where each component comes from, by id. */
  sources: Record<string, ComponentSource>
  /** The app's exports the type checker left out, with why. Empty until it has read them. */
  leftOut: LeftOutExport[]
  /** The person's corrections to which exports are components, as the main project file has them. */
  corrections?: DetectionCorrections
  /** For a library's own project, what its components' ids start with, as in `nova/Button`. */
  namespace?: string
}

/** What changes an open project's component list. */
export type ComponentListEvent =
  /** The project opened: the list discovery made, and the corrections in the main project file. */
  | { kind: "discovered"; sources: Record<string, ComponentSource>; corrections?: DetectionCorrections }
  /** What the type checker found last time, saved because nothing it read has changed since. */
  | { kind: "restored"; sources: Record<string, ComponentSource>; leftOut: LeftOutExport[] }
  /** The type checker read some of the app's `files`, or all of them when none are given. */
  | { kind: "checked"; result: CheckResult; files?: ReadonlySet<string> }
  /** Changed files the parse read again, as `readChangedFiles` gives them. */
  | { kind: "filesRead"; read: ReadonlyMap<string, ParsedComponent[] | undefined> }
  /** The person changed their corrections. */
  | { kind: "corrected"; corrections: DetectionCorrections | undefined }

/** The component list after an event, and what follows from it. */
export interface ComponentListStep {
  list: ComponentList
  /** What a guest drawing the list from before the event is given and takes back. */
  guest: GuestChanges
  /**
   * The components whose props are read again: all of them, after files changed, which any component can import, or
   * the ones named. A restored list comes with its props.
   */
  props: "all" | string[]
  /** Files the parse reads again next, for a `filesRead` event: those of the exports whose corrections changed. */
  reread: string[]
  /** Whether the components or the exports the type checker left out changed. */
  changed: boolean
}

/**
 * The component list after `event`. Each event changes the list its own way, then the person's corrections are applied,
 * so they outlast every pass of detection. Ids taken off the list are let go before new components are given theirs,
 * so a new component can take one. The corrections come with the list, and a library project's namespace with it.
 */
export function nextComponentList(list: ComponentList, event: ComponentListEvent): ComponentListStep {
  const corrections = event.kind === "discovered" || event.kind === "corrected" ? event.corrections : list.corrections
  const { sources: changed, leftOut } = applyEvent(list, event)
  const sources = correctedSources(changed, corrections, list.namespace)

  const next: ComponentList = {
    sources,
    leftOut,
    ...(corrections ? { corrections } : {}),
    ...(list.namespace ? { namespace: list.namespace } : {})
  }

  const guest = guestChanges(list.sources, sources)

  return {
    list: next,
    guest,
    props: propsToRead(event, guest),
    reread: event.kind === "corrected" ? correctedPaths(list.corrections, corrections) : [],
    changed: !sameSources(list.sources, sources) || JSON.stringify(list.leftOut) !== JSON.stringify(leftOut)
  }
}

function applyEvent(
  list: ComponentList,
  event: ComponentListEvent
): { sources: Record<string, ComponentSource>; leftOut: LeftOutExport[] } {
  switch (event.kind) {
    case "discovered":
      return { sources: event.sources, leftOut: [] }
    case "restored":
      return { sources: event.sources, leftOut: event.leftOut }
    case "checked": {
      const { components, leftOut } = event.result
      const { added, confirmed, removed } = checkedChanges(list.sources, components, event.files, list.namespace)
      const kept = Object.fromEntries(Object.entries(list.sources).filter(([id]) => !removed.includes(id)))

      return {
        sources: { ...kept, ...confirmed, ...added },
        leftOut: event.files ? leftOutChanges(list.leftOut, event.files, leftOut) : leftOut
      }
    }

    case "filesRead":
      return { sources: filesChanged(list.sources, event.read, list.namespace).sources, leftOut: list.leftOut }
    case "corrected":
      return { sources: list.sources, leftOut: list.leftOut }
  }
}

function propsToRead(event: ComponentListEvent, guest: GuestChanges): ComponentListStep["props"] {
  if (event.kind === "discovered" || (event.kind === "filesRead" && event.read.size > 0)) {
    return "all"
  }

  if (event.kind === "restored") {
    return []
  }

  return Object.keys(guest.add)
}

/** The files of the exports the person put on the list or took back off. */
function correctedPaths(before: DetectionCorrections | undefined, after: DetectionCorrections | undefined): string[] {
  const key = (ref: ComponentRef) => `${ref.path}#${ref.export}`
  const was = before?.include ?? []
  const now = after?.include ?? []
  const wasKeys = new Set(was.map(key))
  const nowKeys = new Set(now.map(key))
  const changed = [...was.filter((ref) => !nowKeys.has(key(ref))), ...now.filter((ref) => !wasKeys.has(key(ref)))]

  return [...new Set(changed.map((ref) => ref.path))]
}

function sameSources(a: Record<string, ComponentSource>, b: Record<string, ComponentSource>): boolean {
  const ids = Object.keys(a)

  return ids.length === Object.keys(b).length && ids.every((id) => Object.hasOwn(b, id) && sameSource(a[id]!, b[id]!))
}

function sameSource(a: ComponentSource, b: ComponentSource): boolean {
  const own = Object.entries(a)
  const other = new Map(Object.entries(b))

  return (
    own.length === other.size && own.every(([key, value]) => JSON.stringify(value) === JSON.stringify(other.get(key)))
  )
}

/** What a type check changed, as "Read 12 files and found 2 more components", for the processes list. */
export function typeCheckSummary(files: number, step: Pick<ComponentListStep, "guest">): string {
  const added = Object.keys(step.guest.add).length
  const removed = step.guest.drop.length
  const read = files === 1 ? "Read 1 file" : `Read ${files} files`

  const changes = [
    added > 0 && (added === 1 ? "found 1 more component" : `found ${added} more components`),
    removed > 0 && (removed === 1 ? "left 1 out" : `left ${removed} out`)
  ].filter(Boolean)

  return changes.length > 0 ? `${read} and ${changes.join(" and ")}` : `${read}, no changes`
}
