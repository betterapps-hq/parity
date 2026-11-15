import { type Selection, selectedNodes, selectedPreviews } from "./selection.ts"

/** Something on the canvas that an outline goes round. */
export type OutlineTarget =
  | { kind: "design"; design: string }
  | { kind: "preview"; design: string; preview: string }
  | { kind: "layer"; design: string; node: string }
  | { kind: "note"; note: string }
  | { kind: "reference"; reference: string }

/** An outline: what it goes round, and whether that's hovered rather than selected. */
export interface Outline {
  target: OutlineTarget
  hovered: boolean
}

/**
 * The outlines the canvas draws (PAR-1118). Each goes round one thing and takes that thing's own color, which the app
 * picks from the target's kind. Selecting or hovering something never outlines what it's inside: with a layer
 * selected, its board has no outline, and with previews selected, only their rings show. What's hovered is outlined
 * too, unless it's selected already. A board that holds the selection, itself or a layer or preview in it, has no hover
 * outline.
 */
export function canvasOutlines(selection: Selection, hovered?: OutlineTarget): Outline[] {
  const selected = selectedTargets(selection).map((target) => ({ target, hovered: false }))
  const holdsSelection = hovered?.kind === "design" && hovered.design === selection.design

  if (hovered && !holdsSelection && !selected.some((outline) => sameTarget(outline.target, hovered))) {
    selected.push({ target: hovered, hovered: true })
  }

  return selected
}

/** What's selected, each the thing itself rather than what it's in. */
function selectedTargets(selection: Selection): OutlineTarget[] {
  const { design } = selection

  if (selection.note) {
    return [{ kind: "note", note: selection.note }]
  }

  if (selection.reference) {
    return [{ kind: "reference", reference: selection.reference }]
  }

  if (design !== undefined && selection.node) {
    return selectedNodes(selection).map((node) => ({ kind: "layer", design, node }))
  }

  if (design !== undefined && selection.mode !== undefined) {
    return selectedPreviews(selection).map((preview) => ({ kind: "preview", design, preview }))
  }

  return (selection.designs ?? (design === undefined ? [] : [design])).map((key) => ({ kind: "design", design: key }))
}

/** Whether two targets are the same thing. */
export function sameTarget(a: OutlineTarget, b: OutlineTarget): boolean {
  return outlineKey(a) === outlineKey(b)
}

/** A target as a string, the same for the same thing. */
export function outlineKey(target: OutlineTarget): string {
  switch (target.kind) {
    case "design":
      return `design:${target.design}`
    case "preview":
      return `preview:${target.design}:${target.preview}`
    case "layer":
      return `layer:${target.design}:${target.node}`
    case "note":
      return `note:${target.note}`
    case "reference":
      return `reference:${target.reference}`
  }
}
