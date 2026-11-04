/**
 * Who an offscreen job is for, most urgent first: the canvas's bitmaps and agents' renders, then component previews
 * someone can see, then the rest of the previews, made while the person is idle (PAR-207).
 */
export type RenderPriority = "render" | "visible" | "idle"

const rank: Record<RenderPriority, number> = { render: 0, visible: 1, idle: 2 }

/** The offscreen window's jobs, run one at a time. */
export interface RenderQueue {
  /** Runs `run` once every job of a higher priority, and every earlier one of the same, has finished. */
  add<T>(priority: RenderPriority, run: () => Promise<T>): Promise<T>
  /** Jobs waiting their turn, not counting the one running. */
  waiting(): number
}

interface QueuedJob {
  priority: number
  start(): Promise<void>
}

/**
 * A queue for the offscreen window that runs one job at a time, the most urgent waiting first and, among equals, the
 * earliest. A job running is never stopped, so a preview at most delays a canvas bitmap by the one being made.
 */
export function renderQueue(): RenderQueue {
  const queued: QueuedJob[] = []
  let running = false
  const pump = () => {
    if (running || queued.length === 0) return
    let next = 0
    for (let index = 1; index < queued.length; index++) {
      if (queued[index]!.priority < queued[next]!.priority) next = index
    }
    const [job] = queued.splice(next, 1)
    running = true
    void job!.start().finally(() => {
      running = false
      pump()
    })
  }
  return {
    add(priority, run) {
      return new Promise((resolve, reject) => {
        queued.push({
          priority: rank[priority],
          start: () => Promise.resolve().then(run).then(resolve, reject)
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
  if (needed.length === 0) return undefined
  if (!canvasSettled) return { wait: previewSettleMs }
  const visible = needed.find((need) => need.visible)
  if (visible) return { make: visible.component, priority: "visible" }
  if (idleFor >= previewIdleMs) return { make: needed[0]!.component, priority: "idle" }
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
export function fitInside(
  width: number,
  height: number,
  box: { width: number; height: number }
): { width: number; height: number } {
  const scale = Math.min(1, box.width / Math.max(1, width), box.height / Math.max(1, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
