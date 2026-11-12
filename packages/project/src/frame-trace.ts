import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"

/*
 * A frame's trace (PAR-994): the project files a frame read when it was drawn, each by a hash of its contents, so whether
 * the frame would draw the same again can be told without drawing it. A file's contents decide its hash, not when it was
 * written, so a checkout, a worktree or a touch that leaves the bytes alone leaves the trace holding. It's the trace
 * docs/proposals/visual-tests.md plans for its cases, kept for the canvas's bitmaps first.
 */

/** A file as `contentReader` read it: a hash of its bytes, and its text when it's small enough to scan for imports. */
export interface HashedFile {
  /** The file's bytes, hashed; `-` when it couldn't be read, as when it's gone. */
  hash: string
  /** Its text, for files up to `scannedBytes`; none for a larger one, such as a lockfile, or one that's gone. */
  text?: string
}

/** The largest file whose text is kept for scanning its imports: a source file, not a lockfile. */
export const scannedBytes = 512 * 1024

/** What a file's size and modification time were when it was last read, and what it held then. */
interface Read {
  stamp: string
  content: Promise<HashedFile>
}

/**
 * Reads project files by content, each read again only once its size or modification time moves, so checking a trace
 * costs a `stat` for each file it lists. Paths are absolute.
 */
export function contentReader(): (path: string) => Promise<HashedFile> {
  const reads = new Map<string, Read>()

  return async (path) => {
    const info = await stat(path).catch(() => undefined)

    if (!info?.isFile()) {
      reads.delete(path)

      return { hash: "-" }
    }

    const stamp = `${info.size}:${Math.trunc(info.mtimeMs)}`
    const known = reads.get(path)

    if (known?.stamp === stamp) {
      return known.content
    }

    const content = readFile(path).then(
      (bytes): HashedFile => {
        const hash = createHash("sha256").update(bytes).digest("hex")

        return bytes.length <= scannedBytes ? { hash, text: bytes.toString("utf8") } : { hash }
      },
      (): HashedFile => ({ hash: "-" })
    )

    reads.set(path, { stamp, content })

    return content
  }
}

/**
 * A trace's digest: what drew it (`salt`, such as Parity's renderer and the format) and each file it lists with the
 * hash of its contents, in path order. Two traces with the same digest read the same bytes.
 */
export function traceDigest(salt: string, files: Iterable<readonly [path: string, hash: string]>): string {
  const digest = createHash("sha256").update(salt).update("\0")

  for (const [path, hash] of [...files].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    digest.update(`${path}\0${hash}\0`)
  }

  return digest.digest("hex").slice(0, 40)
}
