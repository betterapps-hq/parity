import type { Connector } from "./connector.ts"
import { mobbin } from "./mobbin.ts"

export * from "./connector.ts"

export { mobbin } from "./mobbin.ts"

/** Every connector Parity has, in the order the app lists them. Unsplash joins here (PAR-131). */
export const connectors: readonly Connector[] = [mobbin]
