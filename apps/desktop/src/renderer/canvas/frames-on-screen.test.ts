import { describe, expect, it, vi } from "vite-plus/test"
import {
  bitmapAttachment,
  failedRender,
  type FrameOnScreen,
  framesAttachment,
  onFailedRender
} from "./frames-on-screen.ts"

const frame = (changes: Partial<FrameOnScreen> = {}): FrameOnScreen => ({
  project: "shop",
  design: "Settings",
  designKey: "designs/settings.parity.json#settings",
  state: "Default",
  stateId: "default",
  mode: "Mobile Light",
  modeId: "mobile-light",
  width: 390,
  key: "settings-1",
  ...changes
})

describe("frames on screen", () => {
  it("lists the frames for an event without their keys, saying which have a bitmap without sending it", () => {
    const { filename, contentType, data } = framesAttachment([
      frame({ bitmap: "data:image/webp;base64,AAAA" }),
      frame({ modeId: "desktop", mode: "Desktop", width: 1280, height: 800 })
    ])
    expect({ filename, contentType }).toEqual({ filename: "frames.json", contentType: "application/json" })
    expect(JSON.parse(data as string)).toEqual([
      expect.objectContaining({ mode: "Mobile Light", bitmap: true }),
      expect.objectContaining({ mode: "Desktop", width: 1280, height: 800, bitmap: false })
    ])
    expect(data).not.toContain("settings-1")
  })

  it("sends the bitmap of the frame whose render failed, as the bytes of its WebP", () => {
    const frames = [
      frame({ modeId: "desktop", bitmap: "data:image/webp;base64,AAAA" }),
      frame({ bitmap: "data:image/webp;base64,UklG" })
    ]
    const drawn = { key: "designs/settings.parity.json#settings", state: "default", mode: "mobile-light" }
    expect(bitmapAttachment(frames, drawn)).toEqual({
      filename: "frame.webp",
      contentType: "image/webp",
      data: Uint8Array.from([0x52, 0x49, 0x46])
    })
  })

  it("sends no bitmap for a frame that has shown none or isn't on the canvas", () => {
    const drawn = { key: "designs/settings.parity.json#settings", state: "default", mode: "mobile-light" }
    expect(bitmapAttachment([frame()], drawn)).toBeUndefined()
    expect(bitmapAttachment([frame({ bitmap: "data:image/webp;base64,AAAA" })], { ...drawn, mode: "tablet" })).toBe(
      undefined
    )
  })

  it("reports a render that keeps failing once for what it shows", () => {
    const listener = vi.fn<(error: unknown) => void>()
    const stop = onFailedRender(listener)
    const drawn = { key: "designs/settings.parity.json#settings" }
    failedRender("shows-1", new Error("timed out"), drawn)
    failedRender("shows-1", new Error("timed out again"), drawn)
    failedRender("shows-2", new Error("timed out"), drawn)
    failedRender("component-preview", new Error("timed out"), undefined)
    stop()
    expect(listener.mock.calls.map(([error]) => (error as Error).message)).toEqual(["timed out", "timed out"])
  })
})
