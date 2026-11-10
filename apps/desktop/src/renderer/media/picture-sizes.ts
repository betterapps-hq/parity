import type { PictureSize } from "@parity-app/editor"
import { useSyncExternalStore } from "react"

/*
 * The natural sizes of the pictures the Media tab has shown, by address. A project's image list says where each file
 * is and how many bytes it has, not how large its picture is, and a linked photo has no file to read at all, so a
 * size is learned as its picture loads. The wall lays out by them, a card shows them, and inserting one needs them.
 */

let sizes: ReadonlyMap<string, PictureSize> = new Map()
const listeners = new Set<() => void>()

/** Keeps a picture's size once it has loaded. Says nothing when it's the size already known. */
export function notePictureSize(url: string, size: PictureSize): void {
  const known = sizes.get(url)

  if (known?.width === size.width && known.height === size.height) {
    return
  }

  sizes = new Map(sizes).set(url, size)

  for (const listener of listeners) {
    listener()
  }
}

/** Every size known so far: the same map until one more is learned. */
export function pictureSizes(): ReadonlyMap<string, PictureSize> {
  return sizes
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

/** The sizes known so far, following each one learned. */
export function usePictureSizes(): ReadonlyMap<string, PictureSize> {
  return useSyncExternalStore(subscribe, pictureSizes)
}
