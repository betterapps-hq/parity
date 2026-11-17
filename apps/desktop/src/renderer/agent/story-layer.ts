import { type CanvasLayerContextValue, createFrameLoop } from "@parity-app/canvas-layer"
import type { NodeRef } from "@parity-app/extension"
import type { BoxOptions, BoxResult, WindowColors } from "@parity-app/extension/internal"
import type { Colors } from "@parity-app/presence-colors"
import { agentColors, personColors } from "../canvas/surface/colors.ts"

/*
 * A canvas layer for stories that draw agent presence over mock boards instead of the real canvas: the camera at 100%
 * over the stage, and boxes measured from the stage's elements as the canvas's measuring service measures its own
 * (`canvas/surface/measure-dom.ts`): `.container-view` boards, `[data-frame]` frames, and `data-canvas-node` nodes in
 * each frame's shadow root.
 */

const owner = "agent-presence-story"

function listOf(core: Colors) {
  return {
    claim: (key: string) => core.claim(key, owner),
    release: (key: string) => core.release(key, owner),
    assign: (key: string, n: number) => core.assign(key, n),
    palette: (n: number) => core.palette(n),
    get tuned() {
      return core.tuned
    }
  }
}

/** A layer over the stage marked `data-agent-stage` with `id`, whose top left is the page's origin. */
export function storyLayer(id: string): CanvasLayerContextValue {
  const stage = () => document.querySelector<HTMLElement>(`[data-agent-stage="${CSS.escape(id)}"]`)
  const colors: WindowColors = Object.assign(listOf(personColors), { agents: listOf(agentColors) })
  const frames = createFrameLoop()

  const box = (ref: NodeRef, options: BoxOptions = {}): BoxResult => {
    const root = stage()
    const slash = ref.type === "design" ? -1 : ref.key.indexOf("/")
    const design = slash > 0 ? ref.key.slice(0, slash) : ref.key
    const board = root?.querySelector<HTMLElement>(`.container-view[data-design="${CSS.escape(design)}"]`)

    if (!root || !board) {
      return { kind: "missing" }
    }

    const origin = root.getBoundingClientRect()

    const drawn = (element: HTMLElement): BoxResult => {
      const rect = element.getBoundingClientRect()

      return {
        kind: "drawn",
        box: { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height },
        radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
        size: { width: element.offsetWidth, height: element.offsetHeight }
      }
    }

    if (options.in === "board") {
      return drawn(board)
    }

    const frame = board.querySelector<HTMLElement>("[data-frame]")

    if (!frame) {
      return { kind: "missing" }
    }

    if (options.in === "node" && slash > 0) {
      const node = frame.shadowRoot?.querySelector<HTMLElement>(
        `[data-canvas-node="${CSS.escape(ref.key.slice(slash + 1))}"]`
      )

      return node ? drawn(node) : { kind: "missing" }
    }

    return drawn(frame)
  }

  return {
    view: () => {
      const root = stage()

      return { zoom: 1, view: { x: 0, y: 0, width: root?.clientWidth ?? 0, height: root?.clientHeight ?? 0 } }
    },
    onView: () => ({ dispose: () => undefined }),
    box,
    onBoxChange: () => ({ dispose: () => undefined }),
    colors,
    color: (key, list) => {
      const core = list === "agents" ? agentColors : personColors
      const palette = core.claim(key, "agent-presence-story:peek")
      core.release(key, "agent-presence-story:peek")

      return palette
    },
    frame: (frame) => frames.add(frame, (error) => console.error(error))
  }
}
