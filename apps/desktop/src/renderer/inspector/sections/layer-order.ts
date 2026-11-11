import { isNamedLength, type NodeStyle } from "@parity-app/core"
import type { StackingContext } from "@parity-app/editor"
import { defaultValues, previewKind, type Token } from "@parity-app/tokens"
import { comesTo } from "../../token-values.ts"
import type { Side } from "../controls/sides-writes.ts"
import type { LengthToken } from "../controls/tokens.ts"

/** The project's z-index tokens as Layer order offers them, a count each, in the order they stack. */
export function projectZIndexTokens(tokens: readonly Token[]): LengthToken[] {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const lookup = defaultValues(tokens)

  const found = tokens.flatMap((token): LengthToken[] => {
    if (previewKind(token, undefined, lookup) !== "z-index") {
      return []
    }

    const order = Number(comesTo(byName, token.name))

    return Number.isInteger(order)
      ? [{ name: token.name, kind: "z-index", value: String(order), detail: String(order), px: order }]
      : []
  })

  return found.toSorted((one, other) => one.px - other.px)
}

/** A layer order as the field shows it: a number, a token, or unset for Auto. */
export function layerOrderSide(zIndex: NodeStyle["zIndex"]): Side {
  if (zIndex === undefined) {
    return undefined
  }

  return isNamedLength(zIndex) ? { token: zIndex } : { number: zIndex }
}

/** What the field's value stores: a whole number, a token's name, or nothing for Auto. */
export function zIndexOf(side: Side): NodeStyle["zIndex"] {
  if (side === undefined || side === "auto" || "percent" in side) {
    return undefined
  }

  return "token" in side ? side.token : Math.round(side.number)
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
