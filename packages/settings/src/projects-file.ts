import { z } from "zod"
import { type FileObject, fileText, type JsonValue, objectToChange, parseObject } from "./json-object.ts"

/** How many projects the recent list keeps. */
export const recentLimit = 10

/** What's kept about a project besides its place in the recent list. */
export interface ProjectNote {
  /** When it last opened, in milliseconds since 1970. */
  opened?: number
  starred?: true
  /** The offer to write its preview file from its app's providers was closed (PAR-104), so it isn't made again. */
  previewOfferClosed?: true
}

/** `projects.json`: the recent projects, most recent first, and notes on each project listed, by folder. */
export interface Projects {
  recent: string[]
  notes: Record<string, ProjectNote>
}

/** A list of folders, without any entry that isn't one. */
const roots = z
  .array(z.string().catch(""))
  .catch([])
  .transform((list) => list.filter(Boolean))

const note = z
  .object({
    opened: z.number().finite().optional().catch(undefined),
    starred: z.literal(true).optional().catch(undefined),
    previewOfferClosed: z.literal(true).optional().catch(undefined)
  })
  .catch({})
  .transform((read) => {
    const kept: ProjectNote = {}

    if (read.opened !== undefined) {
      kept.opened = read.opened
    }

    if (read.starred) {
      kept.starred = true
    }

    if (read.previewOfferClosed) {
      kept.previewOfferClosed = true
    }

    return kept
  })

const notes = z.record(z.string(), note).catch({})

const folder = z.string().min(1)

/** One change a window makes to the projects. */
export const projectsChange = z.discriminatedUnion("kind", [
  /** A project opened: it goes to the top of the recent list. */
  z.strictObject({ kind: z.literal("opened"), root: folder }),
  /** A project comes off the recent list, or every project does when there's no `root`. Starred ones stay starred. */
  z.strictObject({ kind: z.literal("forgot"), root: folder.optional() }),
  z.strictObject({ kind: z.literal("starred"), root: folder, starred: z.boolean() }),
  /** The offer to write its preview file was closed, so it isn't made again (PAR-104). */
  z.strictObject({ kind: z.literal("closedPreviewOffer"), root: folder })
])

export type ProjectsChange = z.infer<typeof projectsChange>

/** What `projects.json` gives, or why it couldn't be read. */
export interface ReadProjects {
  values: Projects
  problem?: string
}

function projectsOf(object: FileObject): Projects {
  return { recent: roots.parse(object["recent"]), notes: notes.parse(object["notes"]) }
}

/** The projects `text` holds, from `projects.json`, or none when there's no file. Entries that don't read are dropped. */
export function readProjects(text: string | undefined): ReadProjects {
  const parsed = parseObject("projects.json", text)

  if ("problem" in parsed) {
    return { values: { recent: [], notes: {} }, problem: parsed.problem }
  }

  return { values: projectsOf(parsed.object) }
}

/**
 * The projects after one change made at `now`. Notes are kept only for projects still listed, recent or starred, so ones
 * the list forgot don't pile up.
 */
export function changeProjectsData(before: Projects, change: ProjectsChange, now: number): Projects {
  let { recent, notes: kept } = before

  if (change.kind === "opened") {
    recent = [change.root, ...recent.filter((root) => root !== change.root)].slice(0, recentLimit)
    kept = { ...kept, [change.root]: { ...kept[change.root], opened: now } }
  } else if (change.kind === "forgot") {
    recent = change.root === undefined ? [] : recent.filter((root) => root !== change.root)
  } else if (change.kind === "closedPreviewOffer") {
    kept = { ...kept, [change.root]: { ...kept[change.root], previewOfferClosed: true } }
  } else {
    const { starred: _starred, ...rest } = kept[change.root] ?? {}
    kept = { ...kept, [change.root]: change.starred ? { ...rest, starred: true } : rest }
  }

  return {
    recent,
    notes: Object.fromEntries(Object.entries(kept).filter(([root, { starred }]) => starred || recent.includes(root)))
  }
}

/**
 * `projects.json`'s text after one change made at `now`, with every key it doesn't know as it was. Throws for text that
 * doesn't parse, which must never be written over.
 */
export function changeProjects(text: string | undefined, change: ProjectsChange, now: number): string {
  const object = objectToChange("projects.json", text)
  const after = changeProjectsData(projectsOf(object), change, now)

  const written = Object.entries(after.notes).map(
    ([root, { opened, starred, previewOfferClosed }]): [string, JsonValue] => {
      const kept: Record<string, JsonValue> = {}

      if (opened !== undefined) {
        kept["opened"] = opened
      }

      if (starred) {
        kept["starred"] = true
      }

      if (previewOfferClosed) {
        kept["previewOfferClosed"] = true
      }

      return [root, kept]
    }
  )

  return fileText({ ...object, recent: after.recent, notes: Object.fromEntries(written) })
}
