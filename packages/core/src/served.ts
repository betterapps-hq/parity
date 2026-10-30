/*
 * A page can't unload a module, and never loads the same URL twice, so the pages that drew a project keep the code its
 * builder served them for as long as they're open. A reopened project's builder serves on its last address only when
 * none of that code has changed since: the pages then draw with what they hold instead of loading the project's modules
 * again. Each builder keeps a log of what it served, each file as it was when first served, and hands it on as it
 * closes. The next builder of the project compares it with the files as they are, and carries it on when it takes the
 * same address, since the pages still hold what the last one served.
 */

/** A file as it was: when it last changed, in milliseconds, and its size in bytes. Null when it didn't exist. */
export type FileStamp = { mtime: number; size: number } | null

/** A module a builder served, by a hash of its code, with the files it was made from. */
export interface ServedModule {
  hash: string
  files: string[]
}

/** What a project's builders served its pages. */
export interface ServedRecord {
  /** Each file the served modules were made from, by absolute path, as it was when first served. */
  files: Record<string, FileStamp>
  /** Each module served, by URL. */
  modules: Record<string, ServedModule>
  /** Modules a builder makes itself rather than reads, such as the guest, with a hash of the code it made. */
  made: Record<string, string>
  /** Files the whole build depends on, such as its config, lockfile and environment files. */
  build: string[]
}

export function sameStamp(a: FileStamp, b: FileStamp): boolean {
  return a === null || b === null ? a === b : a.mtime === b.mtime && a.size === b.size
}

/**
 * What changed since a project's pages were served `record`: a made module's id, when the builder makes it differently
 * now or no longer makes it, or a file's path, with `files` as they are now. Nothing when the pages' copies are current.
 */
export function servedChange(
  record: ServedRecord,
  files: Record<string, FileStamp>,
  made: Record<string, string>
): string | undefined {
  for (const [id, hash] of Object.entries(record.made)) if (made[id] !== hash) return id
  for (const [path, stamp] of Object.entries(record.files)) if (!sameStamp(stamp, files[path] ?? null)) return path
  return undefined
}

/** Two builders' records as one, as when a project's builder was started again while it was open: the first serve counts. */
export function mergeServed(earlier: ServedRecord, later: ServedRecord): ServedRecord {
  return {
    files: { ...later.files, ...earlier.files },
    modules: { ...later.modules, ...earlier.modules },
    made: { ...later.made, ...earlier.made },
    build: [...new Set([...earlier.build, ...later.build])]
  }
}

interface LoggedModule {
  /** The code served, until it's hashed for the record. */
  code?: string
  hash?: string
  files: string[]
}

/** What one builder has served the pages, as it serves it. Only the first serve of each module and file counts. */
export class ServedLog {
  private readonly files = new Map<string, FileStamp>()
  private readonly modules = new Map<string, LoggedModule>()
  private readonly made = new Map<string, string>()
  private readonly build = new Set<string>()
  private readonly hash: (code: string) => string

  /** `hash` hashes a module's code. `from` is what the project's last builder served, when this one carries it on. */
  constructor(hash: (code: string) => string, from?: ServedRecord) {
    this.hash = hash
    if (!from) return
    for (const [path, stamp] of Object.entries(from.files)) this.files.set(path, stamp)
    for (const [url, module] of Object.entries(from.modules)) this.modules.set(url, { ...module })
    for (const [id, hash] of Object.entries(from.made)) this.made.set(id, hash)
    for (const path of from.build) this.build.add(path)
  }

  /** Whether a module has been served already. */
  has(url: string): boolean {
    return this.modules.has(url)
  }

  /** Notes a module served, with its code and the files it was made from, stamped as they are now. */
  serve(url: string, code: string, files: Record<string, FileStamp>): void {
    if (this.modules.has(url)) return
    this.modules.set(url, { code, files: Object.keys(files) })
    for (const [path, stamp] of Object.entries(files)) if (!this.files.has(path)) this.files.set(path, stamp)
  }

  /** Notes a module the builder made, by a hash of its code. */
  make(id: string, hash: string): void {
    if (!this.made.has(id)) this.made.set(id, hash)
  }

  /** Notes files the whole build depends on, stamped as they are now: its config, lockfile and environment files. */
  depend(files: Record<string, FileStamp>): void {
    for (const [path, stamp] of Object.entries(files)) {
      this.build.add(path)
      if (!this.files.has(path)) this.files.set(path, stamp)
    }
  }

  /**
   * The record to hand on, with `stamp` reading a file as it is now. A file that changed since it was served still
   * counts as unchanged when every module made from it comes out the same when `remake` makes it again: Tailwind scans
   * the design files for classes, so saving a design changes the stylesheet only when it uses a new one. A file the
   * whole build depends on counts as changed whenever it changes.
   */
  async record(
    stamp: (path: string) => Promise<FileStamp>,
    remake: (url: string) => Promise<string | undefined>
  ): Promise<ServedRecord> {
    const paths = [...this.files.keys()]
    const now = new Map(await Promise.all(paths.map(async (path) => [path, await stamp(path)] as const)))
    const changed = paths.filter((path) => !sameStamp(this.files.get(path)!, now.get(path)!))
    if (changed.length > 0 && !changed.some((path) => this.build.has(path))) {
      const touched = new Set(changed)
      let same = true
      for (const [url, module] of this.modules) {
        if (!module.files.some((path) => touched.has(path))) continue
        const code = await remake(url).catch(() => undefined)
        if (code === undefined || this.hash(code) !== this.hashOf(module)) {
          same = false
          break
        }
      }
      if (same) for (const path of changed) this.files.set(path, now.get(path)!)
    }
    return {
      files: Object.fromEntries(this.files),
      modules: Object.fromEntries(
        [...this.modules].map(([url, module]) => [url, { hash: this.hashOf(module), files: module.files }])
      ),
      made: Object.fromEntries(this.made),
      build: [...this.build]
    }
  }

  private hashOf(module: LoggedModule): string {
    if (module.hash === undefined) {
      module.hash = this.hash(module.code ?? "")
      module.code = undefined
    }
    return module.hash
  }
}
