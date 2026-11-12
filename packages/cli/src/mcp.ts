import { createInterface } from "node:readline"
import { requestJsonSchema } from "@parity-app/agent/contracts"
import { checkData, jsonText, jsonValue, nonBlankString, plainObject } from "@parity-app/core/schema"
import { z } from "zod"
import { mcpCallerName, mcpClientName, mcpClientVersion } from "./caller.ts"
import {
  callAs,
  describeAccessibility,
  describeComponents,
  describeConsole,
  describeExec,
  describeModes,
  describeProblems,
  describeProps,
  describeImages,
  describeMedia,
  describePlace,
  describePlacedReferences,
  describeReferences,
  describeRemovedImage,
  describeReport,
  describeStatus,
  describeTokens,
  setCaller
} from "./client.ts"
import { operationError, renamePath } from "./errors.ts"
import { executeOperation } from "./execute.ts"
import { describeLogs, logsFields, logsInputSchema, readLogs } from "./logs.ts"
import {
  type InputSchema,
  inputFields,
  type Operation,
  type OperationInput,
  operations,
  type Send,
  skillOperation
} from "./operations.ts"
import { readSkill } from "./skills.ts"
import { type CliAttributes, flushCliTelemetry, recordCli } from "./telemetry.ts"

interface Tool {
  name: string
  description: string
  inputSchema: InputSchema
  /** The input fields an error's path can point at, in this tool's names. */
  fields: readonly string[]
  /** Renames the contract's fields to this tool's, in error paths. */
  names?: Record<string, string>
  /** Answers on its own, without the app, so it shows no cursor and takes no `subagent`. */
  local?: boolean
  /** Runs the tool on its arguments, which its contract checks, asking the app through `send`. */
  run(input: OperationInput, send: Send): Promise<Reply>
}

interface Reply {
  content: Content[]
  structuredContent?: object
  isError?: boolean
}

/** The picture types MCP clients show. */
type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif"

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: ImageType }

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
    async run(input, send) {
      const result = await operation.run(input, send)

      return {
        content: format(result),
        structuredContent: operation.structured(result),
        isError: operation.failed(result)
      }
    }
  }
}

/** Each item's saved preview, as an image the client shows: what a search found, or the references on the canvas. */
function previews(items: readonly { preview?: { data?: string; mimeType: ImageType } }[]): Content[] {
  return items.flatMap((each) => (each.preview?.data ? [image(each.preview.data, each.preview.mimeType)] : []))
}

/** Results that are data to begin with, as compact JSON text for clients that don't read structuredContent. */
const json = <Value>(value: Value): Content[] => [text(JSON.stringify(value))]

/** MCP's names for execute's label and code. */
const executeNames = { label: "description", code: "input" }

/** MCP's execute arguments under the contract's names: description is label and input is code. */
function contractNames(input: OperationInput): OperationInput {
  const fields = inputFields.safeParse(input).data

  if (!fields) {
    return input
  }

  const { description: label, input: code, ...renamed } = fields

  if (label !== undefined) {
    renamed.label = label
  }

  if (code !== undefined) {
    renamed.code = code
  }

  return renamed
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
    "Get a tab's state: its designs (ids, states, modes shown, where their boards are and how big, how many references are beside each), boards that overlap or crowd each other's titles, the selection, project modes, components and tokens, and what Parity detected in the project (each tool's version, where it's installed and its config, the package manager, and a note naming versions Parity doesn't test). Call it first, and again after the person may have changed things. Keep boards apart: Overlaps() and FindEmptySpace() in execute help place them.",
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
    async run(input, send) {
      const result = await executeOperation.run(contractNames(input), send)
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
    'Capture a design in any of its states and modes, rendered offscreen at real widths. state and mode take an id, a list, or "all"; mode also takes "shown". sheet: true returns one labeled image of every frame per design.',
    operations.screenshot,
    (result) => [
      text(describeExec(result)),
      ...result.screenshots.map((shot) => image(shot.png)),
      ...(result.sheets ?? []).map((sheet) => image(sheet.png))
    ]
  ),
  operationTool(
    "find_problems",
    'Find layout problems in a design, rendered offscreen in every state and the modes it shows unless you narrow it: render errors, nodes past the frame, cut off by an ancestor that clips, spilling out of their parent or squeezed below their width, components the project lacks, and content drawn outside the frame. Each finding names the node, what it overflows and by how much, with both boxes. Run it after changes, with screenshot. state and mode take an id, a list, or "all"; mode also takes "shown".',
    operations.problems,
    (result) => [text(describeProblems(result))]
  ),
  operationTool(
    "check_accessibility",
    'Check a design\'s accessibility with axe-core against WCAG 2.2 AA, rendered offscreen in every state and the modes it shows unless you narrow it. Lists each rule broken, worst first, with the layers that break it (ids you can pass to execute), the frames, what\'s wrong and a link on how to fix it. A contrast failure names the color token to set as style.color so it passes in every frame checked, when one does. state and mode take an id, a list, or "all"; mode also takes "shown". Automated checks find some issues, not all.',
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
    "Open a project folder in a new Parity tab, or switch to it if it's already open. For a project that's already open, it detects the project again when its components.json, stylesheet setup, builder config or dependencies changed. Don't quit, restart or kill Parity to pick up changes: that loses the person's unsaved work.",
    operations.open,
    json
  ),
  operationTool(
    "get_tokens",
    "Read tokens filtered by category, source or name, with values in every theme, or those nearest a value.",
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
    "get_images",
    "List the project's images (files in public/images, linked images, paths with no file) and what uses each. search matches a name, alt text or credit.",
    operations.images,
    (result) => [text(describeImages(result))]
  ),
  operationTool(
    "remove_image",
    "Remove an image file from public/images. Refused while a design or code uses it, saying where.",
    operations.removeImage,
    (result) => [text(describeRemovedImage(result))]
  ),
  operationTool(
    "get_props",
    "Read a component's props from source, and its composition: the parents or provider it goes inside, the parts it holds, its slots and an example node to insert. all includes attributes it passes through.",
    operations.props,
    (result) => [text(describeProps(result))]
  ),
  operationTool(
    "find_references",
    "Search real apps' screens before designing a common one, as onboarding or a paywall, and look at the previews. Follow their patterns with the project's own components and tokens, never an app's layout, text or branding; name the apps you drew on.",
    operations.references,
    (result) => [text(describeReferences(result)), ...previews(result.found)]
  ),
  operationTool(
    "get_references",
    "List the real apps' screens placed beside designs as references, with who placed each and why, and look at them before changing a design.",
    operations.placedReferences,
    (result) => [text(describePlacedReferences(result)), ...previews(result.references)]
  ),
  operationTool(
    "find_media",
    "Search stock photos, illustrations, vectors or videos when a design needs one, as a hero or an avatar, and look at the previews. Place a picture or a video with place_result.",
    operations.media,
    (result) => [text(describeMedia(result)), ...previews(result.found)]
  ),
  operationTool(
    "place_result",
    "Put a picture a search found into an image node, or a video into a video node, as one undoable edit. Parity saves the file when the link doesn't last, and every video, and tells the source it was used. Credit who it names where the design shows it.",
    operations.place,
    (result) => [text(describePlace(result))]
  ),
  operationTool(
    "report_problem",
    "Report a problem in Parity itself, not the project, even when nothing failed: a wrong result or render. Sends Sentry the window's screenshot and replay, this call's trace and the design's frames; returns the link.",
    operations.report,
    (result) => [text(describeReport(result))]
  ),
  {
    name: "get_logs",
    description:
      "Read Parity's own events (errors, spans, traces) from its local log, for when Parity misbehaves; works with the app closed. The last run, oldest first, newest limit (100). level is the lowest shown; trace (or its start) and testRun search all runs; since is ISO or '10m'; session is an ID or 'all'.",
    inputSchema: requestJsonSchema(logsInputSchema),
    fields: logsFields,
    local: true,
    run: async (input) => {
      const result = readLogs(input)

      return { content: [text(describeLogs(result))], structuredContent: { ...result } }
    }
  },
  {
    name: "read_skill",
    description: "Read the Parity design skill or a file it references.",
    inputSchema: skillOperation.inputSchema,
    fields: skillOperation.fields,
    local: true,
    run: async (input) => ({ content: [text(await skillOperation.run(input, readSkill))] })
  }
]

const instructions =
  "Parity renders a project's real components on a canvas. Designs are trees of the project's own components, layouts and text, styled only with its tokens, with states (like stories) and modes (viewport, theme, locale). Read the skill (read_skill) before designing, start with get_app_state, change designs with execute, check every state and mode with screenshot and find_problems, check accessibility with check_accessibility, and read what the components log with get_console. When subagents work at the same time, have each pass its own short name as subagent on every call, so the canvas shows a cursor for each."

/**
 * A tool's input with `subagent` beside its own fields (PAR-960): which of a session's subagents a call is from. It's
 * left bare, and explained once in `instructions`, since a description on every tool would cost the list 1 KB.
 */
function withSubagent(schema: InputSchema): InputSchema {
  return { ...schema, properties: { ...schema.properties, subagent: { type: "string" } } }
}

/**
 * A call's arguments apart from the subagent it names. The name is read leniently, as the caller's is: one that's
 * blank or isn't text is left out rather than failing the call, since it's only shown on the canvas.
 */
function splitSubagent(input: OperationInput) {
  const fields = inputFields.safeParse(input).data

  if (!fields || !("subagent" in fields)) {
    return { input }
  }

  const { subagent, ...rest } = fields
  const name = nonBlankString.safeParse(subagent).data

  return name === undefined ? { input: rest } : { input: rest, subagent: name }
}

/**
 * One JSON-RPC message from the client, as far as the server reads it. `params` stays open, since each method reads
 * its own. A message without an id is a notification, which gets no reply.
 */
const message = z.looseObject({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.looseObject({}).optional()
})

/** The client's side of `initialize`: who it is, for the canvas and telemetry, and the protocol version it speaks. */
const initializeParams = z.looseObject({
  protocolVersion: z.string().optional().catch(undefined),
  clientInfo: z
    .looseObject({ name: z.unknown().optional(), title: z.unknown().optional(), version: z.unknown().optional() })
    .optional()
    .catch(undefined)
})

/** `tools/call`'s params: which tool, and its arguments, which the tool's own schema checks. */
const toolCall = z.looseObject({ name: z.string(), arguments: jsonValue.optional() })

/** A request's params, which each method reads as it needs. */
type Params = NonNullable<z.output<typeof message>["params"]>

/** Serves Parity's tools over MCP on stdin and stdout. */
export function serveMcp(): void {
  const lines = createInterface({ input: process.stdin })
  // A client that closes stdin is done; write what's held now rather than in the next 10 seconds (PAR-806).
  lines.on("close", flushCliTelemetry)
  const send = <Reply>(reply: Reply) => process.stdout.write(`${JSON.stringify(reply)}\n`)
  lines.on("line", (line) => {
    if (!line.trim()) {
      return
    }

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
      if (request.id !== undefined && reply) {
        send({ jsonrpc: "2.0", id: request.id, ...reply })
      }
    })
  })
}

async function respond(method: string, params: Params = {}) {
  switch (method) {
    case "initialize": {
      const { clientInfo, protocolVersion } = initializeParams.parse(params)
      const client = mcpClientName(clientInfo)
      setCaller(mcpCallerName(clientInfo), true, client)
      const version = mcpClientVersion(clientInfo)
      const session: CliAttributes<"mcp.session"> = {}

      if (client) {
        session.client = client
      }

      if (version) {
        session.clientVersion = version
      }

      if (protocolVersion) {
        session.protocolVersion = protocolVersion
      }

      recordCli("mcp.session", session)

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
          tools: tools.map(({ name, description, inputSchema, local }) => ({
            name,
            description,
            inputSchema: local ? inputSchema : withSubagent(inputSchema)
          }))
        }
      }
    case "tools/call": {
      const called = checkData(toolCall, params)

      if (!called.success) {
        const { pointer, message: problem } = called.problem

        return { error: { code: -32602, message: `Invalid params: ${pointer}: ${problem}` } }
      }

      const tool = tools.find((candidate) => candidate.name === called.data.name)

      if (!tool) {
        return { error: { code: -32602, message: `Unknown tool ${called.data.name}` } }
      }

      try {
        const given = called.data.arguments ?? {}
        const { input, subagent } = tool.local ? { input: given } : splitSubagent(given)

        return { result: await tool.run(input, callAs(subagent)) }
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

function image(data: string, mimeType: ImageType = "image/png"): Content {
  return { type: "image", data, mimeType }
}
