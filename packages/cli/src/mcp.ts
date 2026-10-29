import { createInterface } from "node:readline"
import { mcpCallerName } from "./caller.ts"
import {
  type AccessibilityResponse,
  call,
  type ConsoleResponse,
  describeAccessibility,
  describeConsole,
  describeExec,
  describeProblems,
  type Edit,
  type ExecResponse,
  type ProblemsResponse,
  setCaller
} from "./client.ts"
import { readSkill } from "./skills.ts"

interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run(input: Record<string, unknown>): Promise<Content[]>
}

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: "image/png" }

const tab = { type: "string", description: "Tab id, project root or name. Defaults to the active tab." }

const tools: Tool[] = [
  {
    name: "get_tabs",
    description: "List the projects open in Parity, one per tab. The active tab is the one the person is looking at.",
    inputSchema: { type: "object", properties: {} },
    run: async () => [text(JSON.stringify(await call("tabs"), null, 2))]
  },
  {
    name: "get_app_state",
    description:
      "Get a tab's state: its designs (ids, states, modes shown, where their boards are and how big), boards that overlap or crowd each other's titles, the selection, project modes, components and tokens, and what Parity detected in the project (each tool's version, where it's installed and its config, the package manager, and a note naming versions Parity doesn't test). Call it first, and again after the person may have changed things. Keep boards apart: Overlaps() and FindEmptySpace() in execute help place them.",
    inputSchema: { type: "object", properties: { tab } },
    run: async (input) => [text(JSON.stringify(await call("state", { tab: input.tab }), null, 2))]
  },
  {
    name: "execute",
    description:
      'Run a JavaScript snippet against a tab\'s designs with the Parity API (read_skill "execute.md"). All changes land as one undoable step, or none if it fails. On failure, retry with editId and edits instead of resending.',
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: 'Shown to the person while it runs. 3 to 8 words, imperative, e.g. "Add pricing tiers".'
        },
        input: { type: "string", description: "The snippet. Omit when retrying with editId and edits." },
        editId: { type: "string", description: "The failed call's editId, to patch and rerun its snippet." },
        edits: {
          type: "array",
          description: "Exact find and replace edits to the failed snippet, applied in order.",
          items: {
            type: "object",
            properties: { find: { type: "string" }, replace: { type: "string" }, all: { type: "boolean" } },
            required: ["find", "replace"]
          }
        },
        tab
      },
      required: ["description"]
    },
    run: async (input) => {
      const result = await call<ExecResponse>("exec", {
        tab: input.tab,
        label: input.description,
        code: input.input,
        editId: input.editId,
        edits: input.edits as Edit[] | undefined
      })
      return [text(describeExec(result)), ...result.screenshots.map((shot) => image(shot.png))]
    }
  },
  {
    name: "screenshot",
    description:
      'Capture a design in any of its states and modes, rendered offscreen at real widths. state and mode take an id, a list, or "all"; mode also takes "shown".',
    inputSchema: {
      type: "object",
      properties: {
        design: { type: "string", description: "Design id or name." },
        state: { description: 'State id, list of ids, or "all". Defaults to the state the design shows.' },
        mode: { description: 'Mode id, list of ids, "shown" or "all". Defaults to the primary mode.' },
        scale: { type: "number", description: "Pixel density, 0.25 to 3. Defaults to 1." },
        tab
      },
      required: ["design"]
    },
    run: async (input) => {
      const result = await call<ExecResponse>("screenshot", input)
      return [text(describeExec(result)), ...result.screenshots.map((shot) => image(shot.png))]
    }
  },
  {
    name: "find_problems",
    description:
      'Find layout problems in a design, rendered offscreen in every state and the modes it shows unless you narrow it: render errors, content wider than the frame, nodes cut off by a parent that clips, and components that aren\'t the project\'s. Run it after changes, with screenshot. state and mode take an id, a list, or "all"; mode also takes "shown".',
    inputSchema: {
      type: "object",
      properties: {
        design: { type: "string", description: "Design id or name." },
        state: { description: 'State id, list of ids, or "all". Defaults to "all".' },
        mode: { description: 'Mode id, list of ids, "shown" or "all". Defaults to "shown".' },
        tab
      },
      required: ["design"]
    },
    run: async (input) => [text(describeProblems(await call<ProblemsResponse>("problems", input)))]
  },
  {
    name: "check_accessibility",
    description:
      'Check a design\'s accessibility with axe-core against WCAG 2.2 AA, rendered offscreen in every state and the modes it shows unless you narrow it. Lists each rule broken, worst first, with the layers that break it (ids you can pass to execute), the frames, what\'s wrong and a link on how to fix it. state and mode take an id, a list, or "all"; mode also takes "shown". Automated checks find some issues, not all.',
    inputSchema: {
      type: "object",
      properties: {
        design: { type: "string", description: "Design id or name." },
        state: { description: 'State id, list of ids, or "all". Defaults to "all".' },
        mode: { description: 'Mode id, list of ids, "shown" or "all". Defaults to "shown".' },
        tab
      },
      required: ["design"]
    },
    run: async (input) => [text(describeAccessibility(await call<AccessibilityResponse>("accessibility", input)))]
  },
  {
    name: "get_console",
    description:
      "Read what the project's own code wrote to the console: errors, warnings and logs from its components on the canvas, including while the person interacts with them, and from offscreen renders such as screenshots. Oldest first; the same message several times in a row is counted once. clear: true empties it after reading, so the next read shows only what's new.",
    inputSchema: {
      type: "object",
      properties: { clear: { type: "boolean", description: "Empty it after reading." }, tab }
    },
    run: async (input) => [text(describeConsole(await call<ConsoleResponse>("console", input)))]
  },
  {
    name: "open_project",
    description: "Open a project folder in a new Parity tab, or switch to it if it's already open.",
    inputSchema: {
      type: "object",
      properties: { root: { type: "string", description: "Absolute path." } },
      required: ["root"]
    },
    run: async (input) => [text(JSON.stringify(await call("open", { root: input.root }), null, 2))]
  },
  {
    name: "read_skill",
    description:
      "Read Parity's design skill: SKILL.md, or a file it references such as execute.md or guide/web-app.md.",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    run: async (input) => [text(await readSkill(input.path as string | undefined))]
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
        return { result: { content: await tool.run((message.params?.arguments ?? {}) as Record<string, unknown>) } }
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
