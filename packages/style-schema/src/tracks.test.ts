import { describe, expect, it } from "vite-plus/test"
import { readTrackSize, type TrackSize, trackSizeCss } from "./tracks.ts"

describe("readTrackSize", () => {
  it("reads each of CSS's track sizes", () => {
    expect(readTrackSize("2fr")).toEqual({ kind: "fr", value: 2 })
    expect(readTrackSize("200px")).toEqual({ kind: "px", value: 200 })
    expect(readTrackSize("200")).toEqual({ kind: "px", value: 200 })
    expect(readTrackSize("12.5rem")).toEqual({ kind: "px", value: 200 })
    expect(readTrackSize("50 %")).toEqual({ kind: "percent", value: 50 })
    expect(readTrackSize("Auto")).toEqual({ kind: "auto" })
    expect(readTrackSize("min-content")).toEqual({ kind: "min" })
    expect(readTrackSize("max-content")).toEqual({ kind: "max" })
    expect(readTrackSize("minmax(120px, 1fr)")).toEqual({ kind: "range", min: 120, max: 1 })
  })

  it("reads a share below a quarter as a quarter", () => {
    expect(readTrackSize("0fr")).toEqual({ kind: "fr", value: 0.25 })
  })

  it("can't read anything else", () => {
    expect(readTrackSize("fit-content(10px)")).toMatchObject({ code: "unreadable" })
  })
})

describe("trackSizeCss", () => {
  it("writes a share so content can't widen it", () => {
    expect(trackSizeCss({ kind: "fr", value: 1 })).toBe("minmax(0, 1fr)")
  })

  it("reads back what it writes", () => {
    const tracks: TrackSize[] = [
      { kind: "px", value: 200 },
      { kind: "percent", value: 25 },
      { kind: "auto" },
      { kind: "min" },
      { kind: "max" },
      { kind: "range", min: 120, max: 2 }
    ]

    for (const track of tracks) {
      expect(readTrackSize(trackSizeCss(track))).toEqual(track)
    }
  })
})
