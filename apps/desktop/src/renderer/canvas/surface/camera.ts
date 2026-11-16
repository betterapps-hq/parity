import type { Camera, CameraView, Disposable, FollowEnd, Following } from "./types.ts"

/** tldraw's camera: a page point `p` is drawn at `(p + {x, y}) * z` in the canvas area. */
export interface CameraState {
  x: number
  y: number
  z: number
}

/** The canvas area's size, in screen pixels. */
export interface Size {
  width: number
  height: number
}

/**
 * What the camera service needs from the canvas, so it runs the same over tldraw (`camera-tldraw.ts`) and in tests.
 */
export interface CameraPort {
  camera(): CameraState
  viewport(): Size
  zoomLimits(): { min: number; max: number }
  /** Moves the camera at once. */
  setCamera(camera: CameraState): void
  /** Told when the camera or the canvas area's size changes. */
  onCamera(listener: () => void): () => void
  /** Told when the canvas opens another page. */
  onNavigate(listener: () => void): () => void
  /** Told when the person presses Esc. */
  onEscape(listener: () => void): () => void
  /** Calls back on the next animation frame, with its time. Returns what cancels it. */
  frame(callback: (now: number) => void): () => void
  now(): number
}

/** How long `show` and following's moves take to glide to where they're going. */
export const glideMs = 250

/** How close two cameras are to count as the same, so rounding in tldraw's constraints never ends following. */
const sameWithin = { place: 0.5, zoom: 0.0005 }

/** The part of the page a camera shows in a viewport this size. */
export function viewOf(camera: CameraState, viewport: Size): CameraView {
  return { x: -camera.x, y: -camera.y, width: viewport.width / camera.z, height: viewport.height / camera.z }
}

/** The camera that shows `view` whole and centred in a viewport this size, its zoom kept within `limits`. */
export function fitCamera(view: CameraView, viewport: Size, limits: { min: number; max: number }): CameraState {
  const fit = Math.min(viewport.width / Math.max(view.width, 1e-6), viewport.height / Math.max(view.height, 1e-6))
  const z = Math.min(limits.max, Math.max(limits.min, fit))
  const centre = { x: view.x + view.width / 2, y: view.y + view.height / 2 }

  return { x: viewport.width / (2 * z) - centre.x, y: viewport.height / (2 * z) - centre.y, z }
}

/** Whether two cameras show the same thing, near enough. */
export function sameCamera(a: CameraState, b: CameraState): boolean {
  return (
    Math.abs(a.z - b.z) <= sameWithin.zoom &&
    Math.abs(a.x - b.x) * a.z <= sameWithin.place &&
    Math.abs(a.y - b.y) * a.z <= sameWithin.place
  )
}

/** How someone else's move of the camera ends following: a zoom when the zoom changed, a pan when only the place did. */
export function moveEnd(from: CameraState, to: CameraState): "panned" | "zoomed" {
  return Math.abs(from.z - to.z) > sameWithin.zoom ? "zoomed" : "panned"
}

/**
 * The view part-way from `from` to `to`, eased out. Its size changes by ratio, so a long zoom feels as even as a short
 * one, and its centre moves in step.
 */
export function between(from: CameraView, to: CameraView, t: number): CameraView {
  const eased = 1 - (1 - t) ** 3
  const width = from.width * (to.width / from.width) ** eased
  const height = from.height * (to.height / from.height) ** eased
  const cx = from.x + from.width / 2 + (to.x + to.width / 2 - from.x - from.width / 2) * eased
  const cy = from.y + from.height / 2 + (to.y + to.height / 2 - from.y - from.height / 2) * eased

  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

export interface CameraOptions {
  /** Told when following ends, for `follow.ended`. */
  onFollowEnded?: (ended: { owner: string; why: FollowEnd; durationMs: number }) => void
}

/** The camera service over a canvas, and what stops it. */
export function createCamera(port: CameraPort, { onFollowEnded }: CameraOptions = {}): Camera & Disposable {
  /** The camera as following last set it, so its own moves are told apart from anyone else's. */
  let tagged: CameraState | undefined
  let moving = false
  let following: Follow | undefined
  let glide: (() => void) | undefined

  /** Sets the camera as following or `show` does: tagged, so it never ends following. */
  const place = (camera: CameraState) => {
    moving = true

    try {
      port.setCamera(camera)
    } finally {
      moving = false
    }

    tagged = port.camera()
  }

  const fit = (view: CameraView) => fitCamera(view, port.viewport(), port.zoomLimits())

  /** Glides from what's in view to `to`, then calls `done`. A later glide replaces it. */
  const glideTo = (to: () => CameraView, done?: () => void) => {
    glide?.()
    const from = viewOf(port.camera(), port.viewport())
    const began = port.now()
    let cancel: (() => void) | undefined

    const step = (now: number) => {
      const t = Math.min(1, (now - began) / glideMs)
      place(fit(between(from, to(), t)))

      if (t < 1) {
        cancel = port.frame(step)
      } else {
        glide = undefined
        done?.()
      }
    }

    cancel = port.frame(step)
    glide = () => {
      cancel?.()
      glide = undefined
      done?.()
    }
  }

  class Follow implements Following {
    private readonly began = port.now()
    private readonly listeners = new Set<(why: FollowEnd) => void>()
    private ended = false
    private target: CameraView
    private viewport: Size

    constructor(
      view: CameraView,
      private readonly owner: string
    ) {
      this.target = view
      this.viewport = port.viewport()
      // Where the camera is now counts as following's own, so a move before its first glide frame still ends it.
      tagged = port.camera()
      glideTo(() => this.target)
    }

    get active(): boolean {
      return !this.ended
    }

    update(view: CameraView): void {
      if (this.ended) {
        return
      }

      this.target = view
      glideTo(() => this.target)
    }

    onEnd(listener: (why: FollowEnd) => void): Disposable {
      this.listeners.add(listener)

      return { dispose: () => this.listeners.delete(listener) }
    }

    dispose(): void {
      this.end("disposed")
    }

    /** The camera or the canvas area changed. */
    cameraChanged(): void {
      const now = port.camera()

      if (tagged && !sameCamera(now, tagged)) {
        this.end(moveEnd(tagged, now))

        return
      }

      // The window was resized: what's followed is fitted to it again.
      const viewport = port.viewport()

      if (viewport.width !== this.viewport.width || viewport.height !== this.viewport.height) {
        this.viewport = viewport

        if (!glide) {
          place(fit(this.target))
        }
      }
    }

    end(why: FollowEnd): void {
      if (this.ended) {
        return
      }

      this.ended = true

      if (following === this) {
        following = undefined
        glide?.()
      }

      onFollowEnded?.({ owner: this.owner, why, durationMs: Math.round(port.now() - this.began) })

      for (const listener of Array.from(this.listeners)) {
        listener(why)
      }

      this.listeners.clear()
    }
  }

  const listeners = new Set<(view: CameraView) => void>()
  let pending: (() => void) | undefined

  const stops = [
    port.onCamera(() => {
      if (!moving) {
        following?.cameraChanged()
      }

      if (listeners.size > 0 && !pending) {
        pending = port.frame(() => {
          pending = undefined
          const view = viewOf(port.camera(), port.viewport())

          for (const listener of Array.from(listeners)) {
            listener(view)
          }
        })
      }
    }),
    port.onNavigate(() => following?.end("navigated")),
    port.onEscape(() => following?.end("escape"))
  ]

  return {
    get: () => viewOf(port.camera(), port.viewport()),
    onChange(listener) {
      listeners.add(listener)

      return { dispose: () => listeners.delete(listener) }
    },
    show(view, { animate = true } = {}) {
      following?.end("replaced")

      if (!animate) {
        glide?.()
        place(fit(view))

        return Promise.resolve()
      }

      return new Promise((resolve) => glideTo(() => view, resolve))
    },
    follow(view, { owner = "core" } = {}) {
      following?.end("replaced")
      const next = new Follow(view, owner)
      following = next

      return next
    },
    dispose() {
      following?.end("disposed")
      glide?.()
      pending?.()

      for (const stop of stops) {
        stop()
      }

      listeners.clear()
    }
  }
}
