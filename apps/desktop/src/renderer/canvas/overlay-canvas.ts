/** The part of a canvas element this sizes: its width and height, which are the size of its bitmap. */
export interface Sized {
  width: number
  height: number
}

/**
 * Gives a canvas a bitmap only while `showing` says something's drawn on it. It's for tldraw's overlay canvas, which
 * draws the selection box, hover outlines, the brush and snap lines, and which tldraw keeps the window's size in device
 * pixels at all times: about 36 MB with the image the GPU keeps of it, for a canvas that's empty most of the time.
 *
 * tldraw sizes the canvas as it draws, whenever its size isn't the window's, so the size it sets is held at none while
 * nothing shows. `release` takes the bitmap away once the last overlay goes; the next draw with one showing gives it
 * back. `restore` leaves the canvas to tldraw again.
 */
export function sizeWhileShown(canvas: Sized, showing: () => boolean): { release(): void; restore(): void } {
  const dimensions = (["width", "height"] as const).map((name) => {
    const own = accessor(canvas, name)
    Object.defineProperty(canvas, name, {
      configurable: true,
      enumerable: true,
      get: () => own.get.call(canvas),
      set: (value: number) => {
        set(canvas, own, showing() ? value : 0)
      }
    })
    return { name, own }
  })
  return {
    release() {
      if (showing()) return
      for (const { own } of dimensions) set(canvas, own, 0)
    },
    restore() {
      for (const { name } of dimensions) delete (canvas as Partial<Sized>)[name]
    }
  }
}

type Accessor = { get(this: Sized): number; set(this: Sized, value: number): void }

/** Setting a dimension clears the bitmap even when it's unchanged, so only a change is set. */
function set(canvas: Sized, own: Accessor, value: number): void {
  if (own.get.call(canvas) !== value) own.set.call(canvas, value)
}

/** The canvas's own accessor for a dimension, from the class it's made by. */
function accessor(canvas: Sized, name: keyof Sized): Accessor {
  for (let prototype = Object.getPrototypeOf(canvas); prototype; prototype = Object.getPrototypeOf(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (descriptor?.get && descriptor.set) return { get: descriptor.get, set: descriptor.set }
  }
  throw new Error(`The canvas has no ${name} to size.`)
}
