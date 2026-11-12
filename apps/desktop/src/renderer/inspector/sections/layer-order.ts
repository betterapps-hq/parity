import type { NodeStyle } from "@parity-app/core"
import type { StackingContext } from "@parity-app/editor"
import type { Side } from "../controls/sides-writes.ts"

/** A layer order as the field shows it: a number, a token, or unset for Auto. */
export function layerOrderSide(zIndex: NodeStyle["zIndex"]): Side {
  if (zIndex === undefined) {
    return undefined
  }

  return "token" in zIndex ? { token: zIndex.token } : { number: zIndex.step }
}

/** What the field's value stores: a whole number, a token, or nothing for Auto. */
export function zIndexOf(side: Side): NodeStyle["zIndex"] {
  if (side === undefined || side === "auto" || "percent" in side) {
    return undefined
  }

  return "token" in side ? { token: side.token } : { step: Math.round(side.number) }
}

const because: Record<StackingContext["because"], string> = {
  root: "the design's root",
  layerOrder: "a stacking context because it has a layer order",
  opacity: "a stacking context because it's see-through"
}

/** The stacking context the field's hint names, or its own when the layers are in different ones. */
export function stackingName(stacking: StackingContext | undefined): string {
  return stacking ? `${stacking.name}, ${because[stacking.because]}` : "its stacking context"
}
