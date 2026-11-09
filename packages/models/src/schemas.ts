import { z } from "zod"
import { Links } from "./links.ts"
import { Operations } from "./operations.ts"
import { Routes } from "./routes.ts"
import { Scenarios } from "./scenarios.ts"
import { Tables } from "./tables.ts"

/**
 * Each lens model with its version. A change that would reject a document the current version accepts gets a new
 * version; the snapshots in schemas.test.ts show any change to a version's JSON Schema.
 */
export const lensModels = {
  tables: { version: 1, schema: Tables },
  operations: { version: 1, schema: Operations },
  routes: { version: 1, schema: Routes },
  scenarios: { version: 1, schema: Scenarios },
  links: { version: 1, schema: Links }
} as const

export type LensModelName = keyof typeof lensModels

/**
 * A model's JSON Schema, for adapters and agents to target. It's private: the `urn:parity:` id names it without
 * publishing it anywhere, until the models are opened up.
 */
export function lensModelJsonSchema(name: LensModelName): Record<string, unknown> {
  const { version, schema } = lensModels[name]
  // `input`, so fields with defaults or transforms describe what a document may hold rather than what parsing returns.
  const { $schema, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })

  return { $schema, $id: `urn:parity:model:${name}:${version}`, ...rest }
}
