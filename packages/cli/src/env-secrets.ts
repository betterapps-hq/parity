import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { createScrubber, envSecrets, type Scrubber } from "@parity-app/telemetry"
import { z } from "zod"

/*
 * The `.env` values the CLI's sender scrubs from what it sends (PAR-815), as the app's processes scrub the open
 * projects' (docs/telemetry.md, "Secrets are scrubbed"): those of the project each command ran in, and of the projects
 * the app has open. The app keeps its open projects in `open-projects.json` in its data folder, for reopening them.
 */

/** `.env`, `.env.local` and every other `.env.*` file. */
const envFile = /^\.env(?:\..+)?$/

/**
 * The folders whose `.env` files belong to the project a command ran in: `folder` and each folder above it, up to the
 * first with a `package.json`, so a command run in `src` scrubs its project's values too.
 */
export function projectFolders(folder: string): string[] {
  const folders: string[] = []
  let current = resolve(folder)

  for (;;) {
    folders.push(current)
    const parent = dirname(current)

    if (existsSync(join(current, "package.json")) || parent === current) {
      return folders
    }

    current = parent
  }
}

/** The values worth scrubbing in the `.env` files in each folder, without repeats. A file that can't be read is skipped. */
export function folderEnvSecrets(folders: Iterable<string>): string[] {
  const values = new Set<string>()

  for (const folder of folders) {
    let names: string[]

    try {
      names = readdirSync(folder)
    } catch {
      continue
    }

    for (const name of names.filter((candidate) => envFile.test(candidate)).sort()) {
      try {
        for (const value of envSecrets(readFileSync(join(folder, name), "utf8"))) {
          values.add(value)
        }
      } catch {
        // A folder named like a `.env` file, or one that can't be read.
      }
    }
  }

  return [...values]
}

const openProjectsFile = z.object({ roots: z.array(z.string()) })

/** The projects the app keeps open, from `open-projects.json` in its data folder; none when there's no list or it can't be read. */
export function appOpenProjects(dataFolder: string): string[] {
  try {
    return (
      openProjectsFile.safeParse(JSON.parse(readFileSync(join(dataFolder, "open-projects.json"), "utf8"))).data
        ?.roots ?? []
    )
  } catch {
    return []
  }
}

/** A scrubber that's given more folders to read `.env` values from as it goes, and never forgets one. */
export interface EnvScrubber extends Pick<Scrubber, "value"> {
  /** Reads the `.env` values in these folders, if it hasn't already, and scrubs them from then on. */
  read(folders: Iterable<string>): void
}

/**
 * A scrubber whose values only grow. Sentry scrubs an event after it's captured, perhaps once the next batch is being
 * sent, so each batch adds its project's values rather than swapping in its own.
 */
export function envScrubber(folders: Iterable<string> = []): EnvScrubber {
  const read = new Set<string>()
  const secrets = new Set<string>()
  let scrubber = createScrubber()

  const envScrubbing: EnvScrubber = {
    read(more) {
      const unread = new Set<string>()

      for (const folder of more) {
        if (!read.has(resolve(folder))) {
          unread.add(resolve(folder))
        }
      }

      if (unread.size === 0) {
        return
      }

      for (const folder of unread) {
        read.add(folder)
      }

      const before = secrets.size

      for (const value of folderEnvSecrets(unread)) {
        secrets.add(value)
      }

      if (secrets.size > before) {
        scrubber = createScrubber({ secrets })
      }
    },
    value: (item) => scrubber.value(item)
  }

  envScrubbing.read(folders)

  return envScrubbing
}
