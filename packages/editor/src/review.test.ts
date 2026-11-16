import { describe, expect, it } from "vite-plus/test"
import { isReviewTool, pickReview, reviewToolFor, startReview, stopReview } from "./review.ts"

type Tool = "select" | "frame" | "text"

describe("picking a review tool", () => {
  it("remembers the tool picked before, to go back to", () => {
    const review = pickReview(startReview<Tool>(), "content", "frame")

    expect(review).toEqual({ picked: "content", shown: "content", kind: "content", before: "frame" })
  })

  it("keeps the tool from before when another review tool is picked while reviewing", () => {
    const annotating = pickReview(startReview<Tool>(), "accessibility", "text")

    expect(pickReview(annotating, "comment", "select")).toEqual({
      picked: "comment",
      shown: "comment",
      kind: "accessibility",
      before: "text"
    })
  })
})

describe("putting a review tool down", () => {
  it("leaves the button showing it, with Shift+T still annotating in its kind", () => {
    const review = stopReview(pickReview(startReview<Tool>(), "development", "frame"))

    expect(review).toEqual({ shown: "development", kind: "development" })
  })
})

describe("the review keys", () => {
  it("comment with C, and annotate in the kind picked last with Shift+T", () => {
    const commented = stopReview(pickReview(pickReview(startReview<Tool>(), "content", "select"), "comment", "select"))

    expect(reviewToolFor(commented, "comment")).toBe("comment")
    expect(reviewToolFor(commented, "annotate")).toBe("content")
    expect(reviewToolFor(startReview<Tool>(), "annotate")).toBe("behaviour")
  })
})

describe("telling a review tool from a canvas tool", () => {
  it("knows Comment and the kinds of annotation, and nothing else", () => {
    expect(["comment", "behaviour", "content", "accessibility", "development"].every(isReviewTool)).toBe(true)
    expect(isReviewTool("select")).toBe(false)
    expect(isReviewTool("frame")).toBe(false)
  })
})
