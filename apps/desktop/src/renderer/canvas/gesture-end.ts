/**
 * How a pointer gesture on the canvas ended: the pointer released, Escape pressed, or cut short, by the pointer being
 * cancelled or the window losing focus, after which no release comes.
 */
type GestureEnd = "release" | "escape" | "interrupted"

/**
 * Calls `onEnd` once, the first way the pointer gesture under way ends (see `GestureEnd`), and stops listening for the
 * others then, so nothing is left listening whichever way it ends. Escape goes no further than the gesture. `target`
 * is the window. Returns a function that stops listening without calling `onEnd`.
 */
export function onGestureEnd(target: EventTarget, onEnd: (how: GestureEnd) => void): () => void {
  const capture = { capture: true }
  const stop = () => {
    target.removeEventListener("pointerup", release, capture)
    target.removeEventListener("pointercancel", interrupt, capture)
    target.removeEventListener("blur", interrupt)
    target.removeEventListener("keydown", key, capture)
  }
  const end = (how: GestureEnd) => {
    stop()
    onEnd(how)
  }
  const release = () => end("release")
  const interrupt = () => end("interrupted")
  const key = (event: Event) => {
    if (!("key" in event) || event.key !== "Escape") return
    event.preventDefault()
    event.stopImmediatePropagation()
    end("escape")
  }
  target.addEventListener("pointerup", release, capture)
  target.addEventListener("pointercancel", interrupt, capture)
  // Not capturing, so it's the window's own focus going, not a field's inside it.
  target.addEventListener("blur", interrupt)
  target.addEventListener("keydown", key, capture)
  return stop
}
