import type { Disposable, NodeRef } from "@parity-app/extension"
import type { BoxOptions, BoxResult, ColorKey, Palette, Rect, WindowColors } from "@parity-app/extension/internal"
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { Frame } from "./frame-loop.ts"

/**
 * What a canvas layer gives what's drawn in it: its extension's camera, boxes and colors, and the tab's frames. Parity
 * provides it round each layer (`parity.canvas.layer`); the hooks below read it.
 */
export interface CanvasLayerContextValue {
  /** The camera now, and its zoom. */
  view(): { zoom: number; view: Rect }
  /** Told when the camera changes, at most once a frame. */
  onView(listener: () => void): Disposable
  box(ref: NodeRef, options?: BoxOptions): BoxResult
  onBoxChange(ref: NodeRef, listener: (box: BoxResult) => void, options?: BoxOptions): Disposable
  colors: WindowColors
  /** The palette `key` holds now, or would be given, without claiming it. */
  color(key: ColorKey, list: "people" | "agents"): Palette
  /** Runs `frame` once an animation frame, while the tab is shown, until the function it gives is called. */
  frame(frame: Frame): () => void
}

export const CanvasLayerContext = createContext<CanvasLayerContextValue | undefined>(undefined)

function useLayer(hook: string): CanvasLayerContextValue {
  const layer = useContext(CanvasLayerContext)

  if (!layer) {
    throw new Error(`${hook} reads a canvas layer, so it only works inside what parity.canvas.layer draws`)
  }

  return layer
}

/** Something a hook reads, as `useSyncExternalStore` takes it. */
interface Store<T> {
  subscribe: (changed: () => void) => () => void
  get: () => T
}

function cameraStore(layer: CanvasLayerContextValue): Store<{ zoom: number; view: Rect }> {
  let last: { zoom: number; view: Rect } | undefined

  return {
    subscribe(changed) {
      const listening = layer.onView(changed)

      return () => listening.dispose()
    },
    get() {
      const next = layer.view()

      // The same camera reads as the same value, so nothing draws again for it.
      if (last && last.zoom === next.zoom && sameRect(last.view, next.view)) {
        return last
      }

      last = next

      return next
    }
  }
}

/** The camera now: its zoom, and what's in view. Re-renders at most once a frame. */
export function useCamera(): { zoom: number; view: Rect } {
  const layer = useLayer("useCamera")
  const store = useMemo(() => cameraStore(layer), [layer])

  return useSyncExternalStore(store.subscribe, store.get)
}

function boxStore(layer: CanvasLayerContextValue, key: string): Store<BoxResult> {
  // SAFETY: `key` is `useBox`'s own JSON of the ref and options it was given.
  const [ref, options] = JSON.parse(key) as [NodeRef, BoxOptions | null]
  const given = options ?? undefined
  let last: { json: string; box: BoxResult } | undefined

  return {
    subscribe(changed) {
      const listening = layer.onBoxChange(ref, changed, given)

      return () => listening.dispose()
    },
    get() {
      const box = layer.box(ref, given)
      const json = JSON.stringify(box)

      if (last?.json === json) {
        return last.box
      }

      last = { json, box }

      return box
    }
  }
}

/** A box, re-rendering as it changes. */
export function useBox(ref: NodeRef, options?: BoxOptions): BoxResult {
  const layer = useLayer("useBox")
  // Callers often make `ref` and `options` anew each render, so they're compared as JSON.
  const key = JSON.stringify([ref, options ?? null])
  const store = useMemo(() => boxStore(layer, key), [layer, key])

  return useSyncExternalStore(store.subscribe, store.get)
}

function colorStore(layer: CanvasLayerContextValue, key: ColorKey, list: "people" | "agents"): Store<Palette> {
  const colors = list === "agents" ? layer.colors.agents : layer.colors
  let last: Palette | undefined

  return {
    // Claimed while mounted. Once it's claimed, the palette is read again, so a key another layer took first moves on.
    subscribe() {
      colors.claim(key)

      return () => colors.release(key)
    },
    get() {
      const next = layer.color(key, list)

      if (last?.n === next.n) {
        return last
      }

      last = next

      return next
    }
  }
}

/**
 * A color, by key, claimed for this tab while mounted: people's by default, or agents' with `list: "agents"`. The
 * claim counts against the layer's extension.
 */
export function useColor(key: ColorKey, list: "people" | "agents" = "people"): Palette {
  const layer = useLayer("useColor")
  const store = useMemo(() => colorStore(layer, key, list), [layer, key, list])

  return useSyncExternalStore(store.subscribe, store.get)
}

/**
 * Runs once per animation frame while mounted and the tab is shown: `measure` reads layout first, then `draw` writes.
 * For anything that moves every frame, write a transform in `draw` instead of re-rendering. The latest `frame` given
 * is the one run.
 */
export function useFrame(frame: Frame): void {
  const layer = useLayer("useFrame")
  const latest = useRef(frame)

  useEffect(() => {
    latest.current = frame
  })

  useEffect(
    () =>
      layer.frame({
        measure: () => latest.current.measure?.(),
        draw: (dt) => latest.current.draw(dt)
      }),
    [layer]
  )
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
