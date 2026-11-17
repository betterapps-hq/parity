/*
 * What a styles provider uses to write a stylesheet and compare declarations, from `@parity-app/extension/styles`:
 * the same code Parity writes token values with when a project has no styles extension, so the two agree.
 */

export {
  comparableValue,
  type Condition,
  type Printed,
  type ReadBack,
  sameCondition,
  type StylePrinter
} from "@parity-app/style-schema"

export { type SetPropertyOptions, writeCustomProperty, writeTokenChanges } from "@parity-app/tokens"
