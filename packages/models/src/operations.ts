import { z } from "zod"
import { modelParser } from "./check.ts"
import { uniqueIds } from "./unique.ts"

// The API lens's model: a list of operations, each with an input and output in JSON Schema, and a method and path when
// it's HTTP. It can always be written out as OpenAPI 3.2, so nothing is lost by using it.

/** A JSON Schema, kept as written. The lens reads it; this model doesn't check it. */
export const JsonSchema = z.union([z.boolean(), z.record(z.string(), z.unknown())])

/** OpenAPI 3.2's methods, which add `query` to HTTP's. */
export const HttpMethod = z.enum(["get", "put", "post", "delete", "options", "head", "patch", "trace", "query"])

const status = z.int().min(100).max(599)

export const OperationError = z.strictObject({
  /** The HTTP status. Unset for an operation that isn't HTTP. */
  status: status.optional(),
  description: z.string().optional(),
  schema: JsonSchema.optional()
})

export const Operation = z.strictObject({
  /** Unique within the model, as OpenAPI's `operationId`. */
  id: z.string().min(1),
  summary: z.string().optional(),
  description: z.string().optional(),
  /** Unset for a server function or anything else called without a URL. */
  http: z
    .strictObject({
      method: HttpMethod,
      /** An OpenAPI path template, such as `/users/{id}`. */
      path: z.string().startsWith("/")
    })
    .optional(),
  input: JsonSchema.optional(),
  output: JsonSchema.optional(),
  errors: z.array(OperationError).optional(),
  /** `x-` fields, as OpenAPI allows. A server function is marked with one. */
  extensions: z.record(z.string().regex(/^x-/, "expected a name starting with x-"), z.unknown()).optional()
})

export const Operations = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    operations: z.array(Operation)
  })
  .superRefine((model, context) => uniqueIds(model.operations, ["operations"], context))

export type JsonSchema = z.infer<typeof JsonSchema>

export type HttpMethod = z.infer<typeof HttpMethod>

export type OperationError = z.infer<typeof OperationError>

export type Operation = z.infer<typeof Operation>

export type Operations = z.infer<typeof Operations>

export const parseOperations = modelParser(Operations)
