import { readFile, rename, writeFile } from "node:fs/promises"

/**
 * The projects open when the service last ran, kept in a file in Parity's app data (`PARITY_REOPEN_FILE`), so a service
 * starting again opens them at once, while the window is still loading, rather than once the window has loaded and asks
 * for its tabs (PAR-179). The window's open of the same project joins the one under way. One the window doesn't ask for
 * within `waitMs`, as when its tabs and the service's list disagree, is closed again, so its builder doesn't run for
 * nothing. Without a file, as in tests of other modules, nothing is kept or opened.
 */
export interface Reopening {
  /** A window asked for this project: it's kept open, whether or not the service opened it already. */
  claim(root: string): void
  /** The projects open now, kept for the next start. Writes are made one at a time, the last one winning. */
  remember(roots: readonly string[]): void
  /** Resolves once the last list asked to be kept is written. */
  written(): Promise<void>
}

export function startReopening({
  file,
  open,
  close,
  waitMs = 60_000
}: {
  file: string | undefined
  open: (root: string) => Promise<unknown>
  close: (root: string) => Promise<unknown>
  waitMs?: number
}): Reopening {
  const unclaimed = new Map<string, ReturnType<typeof setTimeout>>()
  const claimed = new Set<string>()
  let writing = Promise.resolve()
  let last: string | undefined

  const reopening: Reopening = {
    claim(root) {
      claimed.add(root)
      clearTimeout(unclaimed.get(root))
      unclaimed.delete(root)
    },
    remember(roots) {
      if (!file) return
      const text = JSON.stringify({ roots: [...roots] })
      if (text === last) return
      last = text
      writing = writing.then(() => write(file, text))
    },
    written: () => writing
  }

  if (file) {
    void remembered(file).then((roots) => {
      for (const root of roots) {
        // A window that asked first is opening it already, and keeps it.
        if (claimed.has(root) || unclaimed.has(root)) continue
        unclaimed.set(
          root,
          setTimeout(() => {
            unclaimed.delete(root)
            void close(root).catch(() => undefined)
          }, waitMs)
        )
        // A project that no longer opens says why when the window asks for it.
        void open(root).catch(() => undefined)
      }
    })
  }
  return reopening
}

/** The roots kept last time; none when there's no list or it can't be read. */
async function remembered(file: string): Promise<string[]> {
  try {
    const { roots } = JSON.parse(await readFile(file, "utf8")) as { roots?: unknown }
    return Array.isArray(roots) ? roots.filter((root): root is string => typeof root === "string") : []
  } catch {
    return []
  }
}

/** Written beside the list and renamed over it, so a reader never finds half a list. */
async function write(file: string, text: string): Promise<void> {
  const partial = `${file}.${process.pid}.partial`
  try {
    await writeFile(partial, text)
    await rename(partial, file)
  } catch (error) {
    console.warn(`[service] couldn't keep the open projects: ${error instanceof Error ? error.message : String(error)}`)
  }
}
