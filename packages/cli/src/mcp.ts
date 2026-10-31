import { createInterface } from "node:readline"
import { mcpCallerName } from "./caller.ts"
import {
  call,
  describeAccessibility,
  describeComponents,
  describeConsole,
  describeExec,
  describeProblems,
  describeProps,
  describeTokens,
  setCaller
} from "./client.ts"
import { executeOperation } from "./execute.ts"
import { type Operation, operations, skillOperation } from "./operations.ts"
import { readSkill } from "./skills.ts"

interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run(input: Record<string, unknown>): Promise<{ content: Content[]; isError?: boolean }>
}
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: "image/png" }

/** One adapter for RPC-backed tools: operation contracts own defaults, validation and failure semantics. */
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
    async run(input) {
      const result = await operation.run(input, call)
      return { content: format(result), isError: operation.failed(result) }
    }
  }
}
const json = (value: unknown): Content[] => [text(JSON.stringify(value, null, 2))]
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
  {
    name: "execute",
    description:
      'Run a JavaScript snippet with the Parity API (read_skill "execute.md"). All changes land as one undoable step, or none on failure. Retry failures with editId and edits.',
    inputSchema: executeOperation.inputSchema({ label: "description", code: "input" }),
    async run(input) {
      const result = await executeOperation.run(
        { tab: input.tab, label: input.description, code: input.input, editId: input.editId, edits: input.edits },
        call
      )
      return {
        content: [text(describeExec(result)), ...result.screenshots.map((shot) => image(shot.png))],
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
    'Find layout problems in a design, rendered offscreen in every state and the modes it shows unless you narrow it: render errors, content wider than the frame, nodes cut off by a parent that clips, and components that aren\'t the project\'s. Run it after changes, with screenshot. state and mode take an id, a list, or "all"; mode also takes "shown".',
    operations.problems,
    (result) => [text(describeProblems(result))]
  ),
  operationTool(
    "check_accessibility",
    'Check a design\'s accessibility with axe-core against WCAG 2.2 AA, rendered offscreen in every state and the modes it shows unless you narrow it. Lists each rule broken, worst first, with the layers that break it (ids you can pass to execute), the frames, what\'s wrong and a link on how to fix it. state and mode take an id, a list, or "all"; mode also takes "shown". Automated checks find some issues, not all.',
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
    "List project components, libraries, icon sets and exports that were left out or failed to render.",
    operations.components,
    (result) => [text(describeComponents(result))]
  ),
  operationTool(
    "get_props",
    "Read a component's props from source. all includes attributes it passes through.",
    operations.props,
    (result) => [text(describeProps(result))]
  ),
  {
    name: "read_skill",
    description: "Read the Parity design skill or a file it references.",
    inputSchema: skillOperation.inputSchema,
    run: async (input) => ({ content: [text(await skillOperation.run(input, readSkill))] })
  }
]

const instructions =
  "Parity renders a project's real components on a canvas. Designs are trees of the project's own components, layouts and text, styled only with its tokens, with states (like stories) and modes (viewport, theme, locale). Read the skill (read_skill) before designing, start with get_app_state, change designs with execute, check every state and mode with screenshot and find_problems, check accessibility with check_accessibility, and read what the components log with get_console."

/** Serves Parity's tools over MCP on stdin and stdout. */
export function serveMcp(): void {
  const lines = createInterface({ input: process.stdin })
  const send = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`)
  lines.on("line", (line) => {
    if (!line.trim()) return
    let message: { id?: number | string; method?: string; params?: Record<string, unknown> }
    try {
      message = JSON.parse(line) as typeof message
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
      return
    }
    void respond(message).then((reply) => {
      if (message.id !== undefined && reply) send({ jsonrpc: "2.0", id: message.id, ...reply })
    })
  })
}

async function respond(message: { method?: string; params?: Record<string, unknown> }) {
  switch (message.method) {
    case "initialize": {
      const name = mcpCallerName(message.params?.clientInfo as { name?: unknown; title?: unknown } | undefined)
      setCaller(name, true)
      return {
        result: {
          protocolVersion: (message.params?.protocolVersion as string | undefined) ?? "2025-06-18",
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
        result: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }
      }
    case "tools/call": {
      const tool = tools.find((candidate) => candidate.name === message.params?.name)
      if (!tool) return { error: { code: -32602, message: `Unknown tool ${String(message.params?.name)}` } }
      try {
        const result = await tool.run((message.params?.arguments ?? {}) as Record<string, unknown>)
        return { result }
      } catch (error) {
        return { result: { content: [text(error instanceof Error ? error.message : String(error))], isError: true } }
      }
    }
    default:
      return message.method?.startsWith("notifications/")
        ? undefined
        : { error: { code: -32601, message: `Unknown method ${message.method}` } }
  }
}

function text(value: string): Content {
  return { type: "text", text: value }
}

function image(data: string): Content {
  return { type: "image", data, mimeType: "image/png" }
}
