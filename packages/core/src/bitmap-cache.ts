/** A file in the frame bitmap cache, as the store lists it. */
export interface CachedFile {
  /** Where it is, as the store names it. */
  path: string
  /** The project folder it's in, which goes as a whole once the project hasn't been opened for long enough. */
  project: string
  size: number
  /** When it was last written or shown, in milliseconds. */
  used: number
  /** A file still being written, or left behind by a write that never finished. */
  partial?: boolean
}

/** How much the cache may hold, and for how long, in bytes and milliseconds. */
export interface CacheLimits {
  /** All projects' bitmaps together. Past it, the least recently used go until the cache is back at `keep`. */
  cap: number
  keep: number
  /** A project none of whose bitmaps was used for this long goes. */
  maxAge: number
  /** A partial file older than this was left by a write that stopped. */
  partialAge: number
}

/** 200 MB across every project, back down to 180 MB when it's over, and 30 days for a project not opened. */
export const bitmapCacheLimits: CacheLimits = {
  cap: 200 * 2 ** 20,
  keep: 180 * 2 ** 20,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  partialAge: 60 * 1000
}

/**
 * Which files to remove from the frame bitmap cache: partial files a write left behind, every file of a project none of
 * whose bitmaps was used within `maxAge`, then, while what's left is over `cap`, the least recently used until it's at
 * `keep`. A partial file still being written is left alone.
 */
export function cacheRemovals(files: readonly CachedFile[], now: number, limits = bitmapCacheLimits): string[] {
  const removed = new Set<string>()
  const lastUsed = new Map<string, number>()
  for (const file of files) {
    if (file.partial) {
      if (now - file.used > limits.partialAge) removed.add(file.path)
      continue
    }
    lastUsed.set(file.project, Math.max(lastUsed.get(file.project) ?? 0, file.used))
  }
  const kept: CachedFile[] = []
  for (const file of files) {
    if (file.partial) continue
    if (now - (lastUsed.get(file.project) ?? 0) > limits.maxAge) removed.add(file.path)
    else kept.push(file)
  }
  let total = kept.reduce((sum, file) => sum + file.size, 0)
  if (total > limits.cap) {
    for (const file of [...kept].sort((a, b) => a.used - b.used)) {
      if (total <= limits.keep) break
      removed.add(file.path)
      total -= file.size
    }
  }
  return [...removed]
}
