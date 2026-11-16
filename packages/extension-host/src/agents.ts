import type { AgentToolContribution, Fact, JsonSchema, JsonValue } from "@parity-app/extension"
import { z } from "zod"
import type { ExtensionStatus, HostState } from "./hosts.ts"

/*
 * What agents see of a project's extensions through the agent API (PAR-1096): each extension found in the project, with
 * its commands, agent tools, node types and facts, so the same feature works by hand or by asking. An agent runs a
 * command or a tool by its id, and the tool's input is checked against the schema its manifest gives.
 */

/** An extension as an agent reads it. */
export interface AgentExtension {
  id: string
  name: string
  state: HostState
  /** Why it's stuck or crashed. */
  reason?: string
  commands: { id: string; title: string; note?: string }[]
  tools: { name: string; description: string; input: JsonSchema }[]
  nodeTypes: { id: string; name: string }[]
  /** Its facts about components, by component. */
  facts: { component: string; facts: Fact[] }[]
}

/** A project's extensions as agents read them, from what its window is sent. */
export function agentExtensions(extensions: ExtensionStatus[]): AgentExtension[] {
  return extensions.map((extension) => {
    const { contributes } = extension

    const found: AgentExtension = {
      id: extension.id,
      name: extension.displayName,
      state: extension.state,
      commands: (contributes.commands ?? []).map(({ id, title, note }) =>
        note === undefined ? { id, title } : { id, title, note }
      ),
      tools: (contributes.agentTools ?? []).map(({ name, description, input }) => ({
        name,
        description,
        input: toolSchema(input)
      })),
      nodeTypes: (contributes.nodeTypes ?? []).map(({ id, name }) => ({ id, name })),
      facts: Object.entries(extension.facts).map(([component, facts]) => ({ component, facts }))
    }

    if (extension.reason !== undefined) {
      found.reason = extension.reason
    }

    return found
  })
}

/** A tool's input schema as JSON, which it is already, typed as JSON Schema is. */
function toolSchema(input: AgentToolContribution["input"]): JsonSchema {
  const schema: JsonSchema = { type: "object" }

  if (input.properties) {
    schema.properties = input.properties
  }

  if (input.required) {
    schema.required = input.required
  }

  return schema
}

/**
 * Checks an agent's input to a tool against the schema its manifest gives, and gives it back as the tool's handler
 * gets it. Throws, saying what's wrong with which field, when it doesn't fit.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what an agent sent, read here
export function readToolInput(tool: AgentToolContribution, input: unknown): Record<string, JsonValue> {
  const schema = z.fromJSONSchema({ ...toolSchema(tool.input), additionalProperties: false })
  const fits = schema.safeParse(input ?? {})

  if (!fits.success) {
    const problems = fits.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message
    )

    throw new Error(`${tool.name}'s input doesn't fit its schema. ${problems.join("; ")}`)
  }

  return z.record(z.string(), z.json()).parse(fits.data)
}
