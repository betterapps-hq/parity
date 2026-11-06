import type { ConsoleContext, ConsoleEntry, ConsoleHost } from "../../shared/protocol.ts"

/**
 * Which frame on the canvas a console message comes from (PAR-147). Frames share the window, so the main process can't
 * tell. While a frame handles an event, and in what that event's task goes on to run, as the render it causes, each
 * console call first says which frame it's from, so the message is kept as that design's, in that state and mode.
 * Outside those tasks the console is left as it is, so the window's own developer tools point at the lines that wrote
 * each message.
 */

/** The console's methods that write a message, by the level the main process gets it at. */
const levels = {
  log: "info",
  info: "info",
  warn: "warning",
  error: "error",
  debug: "debug"
} as const satisfies Record<string, ConsoleEntry["level"]>

type Method = keyof typeof levels

/** Events a person's use of a frame starts, for which what's written is the frame's. */
const interactions = [
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerover",
  "pointerout",
  "mousedown",
  "mouseup",
  "mouseover",
  "mouseout",
  "keydown",
  "keyup",
  "input",
  "change",
  "submit",
  "focusin",
  "focusout",
  "wheel",
  "scroll"
]

/** The frame an event's path goes through, as its host names it: the design, state and mode it draws. */
export function frameContext(path: readonly EventTarget[]): (ConsoleContext & { design: string }) | undefined {
  for (const target of path) {
    const dataset = (target as Partial<HTMLElement>).dataset
    if (dataset?.frame === undefined || !dataset.design) continue
    return {
      design: dataset.design,
      ...(dataset.state ? { state: dataset.state } : {}),
      ...(dataset.mode ? { mode: dataset.mode } : {})
    }
  }
  return undefined
}

/** What the capture needs of the window: its console, its events, and a timer. */
export interface CaptureTarget {
  console: Record<Method, (...args: unknown[]) => void>
  addEventListener(type: string, listener: (event: Event) => void, options: AddEventListenerOptions): void
  setTimeout(run: () => void, wait: number): unknown
}

/** Starts saying which frame each message comes from, for the rest of the window's life. */
export function captureConsole(
  host: Pick<ConsoleHost, "announce">,
  target: CaptureTarget = {
    console,
    addEventListener: (type, listener, options) => window.addEventListener(type, listener, options),
    setTimeout: (run, wait) => window.setTimeout(run, wait)
  }
): void {
  let context: (ConsoleContext & { design: string }) | undefined
  let wrapped: Partial<Record<Method, (...args: unknown[]) => void>> | undefined
  const unwrap = () => {
    for (const method of Object.keys(levels) as Method[]) {
      const wrapper = wrapped?.[method]
      // Something that wrapped the console after this did keeps its wrapper.
      if (wrapper && target.console[method] === wrapper) target.console[method] = originals[method]!
    }
    wrapped = undefined
    context = undefined
  }
  const originals: Partial<Record<Method, (...args: unknown[]) => void>> = {}
  const wrap = () => {
    if (wrapped) return
    wrapped = {}
    for (const [method, level] of Object.entries(levels) as [Method, ConsoleEntry["level"]][]) {
      const original = target.console[method]
      originals[method] = original
      const wrapper = (...args: unknown[]) => {
        if (context) host.announce(level, context)
        original.apply(target.console, args)
      }
      wrapped[method] = wrapper
      target.console[method] = wrapper
    }
    // Once the task the event started is done, with the microtasks and render it queued.
    target.setTimeout(unwrap, 0)
  }
  const listen = (event: Event) => {
    const found = frameContext(event.composedPath())
    if (!found) return
    context = found
    wrap()
  }
  for (const type of interactions) target.addEventListener(type, listen, { capture: true, passive: true })
}
