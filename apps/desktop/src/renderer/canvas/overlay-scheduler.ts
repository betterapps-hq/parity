import { drawsOver, measuresNext, movesOnlyTheView, type overlayDesigns, settleUntil } from "@parity-app/editor"
import { flushSync } from "react-dom"
import { react, type TLRecord } from "tldraw"
import { subscribePreferences } from "../chrome/preferences.ts"
import { frameAnimates, watchFrame } from "../frame-host.ts"
import { allFrames, subscribeFrames } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"

/**
 * Something drawn over the canvas's frames that follows them: the selection's outlines, the text editor, the tab order,
 * the element inspector and an agent's measurements. It says what it draws over, and splits measuring in two, so that
 * every overlay reads the page before any of them writes to it.
 */
export interface MeasuredOverlay<T> {
  /** Whether it shows anything now. While no overlay does, measuring rests, and the camera isn't followed. */
  showing: () => boolean
  /** The designs whose frames it draws over: their changes wake measuring, and their animations keep it going. */
  designs: () => OverlayDesigns
  /** Reads the page and works out what to draw, writing nothing. */
  measure: () => T
  /** Draws what `measure` found. It's called only when that differs from what it drew last. */
  draw: (next: T) => void
}

/** The designs whose frames an overlay draws over, or every design's. */
type OverlayDesigns = ReturnType<typeof overlayDesigns>

/** The parts of a project the scheduler hears changes from. */
export type OverlaySession = Pick<ProjectSession, "store" | "selection" | "editor" | "subscribe">

/** An overlay as the scheduler keeps it: its `measure` gives back its `draw`, or nothing when it found what it drew. */
interface Entry {
  showing: () => boolean
  designs: () => OverlayDesigns
  read: () => (() => void) | undefined
}

/**
 * Measures `overlay` over the canvas `area` with every other overlay there, until the function it gives back is called.
 * It measures once straight away, and from then on when the area's one scheduler decides (see `OverlayScheduler`).
 */
export function scheduleOverlay<T>(
  area: HTMLElement,
  session: OverlaySession,
  overlay: MeasuredOverlay<T>
): () => void {
  let scheduler = schedulers.get(area)

  if (!scheduler) {
    scheduler = new OverlayScheduler(area, session)
    schedulers.set(area, scheduler)
  }

  const added = scheduler
  let last: string | undefined

  const stop = added.add({
    showing: overlay.showing,
    designs: overlay.designs,
    read: () => {
      const next = overlay.measure()
      const serialized = JSON.stringify(next)

      if (serialized === last) {
        return undefined
      }

      last = serialized

      return () => overlay.draw(next)
    }
  })

  return () => {
    if (stop()) {
      added.dispose()
      schedulers.delete(area)
    }
  }
}

/** Each canvas area's scheduler, while an overlay is measured over it. */
const schedulers = new WeakMap<HTMLElement, OverlayScheduler>()

/**
 * When the overlays over one canvas area measure (PAR-986). They measure when something can have moved what they draw,
 * not every frame (PAR-522): each change measures every animation frame for a moment, and after that only while an
 * animation runs in a frame one of them draws over, as `@parity-app/editor`'s overlay-measuring.ts decides. The camera
 * is followed apart from that, in the frame it moves (PAR-653). Every pass reads for all of them, then draws for all of
 * them, so the page is laid out once a frame however many overlays show.
 */
class OverlayScheduler {
  private readonly entries = new Set<Entry>()
  private readonly stops: (() => void)[] = []
  private frame = 0
  private until = 0
  private readonly ticker: HTMLElement
  private stopEditor: (() => void) | undefined
  private editor: OverlaySession["editor"]

  constructor(
    private readonly area: HTMLElement,
    session: OverlaySession
  ) {
    // The camera moves in tldraw's own animation frame, which moves the canvas and has boards' gutters follow the zoom
    // (PAR-602). Measured in an animation frame of its own, overlays were drawn from before the camera moved or after,
    // and laid the page out partway through the frame; and drawn from React state, they were painted a frame late. So
    // once the camera has moved, they're measured when the frame has been laid out, and drawn before it's painted: a
    // ResizeObserver's callbacks run then, after every animation frame callback, so the camera changes the size of a
    // hidden element for it to be called.
    this.ticker = document.createElement("div")
    this.ticker.setAttribute("aria-hidden", "true")
    this.ticker.style.cssText = "position: fixed; top: 0; left: 0; width: 1px; height: 0; visibility: hidden"
    document.body.append(this.ticker)
    const laidOut = new ResizeObserver(() => this.pass(true))
    laidOut.observe(this.ticker)

    // The canvas area resizing or showing again, and frames drawn over changing size.
    const resizes = new ResizeObserver((entries) => {
      const moved = ({ target }: ResizeObserverEntry) =>
        target === area || (target instanceof HTMLElement && this.drawsOver(target))

      if (entries.some(moved)) {
        this.wake()
      }
    })

    resizes.observe(area)

    // What frames draw changing: React committing, a component's own DOM and style writes, a class starting a
    // transition, an image loading.
    const watched = new Map<HTMLElement, () => void>()

    const watch = (host: HTMLElement, mounted: boolean) => {
      if (!mounted || !area.contains(host)) {
        watched.get(host)?.()
        watched.delete(host)
        resizes.unobserve(host)

        return
      }

      resizes.observe(host)

      if (!watched.has(host)) {
        watched.set(
          host,
          watchFrame(host, () => this.wakeFor(host), { attributes: true, loads: true })
        )
      }
    }

    for (const host of allFrames(area)) {
      watch(host, true)
    }

    const stopFrames = subscribeFrames((host, mounted) => {
      watch(host, mounted)

      if (area.contains(host)) {
        this.wakeFor(host)
      }
    })

    // The selection, hover, tool and editing; preferences; the designs; tldraw's boards; and the pointer and keys,
    // which drive drags, snapping, resizing, Alt's redlines and typing. The camera, and the wheel that moves it, are left
    // to `followCamera`, which measures once in each frame the camera moves; measuring every frame as well would lay
    // the page out twice.
    const wake = () => this.wake()
    const inputs = ["pointermove", "pointerdown", "pointerup", "pointercancel", "keydown", "keyup", "input"]

    for (const type of inputs) {
      window.addEventListener(type, wake, { capture: true, passive: true })
    }

    document.fonts.addEventListener("loadingdone", wake)

    this.stops.push(
      () => laidOut.disconnect(),
      () => resizes.disconnect(),
      () => watched.forEach((stop) => stop()),
      stopFrames,
      session.selection.subscribe(wake),
      subscribePreferences(wake),
      session.store.subscribe(wake),
      // The canvas mounting, or remounting, gives the session another editor to follow.
      session.subscribe(() => this.follow(session.editor)),
      () => {
        for (const type of inputs) {
          window.removeEventListener(type, wake, { capture: true })
        }

        document.fonts.removeEventListener("loadingdone", wake)
      }
    )

    this.follow(session.editor)
  }

  /** Measures `overlay` from now on, and once straight away. Gives back what stops it, which says whether it was last. */
  add(entry: Entry): () => boolean {
    this.entries.add(entry)

    if (!this.hidden()) {
      entry.read()?.()
    }

    this.wake()

    return () => {
      this.entries.delete(entry)

      return this.entries.size === 0
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.stopEditor?.()

    for (const stop of this.stops.splice(0)) {
      stop()
    }

    this.ticker.remove()
  }

  /** Follows `editor`'s boards and camera, in place of the one it followed. */
  private follow(editor: OverlaySession["editor"]): void {
    if (editor === this.editor) {
      return
    }

    this.stopEditor?.()
    this.stopEditor = undefined
    this.editor = editor

    if (!editor) {
      return
    }

    const stopStore = editor.store.listen(({ changes }) => {
      const types = (records: Record<string, TLRecord>) => Object.values(records).map((record) => record.typeName)

      const change = {
        added: types(changes.added),
        updated: Object.values(changes.updated).map(([from, to]) => {
          const before = new Map(Object.entries(from))

          return {
            type: to.typeName,
            fields: Object.entries(to).flatMap(([field, value]) => (before.get(field) === value ? [] : [field]))
          }
        }),
        removed: types(changes.removed)
      }

      if (!movesOnlyTheView(change)) {
        this.wake()
      }
    })

    const stopCamera = react("overlays follow the camera", () => {
      editor.getCamera()
      this.followCamera()
    })

    this.stopEditor = () => {
      stopStore()
      stopCamera()
    }

    this.wake()
  }

  /** Has the overlays measured once the frame the camera moved in is laid out (see the constructor). */
  private followCamera(): void {
    if (this.showing()) {
      this.ticker.style.width = this.ticker.style.width === "1px" ? "2px" : "1px"
    }
  }

  private wake(): void {
    this.until = settleUntil(performance.now(), this.until)
    this.frame ||= requestAnimationFrame(this.tick)
  }

  /** A frame's change wakes measuring only when an overlay draws over it. */
  private wakeFor(host: HTMLElement): void {
    if (this.drawsOver(host)) {
      this.wake()
    }
  }

  private readonly tick = () => {
    this.frame = 0

    if (
      measuresNext({ now: performance.now(), until: this.until, showing: this.showing(), animating: this.animating })
    ) {
      this.frame = requestAnimationFrame(this.tick)
    }

    this.pass(false)
  }

  /** Whether any overlay shows anything. */
  private showing(): boolean {
    return [...this.entries].some((entry) => entry.showing())
  }

  private drawsOver(host: HTMLElement): boolean {
    return [...this.entries].some((entry) => drawsOver(entry.designs(), host.dataset.design))
  }

  /** An animation or a transition running in a frame an overlay draws over, which it follows as it goes. */
  private readonly animating = () => allFrames(this.area).some((host) => this.drawsOver(host) && frameAnimates(host))

  private hidden(): boolean {
    return !!this.area.closest("[hidden]")
  }

  /**
   * Measures every overlay, then draws each one whose measure changed. Drawn `now`, in the ResizeObserver's callback,
   * they're committed before the frame is painted, all in one React commit.
   */
  private pass(now: boolean): void {
    if (this.hidden()) {
      return
    }

    // Every read, then every write, so reading the next overlay's boxes doesn't lay out the page again.
    const writes = [...this.entries].flatMap((entry) => entry.read() ?? [])

    if (writes.length === 0) {
      return
    }

    const draw = () => writes.forEach((write) => write())

    if (now) {
      flushSync(draw)
    } else {
      draw()
    }
  }
}
