import { createInterface } from "node:readline"
import { checkData, jsonText, plainObject } from "@parity-app/core/schema"
import { z } from "zod"
import { mcpCallerName } from "./caller.ts"
import {
  call,
  describeAccessibility,
  describeComponents,
  describeConsole,
  describeExec,
  describeModes,
  describeProblems,
  describeProps,
  describeStatus,
  describeTokens,
  setCaller
} from "./client.ts"
import { operationError, renamePath } from "./errors.ts"
import { executeOperation } from "./execute.ts"
import { type Operation, operations, skillOperation } from "./operations.ts"
import { readSkill } from "./skills.ts"

interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  /** The input fields an error's path can point at, in this tool's names. */
  fields: readonly string[]
  /** Renames the contract's fields to this tool's, in error paths. */
  names?: Record<string, string>
  /** Runs the tool on its arguments, which its contract checks. */
  run(input: unknown): Promise<Reply>
}
interface Reply {
  content: Content[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: "image/png" }

/**
 * One adapter for RPC-backed tools: operation contracts own defaults, validation, failure semantics and the structured
 * result, which is what CLI --json prints. The text beside it is for people and clients that don't read structure.
 *
 * Tools publish no outputSchema (PAR-510). Claude Code never shows one to the model, Codex's code mode puts it in the
 * model's context, and with them tools/list was 33 KB rather than 11. structuredContent needs no schema; the contracts
 * keep theirs, which the CLI checks the app's answers with.
 */
function operationTool<Result>(
  name: string,
  description: string,
  operation: Operation<Result>,
  format: (result: Result) => Content[]
): Tool {
  return {
    name,
    description,
    inputSchema: operation.inputSchema,
    fields: operation.fields,
    async run(input) {
      const result = await operation.run(input, call)
      return {
        content: format(result),
        structuredContent: operation.structured(result),
        isError: operation.failed(result)
      }
    }
  }
}
/** Results that are data to begin with, as compact JSON text for clients that don't read structuredContent. */
const json = (value: unknown): Content[] => [text(JSON.stringify(value))]
/** MCP's names for execute's label and code. */
const executeNames = { label: "description", code: "input" }

/** MCP's execute arguments under the contract's names: description is label and input is code. */
function contractNames(input: unknown): unknown {
  const fields = plainObject.safeParse(input).data
  if (!fields) return input
  const { description: label, input: code, ...rest } = fields
  return { ...rest, ...(label === undefined ? {} : { label }), ...(code === undefined ? {} : { code }) }
}
const tools: Tool[] = [
  operationTool(
    "get_tabs",
    "List the projects open in Parity, one per tab. The active tab is the one the person is looking at.",
    operations.tabs,
    json
  ),
  operationTool(
    "get_app_state",
    "Get a tab's state: its designs (ids, states, modes shown, where their boards are and how big), boards that overlap or crowd each other's titles, the selection, project modes, components and tokens, and what Parity detected in the project (each tool's version, where it's installed and its config, the package manager, and a note naming versions Parity doesn't test). Call it first, and again after the person may have changed things. Keep boards apart: Overlaps() and FindEmptySpace() in execute help place them.",
    operations.state,
    json
  ),
  operationTool(
    "get_status",
    "Read where a tab's edits stand, changing nothing: its revision (the same only while nothing has changed, so compare it before reading again), whether anything applied isn't saved (dirty), the files waiting for Save, token values waiting, how the last save went and writes that failed, and how many steps undo and redo hold. summary adds each unsaved file's designs added, changed and removed, the token values, and undo and redo labels, up to limit each. Changes are undoable once applied; only the person saves them, unless automatic saving is on.",
    operations.status,
    (result) => [text(describeStatus(result))]
  ),
  operationTool(
    "get_modes",
    "Read the project's modes and what each design shows. viewports are the ids Responsive takes; modes are the ids screenshot, find_problems and check_accessibility take, each one option per variable (viewport, theme, locale), with its width, window height and the classes and attributes it sets. designs gives each board's state, main mode and the modes beside it; name a design to get just it, with each frame's size and window. Reading changes nothing.",
    operations.modes,
    (result) => [text(describeModes(result))]
  ),
  {
    name: "execute",
    description:
      'Run a JavaScript snippet with the Parity API (read_skill "execute.md"). All changes land as one undoable step, or none on failure. Retry failures with editId and edits.',
    inputSchema: executeOperation.inputSchema(executeNames),
    fields: executeOperation.fields,
    names: executeNames,
    async run(input) {
      const result = await executeOperation.run(contractNames(input), call)
      const structured = executeOperation.structured(result)
      return {
        content: [text(describeExec(result)), ...result.screenshots.map((shot) => image(shot.png))],
        structuredContent: result.error ? { ...structured, error: renamePath(result.error, executeNames) } : structured,
        isError: executeOperation.failed(result)
      }
    }
  },
  operationTool(
    "screenshot",
    'Capture a design in any of its states and modes, rendered offscreen at real widths. state and mode take an id, a list, or "all"; mode also takes "shown".',
    operations.screenshot,
    (result) => [text(describeExec(result)), ...result.screenshots.map((shot) => image(shot.png))]
  ),
  operationTool(
    "find_problems",
    'Find layout problems in a design, rendered offscreen in every state and the modes it shows unless you narrow it: render errors, nodes that stick out of the frame, nodes cut off by an ancestor that clips, and components that aren\'t the project\'s. Each layout finding names the node and what it overflows, with both boxes and how far past each edge. Run it after changes, with screenshot. state and mode take an id, a list, or "all"; mode also takes "shown".',
    operations.problems,
    (result) => [text(describeProblems(result))]
  ),
  operationTool(
    "check_accessibility",
    'Check a design\'s accessibility with axe-core against WCAG 2.2 AA, rendered offscreen in every state and the modes it shows unless you narrow it. Lists each rule broken, worst first, with the layers that break it (ids you can pass to execute), the frames, what\'s wrong and a link on how to fix it. A contrast failure names the color token to set as style.foreground so it passes in every frame checked, when one does. state and mode take an id, a list, or "all"; mode also takes "shown". Automated checks find some issues, not all.',
    operations.accessibility,
    (result) => [text(describeAccessibility(result))]
  ),
  operationTool(
    "get_console",
    "Read what the project's own code wrote to the console: errors, warnings and logs from its components on the canvas, including while the person interacts with them, and from offscreen renders such as screenshots. Oldest first; the same message several times in a row is counted once. clear: true empties it after reading, so the next read shows only what's new.",
    operations.console,
    (result) => [text(describeConsole(result))]
  ),
  operationTool(
    "open_project",
    "Open a project folder in a new Parity tab, or switch to it if it's already open.",
    operations.open,
    json
  ),
  operationTool(
    "get_tokens",
    "Read tokens filtered by category, source or name, with values in every theme.",
    operations.tokens,
    (result) => [text(describeTokens(result))]
  ),
  operationTool(
    "get_components",
    "List project components with the file each is written in, libraries, icon sets and exports that were left out or failed to render.",
    operations.components,
    (result) => [text(describeComponents(result))]
  ),
  operationTool(
    "get_props",
    "Read a component's props from source, and its composition: the parents or provider it goes inside, the parts it holds, its slots and an example node to insert. all includes attributes it passes through.",
    operations.props,
    (result) => [text(describeProps(result))]
  ),
  {
    name: "read_skill",
    description: "Read the Parity design skill or a file it references.",
    inputSchema: skillOperation.inputSchema,
    fields: skillOperation.fields,
    run: async (input) => ({ content: [text(await skillOperation.run(input, readSkill))] })
  }
]

const instructions =
  "Parity renders a project's real components on a canvas. Designs are trees of the project's own components, layouts and text, styled only with its tokens, with states (like stories) and modes (viewport, theme, locale). Read the skill (read_skill) before designing, start with get_app_state, change designs with execute, check every state and mode with screenshot and find_problems, check accessibility with check_accessibility, and read what the components log with get_console."

/**
 * One JSON-RPC message from the client, as far as the server reads it. `params` stays open, since each method reads
 * its own. A message without an id is a notification, which gets no reply.
 */
const message = z.looseObject({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.looseObject({}).optional()
})

/** The client's side of `initialize`: who it is, for the canvas, and the protocol version it speaks. */
const initializeParams = z.looseObject({
  protocolVersion: z.string().optional().catch(undefined),
  clientInfo: z.looseObject({ name: z.unknown().optional(), title: z.unknown().optional() }).optional().catch(undefined)
})

/** `tools/call`'s params: which tool, and its arguments, which the tool's own schema checks. */
const toolCall = z.looseObject({ name: z.string(), arguments: z.unknown() })

/** Serves Parity's tools over MCP on stdin and stdout. */
export function serveMcp(): void {
  const lines = createInterface({ input: process.stdin })
  const send = (reply: unknown) => process.stdout.write(`${JSON.stringify(reply)}\n`)
  lines.on("line", (line) => {
    if (!line.trim()) return
    const json = jsonText(z.unknown()).safeParse(line)
    if (!json.success) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
      return
    }
    const read = checkData(message, json.data)
    if (!read.success) {
      const id = z.union([z.string(), z.number()]).safeParse(plainObject.safeParse(json.data).data?.id).data ?? null
      const { pointer, message: problem } = read.problem
      send({ jsonrpc: "2.0", id, error: { code: -32600, message: `Invalid request: ${pointer || "/"}: ${problem}` } })
      return
    }
    const request = read.data
    void respond(request.method, request.params).then((reply) => {
      if (request.id !== undefined && reply) send({ jsonrpc: "2.0", id: request.id, ...reply })
    })
  })
}

async function respond(method: string, params: Record<string, unknown> = {}) {
  switch (method) {
    case "initialize": {
      const { clientInfo, protocolVersion } = initializeParams.parse(params)
      setCaller(mcpCallerName(clientInfo), true)
      return {
        result: {
          protocolVersion: protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "parity", version: "0.0.0" },
          instructions
        }
      }
    }
    case "ping":
      return { result: {} }
    case "tools/list":
      return {
        result: {
          tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
        }
      }
    case "tools/call": {
      const called = checkData(toolCall, params)
      if (!called.success) {
        const { pointer, message: problem } = called.problem
        return { error: { code: -32602, message: `Invalid params: ${pointer}: ${problem}` } }
      }
      const tool = tools.find((candidate) => candidate.name === called.data.name)
      if (!tool) return { error: { code: -32602, message: `Unknown tool ${called.data.name}` } }
      try {
        return { result: await tool.run(called.data.arguments ?? {}) }
      } catch (error) {
        const failure = renamePath(operationError(error, tool.fields), tool.names ?? {})
        return { result: { content: [text(failure.message)], structuredContent: { error: failure }, isError: true } }
      }
    }
    default:
      return method.startsWith("notifications/")
        ? undefined
        : { error: { code: -32601, message: `Unknown method ${method}` } }
  }
}

function text(value: string): Content {
  return { type: "text", text: value }
}

function image(data: string): Content {
  return { type: "image", data, mimeType: "image/png" }
}
