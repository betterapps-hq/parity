import { spawn } from "node:child_process"
import { readdirSync, readFileSync, rmSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { rpcReply } from "@parity-app/agent/contracts"
import { type JsonValue, jsonValue } from "@parity-app/core/schema"
import { afterAll, beforeAll, beforeEach } from "vite-plus/test"
import { z } from "zod"
import type { OperationInput } from "./operations.ts"

/** A JSON object, as the CLI writes its logs and the tests' fake app reads its requests. */
const jsonObject = z.record(z.string(), jsonValue)

export type JsonObject = z.output<typeof jsonObject>

/** The MCP server's reply to the tests' second message, a tool call or the tool list, as far as the tests read it. */
const secondReply = z.looseObject({
  id: z.literal(2),
  result: z.looseObject({ structuredContent: jsonValue.optional(), tools: z.array(jsonObject).optional() }).optional()
})

export type ToolReply = z.output<typeof secondReply>

/** The reply to the tests' second message, among the lines the MCP server wrote. */
export function toolReply(stdout: string): ToolReply | undefined {
  for (const line of stdout.trim().split("\n")) {
    const reply = secondReply.safeParse(JSON.parse(line)).data

    if (reply) {
      return reply
    }
  }

  return undefined
}

/** A request the fake app was sent: the method and its params, and who sent it, as the CLI writes them. */
const appRequest = z.looseObject({ method: z.string().optional(), params: jsonObject.optional() })

export type AppRequest = z.output<typeof appRequest>

/** What the fake app answers a call: a result, or an error with its details, as the app's dispatch does. */
export type AppAnswer = z.input<typeof rpcReply>

/**
 * How long one CLI or MCP process may take. A start on CI's Windows runners, with every test file's processes and
 * Chrome on four cores, took more than 10 seconds (PAR-533); the limit stays under the test's own 20 there.
 */
const spawnLimit = process.env.CI ? 18_000 : 10_000

/**
 * The timeout for a test that starts CLI or MCP processes: two rounds of them at `spawnLimit`, so a slow start fails
 * with the fixture's own error rather than vitest's. Alone each takes about a fifth of a second, mostly Node loading
 * the CLI's modules, but starting processes slows under load far more than work inside the test does: with three full
 * runs at once, as several sessions' `pnpm verify` make, these tests took over the default 5 seconds (PAR-495).
 */
export const processTests = { timeout: 2 * spawnLimit }

/** Node's compile cache, shared by every CLI process the tests start, which saves about a quarter of each start. */
export const compileCache = { NODE_COMPILE_CACHE: join(tmpdir(), "parity-cli-compile-cache") }

/** The one project the fixture's app has open, which calls without a tab are routed to. */
export const fixtureTab = {
  id: "project",
  name: "Project",
  root: "/fixture/project",
  active: true,
  status: "ready",
  designs: 0
}

/** A tab's state with nothing in it, as the app answers `state` for an empty project. */
export function emptyState<Tab>(tab: Tab) {
  return {
    tab,
    revision: "r1",
    selection: {},
    designs: [],
    overlaps: [],
    modes: [],
    components: [],
    tokens: { count: 0, semantic: [], themeCategories: [] }
  }
}

/** What a CLI or MCP process the tests started exited with and wrote. */
export interface ProcessResult {
  code: number | null
  stdout: string
  stderr: string
}

/** The fake app's answers, what it was asked, and the CLI and MCP processes that ask it. */
export interface TransportFixture {
  response: AppAnswer
  tabs: JsonValue[]
  directory: string
  requests: AppRequest[]
  /** The CLI's own events from every process the tests started, oldest first (PAR-641). */
  events(): JsonObject[]
  /** Runs `parity` with these arguments, input and variables. */
  run: (args: string[], input?: string, env?: Record<string, string | undefined>) => Promise<ProcessResult>
  /** Calls one MCP tool, `execute` unless named, after initializing. */
  mcp: (input: OperationInput, name?: string) => Promise<ProcessResult>
}

/**
 * Each test file owns its endpoint and subprocesses; no Electron or running app is needed. The endpoint answers the
 * CLI's routing question (`copy`) itself, with `fixture.tabs`, and records every other request.
 */
export function transportFixture(defaultResult: AppAnswer["result"]): TransportFixture {
  const fixture: TransportFixture = {
    response: { result: defaultResult },
    tabs: [fixtureTab],
    directory: "",
    requests: [],
    run,
    mcp,
    events
  }

  const requests = fixture.requests

  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = []

    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk))
    }

    const body = appRequest.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    reply.setHeader("content-type", "application/json")

    if (body.method === "copy") {
      reply.end(JSON.stringify({ result: { tabs: fixture.tabs, focusedAt: 1 } }))

      return
    }

    requests.push(body)
    reply.end(JSON.stringify(fixture.response))
  })

  let directory = ""
  let agentFile = ""
  const bin = join(import.meta.dirname, "bin.ts")

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "parity-operation-contract-"))
    fixture.directory = directory
    agentFile = join(directory, "agent.json")
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()

    // A server listening on a port has an address with one, never a pipe's name.
    const port = z.object({ port: z.number() }).parse(address).port
    await writeFile(agentFile, JSON.stringify({ url: `http://127.0.0.1:${port}`, token: "contract-test" }))
  })
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    await rm(directory, { recursive: true, force: true })
  })
  beforeEach(() => {
    rmSync(join(directory, "logs"), { recursive: true, force: true })
    requests.length = 0
    fixture.response = { result: defaultResult }
    fixture.tabs = [fixtureTab]
  })

  function run(args: string[], input = "", env: Record<string, string | undefined> = {}) {
    return new Promise<ProcessResult>((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], {
        env: {
          ...process.env,
          ...compileCache,
          PARITY_AGENT_FILE: agentFile,
          PARITY_CLI_LOGS: join(directory, "logs"),
          PARITY_AGENT_NAME: "Contract Caller",
          PARITY_AGENT_ID: "cli-session",
          ...env
        },
        stdio: ["pipe", "pipe", "pipe"]
      })

      let stdout = ""
      let stderr = ""
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk
      })
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk
      })

      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error("Transport did not finish"))
      }, spawnLimit)

      child.on("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on("close", (code) => {
        clearTimeout(timeout)
        resolve({ code, stdout, stderr })
      })
      // A process that exits before reading its input closes the pipe; its code and output say what happened.
      child.stdin.on("error", () => undefined)
      child.stdin.end(input)
    })
  }

  function events(): JsonObject[] {
    let names: string[]

    try {
      names = readdirSync(join(directory, "logs")).sort()
    } catch {
      return []
    }

    return names.flatMap((name) =>
      readFileSync(join(directory, "logs", name), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => jsonObject.parse(JSON.parse(line)))
    )
  }

  function mcp(input: OperationInput, name = "execute") {
    return run(
      ["mcp"],
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "Contract Caller" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: input } }
      ]
        .map((message) => JSON.stringify(message))
        .join("\n") + "\n"
    )
  }

  return fixture
}
