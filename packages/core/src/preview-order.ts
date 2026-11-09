/**
 * Who an offscreen job is for, most urgent first: the canvas's bitmaps and agents' renders, then component previews
 * someone can see, then the rest of the previews, made while the person is idle (PAR-207).
 */
export type RenderPriority = "render" | "visible" | "idle"

const rank: Record<RenderPriority, number> = { render: 0, visible: 1, idle: 2 }

/**
 * How many offscreen windows draw at once, and so how many bitmaps the canvas asks for at a time (PAR-523). Each is a
 * renderer process holding the project's modules while it's open.
 */
export const offscreenWindows = 4

/** The offscreen windows' jobs, each run in a window of its own. */
export interface RenderQueue {
  /**
   * Runs `run` in a free window, numbered from 0, once every job of a higher priority, and every earlier one of the
   * same, has started.
   */
  add<T>(priority: RenderPriority, run: (window: number) => Promise<T>): Promise<T>
  /** Jobs waiting their turn, not counting those running. */
  waiting(): number
}

interface QueuedJob {
  priority: number
  start(window: number): Promise<void>
}

/**
 * A queue for the offscreen windows that runs one job in each of `windows` at once, the most urgent waiting first and,
 * among equals, the earliest (PAR-523). A free window goes to the lowest number, so the others open only when jobs
 * wait. Component previews take one window at a time, so with more than one a preview never holds up the canvas's
 * bitmaps or agents' renders, and with one it delays them by at most the one being made. A job running is never stopped.
 */
export function renderQueue(windows = 1): RenderQueue {
  const queued: QueuedJob[] = []
  const busy = new Set<number>()
  let previewing = false

  const pump = () => {
    while (busy.size < windows) {
      let next = -1

      for (let index = 0; index < queued.length; index++) {
        const job = queued[index]!

        if (job.priority !== rank.render && previewing) {
          continue
        }

        if (next === -1 || job.priority < queued[next]!.priority) {
          next = index
        }
      }

      if (next === -1) {
        return
      }

      const [job] = queued.splice(next, 1)
      let window = 0

      while (busy.has(window)) {
        window++
      }

      busy.add(window)
      const preview = job!.priority !== rank.render

      if (preview) {
        previewing = true
      }

      void job!.start(window).finally(() => {
        busy.delete(window)

        if (preview) {
          previewing = false
        }

        pump()
      })
    }
  }

  return {
    add(priority, run) {
      return new Promise((resolve, reject) => {
        queued.push({
          priority: rank[priority],
          start: (window) =>
            Promise.resolve()
              .then(() => run(window))
              .then(resolve, reject)
        })
        pump()
      })
    },
    waiting: () => queued.length
  }
}

/** How long the person must leave Parity alone before previews nobody can see are made. */
export const previewIdleMs = 2000

/** How often previews check again while the canvas is still taking its own bitmaps. */
export const previewSettleMs = 1000

/** A component whose preview isn't made for its code as it is now. */
export interface PreviewNeed {
  component: string
  /** Its row or picker item is on screen. */
  visible: boolean
}

/** What decides the next preview. */
export interface PreviewMoment {
  /**
   * The project is open, its canvas is usable and no frame on it is waiting for its bitmap. Until then nothing is
   * made, so previews never hold up a project opening.
   */
  canvasSettled: boolean
  /** Milliseconds since the person last pointed, typed or dragged, or an agent edited. */
  idleFor: number
  /** Previews to make, in the order they're listed. */
  needed: readonly PreviewNeed[]
}

/** Make a component's preview at a priority, wait before asking again, or nothing's left to make. */
export type PreviewStep = { make: string; priority: "visible" | "idle" } | { wait: number } | undefined

/**
 * The next preview to make, one at a time: none until the canvas has settled; then those on screen, in order, whatever
 * the person is doing; then the rest, in order, only once they've been idle for `previewIdleMs`. Asked again after
 * each one, so the idle pass stops before its next preview as soon as the person works.
 */
export function nextPreview({ canvasSettled, idleFor, needed }: PreviewMoment): PreviewStep {
  if (needed.length === 0) {
    return undefined
  }

  if (!canvasSettled) {
    return { wait: previewSettleMs }
  }

  const visible = needed.find((need) => need.visible)

  if (visible) {
    return { make: visible.component, priority: "visible" }
  }

  if (idleFor >= previewIdleMs) {
    return { make: needed[0]!.component, priority: "idle" }
  }

  return { wait: previewIdleMs - idleFor }
}

/** The largest a stored preview is drawn, in pixels: twice the grid tile and twice the card. */
export const previewSizes = {
  thumbnail: { width: 240, height: 152 },
  large: { width: 608, height: 352 }
} as const

/**
 * The size an image of `width` by `height` is scaled to so it fits inside `box`, keeping its shape and never growing,
 * at least a pixel each way.
 */
export function fitInside(width: number, height: number, box: { width: number; height: number }) {
  const scale = Math.min(1, box.width / Math.max(1, width), box.height / Math.max(1, height))

  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Whether a picture shows nothing but the page it's drawn on: every pixel the same as the first, which is in the room
 * round the component (PAR-517). `pixels` are 4 bytes each, in any channel order.
 */
export function drawsNothing(pixels: Uint8Array): boolean {
  for (let at = 4; at + 3 < pixels.length; at += 4) {
    for (let channel = 0; channel < 4; channel++) {
      if (pixels[at + channel] !== pixels[channel]) {
        return false
      }
    }
  }

  return true
}
