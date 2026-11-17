import { frameName, pageProtocol } from "@parity-app/page-runtime/protocol"
import { describe, expect, it, vi } from "vite-plus/test"
import { type FrameNavigation, pageFrameGuard, type StoppedFrame } from "./page-frames.ts"

const page = "http://p0123456789abcdef.localhost:5173/pricing"
const name = frameName({ protocol: pageProtocol, frame: "live-1", parent: "parity://app", role: "live" })

function navigation(
  url: string,
  frame: FrameNavigation["frame"] = { url: page, name },
  isMainFrame = false
): FrameNavigation & { refused: boolean } {
  return {
    url,
    isMainFrame,
    frame,
    refused: false,
    preventDefault() {
      this.refused = true
    }
  }
}

describe("pageFrameGuard", () => {
  it("stops a route frame leaving its page's origin, and says where it tried to go", () => {
    const stopped = vi.fn<(stop: StoppedFrame) => void>()
    const away = navigation("https://accounts.example.com/sign-in")
    pageFrameGuard(stopped)(away)

    expect(away.refused).toBe(true)
    expect(stopped).toHaveBeenCalledWith({ frame: "live-1", url: "https://accounts.example.com/sign-in" })
  })

  it("lets a route frame move on its own origin", () => {
    const stopped = vi.fn<(stop: StoppedFrame) => void>()
    const link = navigation("http://p0123456789abcdef.localhost:5173/settings")
    pageFrameGuard(stopped)(link)

    expect(link.refused).toBe(false)
    expect(stopped).not.toHaveBeenCalled()
  })

  it("leaves the window, frames loading their first page and the app's own embeds alone", () => {
    const guard = pageFrameGuard(() => undefined)
    const window = navigation("https://example.com/", { url: page, name }, true)
    const loading = navigation(page, { url: "about:blank", name })
    const embed = navigation("https://www.youtube.com/watch?v=1", { url: "https://www.youtube.com/embed/1", name: "" })

    for (const each of [window, loading, embed]) {
      guard(each)
      expect(each.refused).toBe(false)
    }
  })
})
