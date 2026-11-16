import type { PictureSize } from "@parity-app/editor"
import { useStore, windowStore } from "../store.ts"

/*
 * The natural sizes of the pictures the Media tab has shown, by address. A project's image list says where each file
 * is and how many bytes it has, not how large its picture is, and a linked photo has no file to read at all, so a
 * size is learned as its picture loads. The wall lays out by them, a card shows them, and inserting one needs them.
 */

const sizes = windowStore<ReadonlyMap<string, PictureSize>>(() => new Map())

/** Keeps a picture's size once it has loaded. Says nothing when it's the size already known. */
export function notePictureSize(url: string, size: PictureSize): void {
  const known = sizes.get().get(url)

  if (known?.width === size.width && known.height === size.height && known.seconds === size.seconds) {
    return
  }

  sizes.update((now) => new Map(now).set(url, size))
}

/** The sizes known so far, following each one learned. */
export function usePictureSizes(): ReadonlyMap<string, PictureSize> {
  return useStore(sizes)
}
