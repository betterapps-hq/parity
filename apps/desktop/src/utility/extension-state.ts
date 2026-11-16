import { readFileSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { jsonText } from "@parity-app/core"
import type { JsonValue } from "@parity-app/extension-api"
import type { ExtensionStateStore } from "@parity-app/extensions"
import { z } from "zod"
import { degraded } from "./degraded.ts"

/*
 * What extensions keep for themselves with `parity.state`, and their status items' last values, which the window draws
 * before an extension's code loads. It's the app's state, kept in one file in Parity's app data
 * (`PARITY_EXTENSION_STATE_FILE`), by extension, then by project folder. Read once as the service starts; each change is
 * written a moment later, the last write winning. Without a file, as in tests, it's kept in memory only.
 */

const values = z.record(z.string(), z.json())

const statusValue = z.object({ value: z.string().optional(), tooltip: z.string().optional() })

const projectValues = z.object({
  state: values.catch({}),
  status: z.record(z.string(), statusValue).catch({})
})

const extensionValues = z.object({
  app: values.catch({}),
  projects: z.record(z.string(), projectValues).catch({})
})

const stateFile = jsonText(z.record(z.string(), extensionValues))

type StateFile = z.infer<typeof stateFile>

/** How long after a change the file is written, so a burst of changes is one write. */
const writeDelay = 500

/** The store, reading `file` now. A file that's missing or can't be read starts empty. */
export function extensionStateStore(file: string | undefined): ExtensionStateStore {
  const kept: StateFile = read(file)
  let timer: ReturnType<typeof setTimeout> | undefined
  let writing = Promise.resolve()

  const save = () => {
    if (!file || timer) {
      return
    }

    timer = setTimeout(() => {
      timer = undefined
      const text = JSON.stringify(kept)
      writing = writing.then(() => write(file, text))
    }, writeDelay)
  }

  const extension = (id: string) => (kept[id] ??= { app: {}, projects: {} })

  return {
    read(id, root) {
      const found = kept[id]
      const project = found?.projects[root]

      return {
        app: { ...found?.app },
        project: { ...project?.state },
        status: structuredClone(project?.status ?? {})
      }
    },
    write(id, root, scope, key, value) {
      const own = extension(id)

      if (scope === "app") {
        set(own.app, key, value)
      } else {
        const project = (own.projects[root] ??= { state: {}, status: {} })

        if (scope === "project") {
          set(project.state, key, value)
        } else {
          const status = value === undefined ? undefined : statusValue.safeParse(value).data

          if (status) {
            project.status[key] = status
          } else {
            delete project.status[key]
          }
        }
      }

      save()
    }
  }
}

function set(record: Record<string, JsonValue>, key: string, value: JsonValue | undefined): void {
  if (value === undefined) {
    delete record[key]
  } else {
    record[key] = value
  }
}

function read(file: string | undefined): StateFile {
  if (!file) {
    return {}
  }

  try {
    return stateFile.safeParse(readFileSync(file, "utf8")).data ?? {}
  } catch {
    return {}
  }
}

/** Written beside the file and renamed over it, so a reader never finds half of it. */
async function write(file: string, text: string): Promise<void> {
  const partial = `${file}.${process.pid}.partial`

  try {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(partial, text)
    await rename(partial, file)
  } catch (error) {
    degraded("extension_state", "couldn't keep extensions' state", error)
  }
}
