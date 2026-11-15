import {
  addDesigns,
  type CanvasDocument,
  type ContainerViewSettings,
  defaultModeSettings,
  type ModeSettings
} from "@parity-app/core"
import type { TokenEdits, TokenWrite } from "./token-edits.ts"

/** What the editor holds of a project: its files, its modes, and the token values edited on the canvas. */
export interface DesignSnapshot {
  documents: ReadonlyMap<string, CanvasDocument>
  modes: ModeSettings
  /** Token values edited on the canvas, which Save writes to the project's stylesheet. */
  tokens: TokenEdits
}

/** Whether every change has reached its file: saved, waiting for Save, being written, or failed to write. */
export type SaveState =
  | { status: "saved" }
  | { status: "unsaved" }
  | { status: "saving" }
  | { status: "failed"; error: string }

/** Why the stylesheet couldn't take the last token values Save wrote, and which tokens they were. */
export interface TokenFailure {
  error: string
  tokens: readonly TokenWrite[]
}

/**
 * How a design was shown when it was last saved (PAR-1071): its view as its file holds it, or, for a design drawn from
 * the project's code (`drawnFromCode`), as the main project file keeps it (`codeDesigns`, by the design's key, as
 * `(stories)#button-outline`). `saved` gives a file's content as last written or read.
 */
export function savedView(
  saved: (path: string) => CanvasDocument | undefined,
  mainPath: string,
  path: string,
  id: string,
  drawnFromCode: boolean
): ContainerViewSettings | undefined {
  if (drawnFromCode) {
    return saved(mainPath)?.codeDesigns?.[`${path}#${id}`]?.view
  }

  return saved(path)?.containers.find((design) => design.id === id)?.view
}

/**
 * The files and modes as one project file, as Save a copy writes it: every file's designs, notes, references, canvas
 * objects and links, with the main file's component corrections, lens sources and project settings.
 */
export function mergedDocument(
  snapshot: Pick<DesignSnapshot, "documents" | "modes">,
  mainPath: string
): CanvasDocument {
  const { documents, modes } = snapshot
  const all = [...documents.values()]
  const notes = all.flatMap((document) => document.notes ?? [])
  const references = all.flatMap((document) => document.references ?? [])

  // Two files may place the same table or reuse a link id; the first keeps it, so the copy still opens.
  const objects = firstOfEach(
    all.flatMap((document) => document.objects ?? []),
    (object) => JSON.stringify([object.kind, object.ref])
  )

  const links = firstOfEach(
    all.flatMap((document) => document.links ?? []),
    (link) => link.id
  )

  const custom = JSON.stringify(modes) !== JSON.stringify(defaultModeSettings)
  const main = documents.get(mainPath)
  const detection = main?.detection
  const sources = main?.sources
  const preferences = main?.preferences
  const extensions = main?.extensions

  const merged = addDesigns(
    undefined,
    all.flatMap((document) => document.containers)
  )

  if (notes.length > 0) {
    merged.notes = notes
  }

  if (references.length > 0) {
    merged.references = references
  }

  if (custom) {
    merged.modes = modes
  }

  if (detection) {
    merged.detection = detection
  }

  if (objects.length > 0) {
    merged.objects = objects
  }

  if (links.length > 0) {
    merged.links = links
  }

  if (sources) {
    merged.sources = sources
  }

  if (preferences) {
    merged.preferences = preferences
  }

  if (extensions) {
    merged.extensions = extensions
  }

  return merged
}

function firstOfEach<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()

  return items.filter((item) => !seen.has(key(item)) && seen.add(key(item)))
}

/** A document without the modes, which are kept apart from the files. */
export function withoutModes(document: CanvasDocument): CanvasDocument {
  if (!document.modes) {
    return document
  }

  const copy = { ...document }
  delete copy.modes

  return copy
}
