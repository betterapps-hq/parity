import { readFile, stat } from "node:fs/promises"
import { basename } from "node:path"
import { fileURLToPath } from "node:url"
import { videoLimit } from "@parity-app/editor"
import type { CopiedFile } from "../shared/protocol.ts"

/*
 * A file copied in Explorer or Finder, which the window's paste can't read: the browser's clipboard holds no files, so
 * main reads where the file is from the system's clipboard and reads the file (PAR-841). The system gives the first file
 * copied, so pasting takes that one.
 */

/** What the system's clipboard holds for a copied file, by platform. */
export interface ClipboardReader {
  platform: NodeJS.Platform
  /** The bytes of one of the system's own clipboard formats, or none when the clipboard doesn't hold it. */
  raw(format: string): Promise<Buffer | undefined>
}

/** Where the file copied in Explorer or Finder is, or undefined when no file is copied. */
export async function copiedPath(clipboard: ClipboardReader): Promise<string | undefined> {
  if (clipboard.platform === "win32") {
    // Explorer's `FileNameW` is the first file's path in UTF-16, ending in a null.
    const path = (await clipboard.raw("FileNameW"))?.toString("utf16le").replaceAll("\0", "").trim()

    return path || undefined
  }

  if (clipboard.platform === "darwin") {
    const url = (await clipboard.raw("public.file-url"))?.toString("utf8").replaceAll("\0", "").trim()

    return url?.startsWith("file://") ? fileURLToPath(url) : undefined
  }

  return undefined
}

/**
 * Reads one of the system's own clipboard formats through Electron's clipboard, which names such a format with its
 * `osclipboard` type. Electron's clipboard comes in, so this takes data and gives data.
 */
export async function rawFormat(
  clipboard: Pick<Electron.Clipboard, "has" | "read">,
  format: string
): Promise<Buffer | undefined> {
  const type = `electron application/osclipboard;format="${format}"`

  if (!(await clipboard.has(type))) {
    return undefined
  }

  for (const item of await clipboard.read()) {
    const blob = await item.getType(type).catch(() => undefined)

    if (blob instanceof Blob) {
      return Buffer.from(await blob.arrayBuffer())
    }
  }

  return undefined
}

/**
 * The file copied in Explorer or Finder, with its bytes, or none when no file is copied or it's gone. A file too large
 * for any type Parity takes comes without its bytes, so the window can say so without reading it.
 */
export async function copiedFiles(clipboard: ClipboardReader): Promise<CopiedFile[]> {
  const path = await copiedPath(clipboard)

  if (!path) {
    return []
  }

  const found = await stat(path).catch(() => undefined)

  if (!found?.isFile()) {
    return []
  }

  const file: CopiedFile = { name: basename(path), size: found.size }

  if (found.size <= videoLimit) {
    file.data = new Uint8Array(await readFile(path))
  }

  return [file]
}
