import { z } from "zod"

/*
 * What the Storybook extension reads and decides, as data: what detection found of the project's Storybook, the
 * entries of a running Storybook's `/index.json`, and the page that opens a component's stories.
 */

const storyFile = z.object({ path: z.string() })

/** What detection found of the project's Storybook, as `parity.project.detected` gives it. */
const detected = z.object({
  /** Its config folder, relative to the root. */
  configDir: z.string(),
  /** The port its `storybook dev` script asks for. */
  port: z.number().optional(),
  /** Story files by component. */
  stories: z.record(z.string(), z.array(storyFile))
})

export type DetectedStorybook = z.infer<typeof detected>

/** What detection found, or nothing when it found no Storybook or something this version doesn't read. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- what detection passes is checked here, where it comes in
export function readDetected(value: unknown): DetectedStorybook | undefined {
  return detected.safeParse(value).data
}

/** The components with stories, by key. */
export function componentsWithStories(storybook: DetectedStorybook): string[] {
  return Object.entries(storybook.stories)
    .filter(([, files]) => files.length > 0)
    .map(([key]) => key)
}

/** An entry of Storybook's `/index.json`: a story or a docs page, and the file it comes from. */
const indexEntry = z.looseObject({ id: z.string(), type: z.enum(["story", "docs"]), importPath: z.string() })

export type IndexEntry = z.infer<typeof indexEntry>

/** Storybook's `/index.json`. Its entries are checked one by one, so one of a kind Parity doesn't know is left out. */
const storyIndexFile = z.looseObject({ entries: z.record(z.string(), z.unknown()).optional() })

/** The entries of a Storybook's `/index.json`, as it answered. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what a Storybook answered, read here
export function readStoryIndex(body: unknown): IndexEntry[] {
  const file = storyIndexFile.safeParse(body)

  if (!file.success) {
    throw new Error("Storybook's index isn't one Parity can read")
  }

  return Object.values(file.data.entries ?? {}).flatMap((value) => {
    const entry = indexEntry.safeParse(value)

    return entry.success ? [entry.data] : []
  })
}

/** Storybook's import paths start with `./`; Parity's are plain, relative to the root. */
export function sameFile(importPath: string, path: string): boolean {
  return importPath.replace(/^\.\//, "") === path.replace(/^\.\//, "")
}

/** Whether a Storybook's index holds any of these story files. With none to check, any Storybook does. */
export function servesStories(entries: IndexEntry[], paths: string[]): boolean {
  return paths.length === 0 || entries.some((entry) => paths.some((path) => sameFile(entry.importPath, path)))
}

/**
 * The page that opens a component's stories at `address`: its docs page when it has one, else its first story, else
 * Storybook's home. Without a component, Storybook's home.
 */
export function storyPage(address: string, entries: IndexEntry[], paths: string[]): string {
  const mine = entries.filter((entry) => paths.some((path) => sameFile(entry.importPath, path)))
  const target = mine.find((entry) => entry.type === "docs") ?? mine.find((entry) => entry.type === "story")

  return target ? `${address}/?path=/${target.type}/${target.id}` : address
}
