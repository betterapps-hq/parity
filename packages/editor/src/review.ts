/*
 * Reviewing on the canvas (PAR-795): the toolbar's review button picks Comment, or annotating in one of the kinds of
 * annotation. While one is picked the canvas stays on Move and select, so a click can't draw a frame or add text
 * underneath, and putting it down goes back to the tool picked before. Placing comments and annotations is PAR-372's and
 * PAR-184's.
 */

/** The kinds of annotation, in the order the review menu lists them. */
export const annotationKinds = ["behaviour", "content", "accessibility", "development"] as const

export type AnnotationKind = (typeof annotationKinds)[number]

/** What the review button picks: Comment, or annotating in one of the kinds. */
export type ReviewTool = "comment" | AnnotationKind

const reviewTools: readonly string[] = ["comment", ...annotationKinds]

export function isReviewTool(value: string): value is ReviewTool {
  return reviewTools.includes(value)
}

/**
 * Reviewing in one tab. `picked` is the review tool in use, if one is. `shown` is the one the review button shows, the
 * last picked, and `kind` the kind Shift+T annotates in, the last kind picked. `before` is the canvas's tool when the
 * first review tool was picked, to go back to.
 */
export interface Review<Tool extends string> {
  picked?: ReviewTool
  shown: ReviewTool
  kind: AnnotationKind
  before?: Tool
}

/** A tab before anything's reviewed: the button shows Comment, and Shift+T annotates behaviour. */
export function startReview<Tool extends string>(): Review<Tool> {
  return { shown: "comment", kind: "behaviour" }
}

/** Picks a review tool while `current` is the canvas's tool. Picking another while reviewing keeps the tool from before. */
export function pickReview<Tool extends string>(review: Review<Tool>, tool: ReviewTool, current: Tool): Review<Tool> {
  return {
    picked: tool,
    shown: tool,
    kind: tool === "comment" ? review.kind : tool,
    before: review.picked ? review.before : current
  }
}

/** Puts the review tool down. The button still shows it, and Shift+T still annotates in the same kind. */
export function stopReview<Tool extends string>(review: Review<Tool>): Review<Tool> {
  return { shown: review.shown, kind: review.kind }
}

/** The review tool a key picks: C comments, and Shift+T annotates in the kind picked last. */
export function reviewToolFor(review: Review<string>, key: "comment" | "annotate"): ReviewTool {
  return key === "comment" ? "comment" : review.kind
}
