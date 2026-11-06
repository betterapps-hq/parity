import { describe, expect, it } from "vite-plus/test"
import type { PreviewImage } from "../../shared/protocol.ts"
import { isProblem, previewStatus } from "./preview-status.ts"

const image: PreviewImage = { thumb: "thumb.png", large: "large.png", width: 200, height: 80 }

describe("previewStatus", () => {
  it("waits, draws and shows a made picture", () => {
    expect(previewStatus(undefined)).toEqual({ kind: "waiting" })
    expect(previewStatus({ state: "waiting" })).toEqual({ kind: "waiting" })
    expect(previewStatus({ state: "making" })).toEqual({ kind: "making" })
    expect(previewStatus({ state: "made", image })).toEqual({ kind: "made", image })
  })

  it("shows the last picture as updating while one for new code waits or is drawn", () => {
    expect(previewStatus({ state: "waiting", last: image })).toEqual({ kind: "updating", image, making: false })
    expect(previewStatus({ state: "making", last: image })).toEqual({ kind: "updating", image, making: true })
  })

  it("says why there's no picture", () => {
    expect(previewStatus({ state: "failed", error: "Boom" })).toEqual({ kind: "failed", error: "Boom" })
    expect(previewStatus({ state: "failed", error: "useTheme must be used within a ThemeProvider" })).toMatchObject({
      kind: "needs-provider"
    })
    expect(previewStatus({ state: "failed", error: "Buffer is not defined" })).toMatchObject({ kind: "server-only" })
    expect(previewStatus({ state: "failed", error: "Cannot read 'map'" }, ["items"])).toEqual({
      kind: "needs-props",
      error: "Cannot read 'map'",
      needs: ["items"]
    })
    expect(previewStatus({ state: "empty" }, ["src"])).toEqual({ kind: "needs-props", needs: ["src"] })
    expect(previewStatus({ state: "empty" })).toEqual({ kind: "draws-nothing" })
  })

  it("counts only what's wrong with the component as a problem", () => {
    expect(isProblem(previewStatus({ state: "waiting", last: image }))).toBe(false)
    expect(isProblem(previewStatus({ state: "empty" }))).toBe(true)
  })
})
