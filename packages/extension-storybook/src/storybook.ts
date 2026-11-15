import { commandOption, scriptRunning } from "@parity-app/project"
import { z } from "zod"

/*
 * What the Storybook extension reads and decides, as data: the project's Storybook, as the extension reads it from the
 * project's files, the entries of a running Storybook's `/index.json`, and the page that opens a component's stories.
 */

/** One of a component's story files: its path from the root, its meta's title, and the stories it exports. */
export interface ComponentStoryFile {
  path: string
  title?: string
  /** The stories it exports, by export name. */
  exports?: string[]
}

/** The project's Storybook (PAR-1128): its config folder, the port its script asks for, and story files by component. */
export interface ProjectStorybook {
  /** Its config folder, relative to the root. */
  configDir: string
  /** The port its `storybook dev` script asks for. */
  port?: number
  stories: Record<string, ComponentStoryFile[]>
}

/** The config folder the manifest's `storybook.configDir` setting gives by default. */
const defaultConfigDir = ".storybook"

/**
 * The project's Storybook from what the extension read: its config folder is the `storybook.configDir` setting when
 * it's changed from `.storybook`, else the one the `storybook dev` script names with `-c` or `--config-dir`, else
 * `.storybook`; its port is the one the script names with `-p` or `--port`.
 */
export function projectStorybook(
  scripts: Record<string, string> | undefined,
  configured: string,
  stories: Record<string, ComponentStoryFile[]>
): ProjectStorybook {
  const script = scriptRunning(scripts, /\bstorybook\s+dev\b/)
  const named = script && commandOption(script[1], ["-c", "--config-dir"])
  const set = configured.trim()
  const configDir = set && set !== defaultConfigDir ? set : (named ?? defaultConfigDir)
  const port = script ? Number(commandOption(script[1], ["-p", "--port"])) || undefined : undefined

  return port ? { configDir, port, stories } : { configDir, stories }
}

/** The fields of a package.json the extension reads: the scripts that start Storybook. */
const packageScripts = z.looseObject({ scripts: z.record(z.string(), z.string()).optional() })

/** A package.json's scripts, or none when it can't be read. */
export function scriptsOf(text: string | undefined): Record<string, string> | undefined {
  try {
    return packageScripts.safeParse(JSON.parse(text ?? "")).data?.scripts
  } catch {
    return undefined
  }
}

/** What an import read, as the extension keeps it with the project: the package's scripts and the story files. */
const lastRead = z.object({
  scripts: z.record(z.string(), z.string()).optional(),
  stories: z.record(
    z.string(),
    z.array(z.object({ path: z.string(), title: z.string().optional(), exports: z.array(z.string()).optional() }))
  )
})

export type LastRead = z.infer<typeof lastRead>

/** What the last import read, as `parity.state.project` kept it, or nothing when there's none it can read. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- what the state store kept is checked here, where it comes in
export function readLastRead(value: unknown): LastRead | undefined {
  return lastRead.safeParse(value).data
}

/** The components with stories, by key. */
export function componentsWithStories(storybook: ProjectStorybook): string[] {
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

/** Which of a component's pages to open: its docs page when it has one, or always its first story. */
export type PageKind = "docs" | "story"

/**
 * The page that opens a component's stories at `address`: its docs page when it has one and `kind` allows, else its
 * first story, else Storybook's home. Without a component, Storybook's home.
 */
export function storyPage(address: string, entries: IndexEntry[], paths: string[], kind: PageKind = "docs"): string {
  const mine = entries.filter((entry) => paths.some((path) => sameFile(entry.importPath, path)))
  const docs = kind === "docs" ? mine.find((entry) => entry.type === "docs") : undefined
  const target = docs ?? mine.find((entry) => entry.type === "story")

  return target ? `${address}/?path=/${target.type}/${target.id}` : address
}
