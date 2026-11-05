import { z } from "zod"
import { checkModel } from "./check.ts"
import { uniqueIds } from "./unique.ts"

// Scenarios: a name, its data and the design state it fills, such as "Empty", "Very long" or "Server error". Designs
// show the data through bindings, and running code gets the same responses from mock handlers.

export const ScenarioResponse = z.strictObject({
  /** The HTTP status. Unset means success. */
  status: z.int().min(100).max(599).optional(),
  /** What the operation returns, matching its output or error schema. */
  body: z.unknown()
})

export const Scenario = z.strictObject({
  /** Unique within the model. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** The id of the design state it fills. Unset until a person attaches it to one. */
  state: z.string().min(1).optional(),
  /** Each operation's response in this scenario, by operation id. */
  responses: z.record(z.string().min(1), ScenarioResponse)
})

export const Scenarios = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    scenarios: z.array(Scenario)
  })
  .superRefine((model, context) => uniqueIds(model.scenarios, ["scenarios"], context))

export type ScenarioResponse = z.infer<typeof ScenarioResponse>
export type Scenario = z.infer<typeof Scenario>
export type Scenarios = z.infer<typeof Scenarios>

export function parseScenarios(value: unknown): Scenarios {
  return checkModel(Scenarios, value)
}
