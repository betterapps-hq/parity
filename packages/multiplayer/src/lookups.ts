import {
  type CanvasDocument,
  type ComponentLibrary,
  type ContainerSpec,
  type NoteSpec,
  projectComponentLibrary,
  type ReferenceSpec,
  reachableLibrary as reachable
} from "@parity-app/core"
import { type EditFrame, editFrame as frameOf, type Picked } from "@parity-app/editor"
import { designKey } from "./keys.ts"
import type { DesignKey, ProjectDoc } from "./types.ts"

/*
 * What `DesignStore` built from the designs, as functions of the document's files: each kept while the files are the
 * same objects, and each entry kept while its value is, so a view that compares entries draws again only what changed.
 */

export interface ContainerEntry {
  /** Stable across the session: `<file>#<design id>`. */
  key: DesignKey
  path: string
  container: ContainerSpec
}

export interface NoteEntry {
  key: string
  path: string
  note: NoteSpec
}

export interface ReferenceEntry {
  key: string
  path: string
  reference: ReferenceSpec
}

type Files = ReadonlyMap<string, CanvasDocument>

interface Built {
  entries: readonly ContainerEntry[]
  byKey: ReadonlyMap<DesignKey, ContainerEntry>
  notes: readonly NoteEntry[]
  references: readonly ReferenceEntry[]
}

/** What was built last for each document, to keep what didn't change. */
const built = new WeakMap<ProjectDoc, { files: Files; built: Built }>()

/** Every design, in file order, each entry the same object while its design is. */
export function containerEntries(doc: ProjectDoc): readonly ContainerEntry[] {
  return build(doc).entries
}

export function containerEntry(doc: ProjectDoc, key: DesignKey): ContainerEntry | undefined {
  return build(doc).byKey.get(key)
}

export function noteEntries(doc: ProjectDoc): readonly NoteEntry[] {
  return build(doc).notes
}

export function referenceEntries(doc: ProjectDoc): readonly ReferenceEntry[] {
  return build(doc).references
}

const libraries = new WeakMap<
  ProjectDoc,
  { entries: readonly ContainerEntry[]; designs: readonly ContainerSpec[]; library: ComponentLibrary }
>()

/** Every component design instances can place: the project's own, and its libraries'. */
export function componentLibrary(doc: ProjectDoc, libraryDesigns: readonly ContainerSpec[]): ComponentLibrary {
  const entries = containerEntries(doc)
  const kept = libraries.get(doc)

  if (kept?.entries === entries && kept.designs === libraryDesigns) {
    return kept.library
  }

  const library = projectComponentLibrary(
    libraryDesigns,
    entries.map((entry) => entry.container)
  )

  libraries.set(doc, { entries, designs: libraryDesigns, library })

  return library
}

const reached = new WeakMap<ProjectDoc, Map<DesignKey, { library: ComponentLibrary; reached: ComponentLibrary }>>()

/** What a design's instances reach, for resolving it: the same library until one of those designs changes. */
export function reachableLibrary(
  doc: ProjectDoc,
  key: DesignKey,
  libraryDesigns: readonly ContainerSpec[]
): ComponentLibrary {
  const entry = containerEntry(doc, key)

  if (!entry) {
    return noLibrary
  }

  const library = componentLibrary(doc, libraryDesigns)
  const byKey = reached.get(doc) ?? new Map()
  const kept = byKey.get(key)

  if (kept?.library === library) {
    return kept.reached
  }

  const next = reachable(entry.container, library, kept?.reached)
  byKey.set(key, { library, reached: next })
  reached.set(doc, byKey)

  return next
}

/** What an edit to what's `picked` lands on: its design, in the state and viewport of the frame it was picked in. */
export function editFrame(doc: ProjectDoc, picked: Picked): EditFrame | undefined {
  return frameOf(picked, (key) => containerEntry(doc, key)?.container, doc.modes())
}

const noLibrary: ComponentLibrary = new Map()

function build(doc: ProjectDoc): Built {
  const files = doc.files()
  const kept = built.get(doc)

  if (kept?.files === files) {
    return kept.built
  }

  const previous = kept?.built

  const entries = [...files].flatMap(([path, document]) =>
    document.containers.map((container) => {
      const key = designKey(path, container.id)
      const before = previous?.byKey.get(key)

      return before?.container === container ? before : { key, path, container }
    })
  )

  const notesBefore = new Map(previous?.notes.map((entry) => [entry.key, entry]))

  const notes = [...files].flatMap(([path, document]) =>
    (document.notes ?? []).map((note) => {
      const key = designKey(path, note.id)
      const before = notesBefore.get(key)

      return before?.note === note ? before : { key, path, note }
    })
  )

  const referencesBefore = new Map(previous?.references.map((entry) => [entry.key, entry]))

  const references = [...files].flatMap(([path, document]) =>
    (document.references ?? []).map((reference) => {
      const key = designKey(path, reference.id)
      const before = referencesBefore.get(key)

      return before?.reference === reference ? before : { key, path, reference }
    })
  )

  const next: Built = {
    entries: sameList(entries, previous?.entries) ? previous!.entries : entries,
    byKey: new Map(entries.map((entry) => [entry.key, entry])),
    notes: sameList(notes, previous?.notes) ? previous!.notes : notes,
    references: sameList(references, previous?.references) ? previous!.references : references
  }

  built.set(doc, { files, built: next })

  return next
}

function sameList<T>(next: readonly T[], previous: readonly T[] | undefined): boolean {
  return previous !== undefined && next.length === previous.length && next.every((each, at) => each === previous[at])
}
