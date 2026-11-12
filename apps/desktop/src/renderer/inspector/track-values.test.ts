import { describe, expect, it } from "vite-plus/test"
import { tracksOfCount } from "./track-values.ts"

describe("a grid's tracks from the count the Tracks row takes", () => {
  it("are that many Fill tracks", () => {
    expect(tracksOfCount(3, undefined)).toEqual([{ fr: 1 }, { fr: 1 }, { fr: 1 }])
    expect(tracksOfCount(1, [{ fr: 1 }, { fr: 1 }])).toEqual([{ fr: 1 }])
  })

  it("keep the tracks that have a length of their own, adding and dropping Fill tracks at the end", () => {
    const tracks = [{ value: "240px" }, { fr: 2 }]

    expect(tracksOfCount(4, tracks)).toEqual([{ value: "240px" }, { fr: 2 }, { fr: 1 }, { fr: 1 }])
    expect(tracksOfCount(2, tracks)).toEqual(tracks)
    expect(tracksOfCount(1, tracks)).toEqual([{ value: "240px" }])
  })

  it("are unset for no count", () => {
    expect(tracksOfCount(undefined, [{ fr: 1 }])).toBeUndefined()
  })
})
