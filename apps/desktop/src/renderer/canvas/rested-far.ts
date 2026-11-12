import { type FramesShowing, watchRestedFar } from "@parity-app/telemetry"
import { type Atom, type Editor, react } from "tldraw"
import { track } from "../report-error.ts"
import { bitmapScale } from "./frame-bitmaps.ts"

/** Where `data-far` comes off zooming back in (see `markZoomedOut`), as the zoom times the device pixel ratio. */
const farLine = bitmapScale * 1.15

/** How often the frames in view are looked at while the camera rests far out, until the rest ends. */
const lookEveryMs = 250

/**
 * Records `canvas.restedFar` each time the camera comes to rest zoomed far out (`resting`): what the frames in view show
 * and how long until they all show their bitmaps, so whether far frames reach their bitmaps can be read for everyone
 * (PAR-949). Nothing while interacting, where frames are the real thing at any zoom.
 */
export function recordRestedFar(editor: Editor, area: Element, resting: Atom<boolean>): () => void {
  let looking: Looking | undefined

  const stop = react("rested far", () => {
    // `resting` goes by tldraw's efficient zoom, which lags the camera: the zoom itself has to be past the line too, or
    // a camera zoomed back in would be looked at, its frames still asleep on their bitmaps.
    const far = resting.get() && editor.getZoomLevel() * window.devicePixelRatio <= farLine

    if (looking?.ended) {
      looking = undefined
    }

    if (far && !looking && !area.matches('[data-tool="interact"]')) {
      looking = look(editor, area)
    } else if (!far && looking) {
      looking.moved()
      looking = undefined
    }
  })

  return () => {
    stop()
    looking?.stop()
  }
}

/** One rest being looked at, until it `ended`. */
interface Looking {
  readonly ended: boolean
  /** Stops looking without recording, as when the canvas goes. */
  stop(): void
  /** The camera moved: records the rest, unless it already ended. */
  moved(): void
}

/** Looks at the frames in view until the rest ends, then records it. */
function look(editor: Editor, area: Element): Looking {
  const watch = watchRestedFar({
    at: performance.now(),
    zoom: editor.getZoomLevel(),
    pixelRatio: window.devicePixelRatio
  })

  let ended = false

  const finish = (attributes: ReturnType<typeof watch.saw>) => {
    clearInterval(timer)
    ended = true

    if (attributes) {
      track("canvas.restedFar", attributes)
    }
  }

  const tick = () => {
    const attributes = watch.saw(performance.now(), framesShowing(area))

    if (attributes) {
      finish(attributes)
    }
  }

  const timer = setInterval(tick, lookEveryMs)
  tick()

  return {
    get ended() {
      return ended
    },
    stop() {
      clearInterval(timer)
      ended = true
    },
    moved() {
      if (!ended) {
        finish(watch.moved(performance.now(), framesShowing(area)))
      }
    }
  }
}

/**
 * What the frames in view show zoomed far out, read from the marks the canvas's stylesheet goes by: a bitmap once it's
 * decoded, else a skeleton once measured, else a placeholder, else the frame drawing its design. The selected board's
 * frames stay live, so they're left out.
 */
export function framesShowing(area: Element): FramesShowing {
  const view = area.getBoundingClientRect()
  const frames: FramesShowing = { bitmaps: 0, skeletons: 0, placeholders: 0, live: 0 }

  for (const tile of area.querySelectorAll<HTMLElement>(".container-view:not([data-live]) .mode-tile > div")) {
    const box = tile.getBoundingClientRect()

    if (
      box.width === 0 ||
      box.right < view.left ||
      box.left > view.right ||
      box.bottom < view.top ||
      box.top > view.bottom
    ) {
      continue
    }

    if (tile.hasAttribute("data-bitmap")) {
      frames.bitmaps++
    } else if (tile.hasAttribute("data-skeleton")) {
      frames.skeletons++
    } else if (tile.querySelector(":scope > [data-placeholder]")) {
      frames.placeholders++
    } else {
      frames.live++
    }
  }

  return frames
}
