import type { Disposable } from "@parity-app/extension"
import { defineWindowModule, type Following, type Palette, type Preview } from "@parity-app/extension/internal"

/*
 * A second internal extension for tests, never shipped in the app: a window module with no Node half that draws on the
 * canvas. As it activates it draws a layer under the designs and one at the canvas's edge, claims a person's color,
 * and listens to this person's presence and to agents' activity; what it offers other window modules follows, previews
 * and holds, as the multiplayer and agent presence extensions will.
 */

export const surfaceTestId = "@parity-app/extension-surface-test"

/** Its `package.json`, as `readExtension` takes it with `{ builtIn: true }`. */
export const surfaceTestPackage = {
  name: surfaceTestId,
  version: "0.0.0",
  parity: {
    displayName: "Surface test",
    prefix: "stest",
    icon: { viewBox: "0 0 24 24", path: "M4 4h16v16H4z" },
    internal: true,
    window: "./window",
    detect: { always: true },
    activates: ["onStartup"],
    capabilities: ["canvas", "camera", "hold", "presence", "agents"],
    contributes: {}
  }
}

/** What a layer of it draws: a stand-in for what React renders, so these tests need no React. */
export interface SurfaceTestDrawing {
  draws: string
}

/** What it offers other window modules in the tab, for tests to drive it. */
export interface SurfaceTestApi {
  /** The palette it claimed for `peer-1` as it activated. */
  claimed: Palette
  /** What it has heard of presence and agents, in order, as `pointer 10,20`, `gesture move start` or `agents read`. */
  heard: string[]
  follow(): Following
  previewBoard(design: string, color: string): Preview
  hold(design: string): Disposable
}

export const surfaceTestModule = defineWindowModule<SurfaceTestApi>({
  activateWindow(parity) {
    const drawing = (draws: string): SurfaceTestDrawing => ({ draws })
    const heard: string[] = []

    parity.subscriptions.push(
      parity.canvas.layer({ id: "stest.shading", space: "page", order: "underDesigns" }, drawing("shading")),
      parity.canvas.layer(
        { id: "stest.people", space: "screen", order: "edge", placement: "topRight" },
        drawing("people")
      ),
      parity.presence.onPointer(({ at, over }) => heard.push(over ? `pointer ${at.x},${at.y}` : "pointer away")),
      parity.presence.onGesture((gesture) => heard.push(`gesture ${gesture.kind} ${gesture.phase}`)),
      parity.presence.onViewing((viewing) => heard.push(`viewing ${viewing.design ?? "nothing"}`)),
      parity.agents.onActivity((steps, from) =>
        heard.push(`agents ${steps.map((step) => step.kind).join(" ")}${from === undefined ? "" : ` from ${from}`}`)
      )
    )

    return {
      window: {
        claimed: parity.colors.claim("peer-1"),
        heard,
        follow: () => parity.camera.follow({ x: 0, y: 0, width: 800, height: 600 }),
        previewBoard: (design, color) =>
          parity.canvas.preview([{ ref: { owner: "design", type: "design", key: design }, at: { x: 40, y: 40 } }], {
            color
          }),
        hold: (design) => parity.canvas.hold(design, { x: 10, y: 10 })
      }
    }
  }
})
