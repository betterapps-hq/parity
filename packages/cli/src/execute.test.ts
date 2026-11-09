import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type AgentHooks, type AgentSnapshot, execute } from "@parity-app/agent"
import { replies } from "@parity-app/agent/contracts"
import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { describeExec } from "./client.ts"
import { type ExecReply, execResponse, executeRequest, structuredExec } from "./execute.ts"
import {
  emptyState,
  fixtureTab,
  type JsonObject,
  processTests,
  toolReply,
  transportFixture
} from "./transport-fixture.ts"

const success: ExecReply = {
  ok: true,
  applied: true,
  output: ["Read 28 designs"],
  warnings: ["Example warning"],
  warningGroups: [{ category: "unknown_prop", severity: "warning", message: "Example warning", count: 1, at: [] }],
  created: { home: "home-id" },
  screenshots: [{ path: "/shot.png", png: "AA==", design: "home", state: "default", mode: "desktop" }]
}

const structuredSuccess = structuredExec(execResponse(success))
const fixture = transportFixture(success)
const { requests, run, mcp } = fixture

/** What reaches the app: the request, with the tab the CLI routed it to. */
function expectRequests(params: JsonObject) {
  expect(requests).toHaveLength(2)

  for (const request of requests) {
    expect(request).toEqual(
      expect.objectContaining({ method: "exec", params: { tab: fixtureTab.id, ...params }, agent: "Contract Caller" })
    )
  }

  expect(requests).toContainEqual(expect.objectContaining({ agentId: "cli-session" }))
  expect(requests).toContainEqual(expect.objectContaining({ agentId: expect.stringMatching(/^Contract Caller#/) }))
}

describe("execute transport contract", processTests, () => {
  it("omits undeclared CLI ids so long names remain distinct at the desktop boundary", async () => {
    const prefix = "Harness ".repeat(16)
    fixture.response = { result: emptyState(fixtureTab) }

    for (const suffix of ["One", "Two"]) {
      const cli = await run(["state"], "", { PARITY_AGENT_NAME: prefix + suffix, PARITY_AGENT_ID: undefined })
      expect(cli.code).toBe(0)
    }

    expect(requests).toEqual([
      { method: "state", params: { tab: fixtureTab.id }, agent: prefix + "One", transport: "cli" },
      { method: "state", params: { tab: fixtureTab.id }, agent: prefix + "Two", transport: "cli" }
    ])
  })
  it("publishes execute defaults and patch constraints through MCP discovery", async () => {
    const result = await run(["mcp"], JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n")
    expect(toolReply(result.stdout)).toEqual(
      expect.objectContaining({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "execute",
              inputSchema: expect.objectContaining({
                properties: expect.objectContaining({
                  description: expect.objectContaining({ default: "Edit designs" }),
                  edits: expect.objectContaining({ items: expect.objectContaining({ required: ["find", "replace"] }) })
                }),
                oneOf: [
                  { required: ["input"], not: { anyOf: [{ required: ["editId"] }, { required: ["edits"] }] } },
                  { required: ["editId"], not: { required: ["input"] } }
                ]
              })
            })
          ])
        }
      })
    )
  })

  it("rejects a snippet file combined with retry in both adapters", async () => {
    const file = join(fixture.directory, "ambiguous.js")
    await writeFile(file, "Print(1)")

    const [cli, protocol] = await Promise.all([
      run(["exec", file, "--edit-id", "failed"], ""),
      mcp({ input: "Print(1)", editId: "failed" })
    ])

    expect(requests).toEqual([])
    expect(cli.code).toBe(1)
    expect(cli.stderr.trim()).toBe("Pass a snippet or an editId, not both")
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [{ type: "text", text: cli.stderr.trim() }],
        structuredContent: {
          error: { code: "invalid_input", message: cli.stderr.trim(), retryable: false, path: "/editId" }
        },
        isError: true
      }
    })
  })
  it("records each run, MCP session and missing app in the CLI's own log, and says how each call came", async () => {
    const code = "Print(1)\n"

    const [cli, protocol, missing] = await Promise.all([
      run(["exec", "--label", "Try"], code),
      mcp({ input: code }),
      run(["tabs"], "", { PARITY_AGENT_FILE: join(fixture.directory, "none.json") })
    ])

    expect([cli.code, missing.code]).toEqual([0, 1])
    expect(toolReply(protocol.stdout)).toEqual(expect.objectContaining({ result: expect.anything() }))
    expect(requests.map((request) => String(request.transport)).sort((a, b) => a.localeCompare(b))).toEqual([
      "cli",
      "mcp"
    ])
    const events = fixture.events()
    expect(events.every((event) => event.process === "cli")).toBe(true)

    const named = (name: string) =>
      events
        .filter((event) => event.name === name)
        .map((event) => event.attributes)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

    expect(named("cli.ran")).toEqual([
      { command: "exec", flags: ["label"], exitCode: 0 },
      { command: "mcp", flags: [], exitCode: 0 },
      { command: "tabs", flags: [], exitCode: 1, code: "not_running" }
    ])
    expect(named("mcp.session")).toEqual([{ client: "Contract Caller" }])
    expect(named("cli.connectFailed")).toEqual([{ code: "not_running", copies: 0 }])
  })
  it("maps CLI stdin and MCP input to the same defaults and preserves their response formats", async () => {
    const code = "Print(Designs().length)\n"
    const [cli, protocol] = await Promise.all([run(["exec"], code), mcp({ input: code })])
    expectRequests({ code, label: "Edit designs" })
    expect(cli.code).toBe(0)
    expect(cli.stdout.trim()).toBe(describeExec(execResponse(success)))
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [
          { type: "text", text: describeExec(execResponse(success)) },
          { type: "image", data: "AA==", mimeType: "image/png" }
        ],
        structuredContent: structuredSuccess,
        isError: false
      }
    })
  })

  it("maps a CLI file, label and tab to the same request as MCP", async () => {
    const code = "Print('file input')"
    const file = join(fixture.directory, "input.js")
    await writeFile(file, code)

    const [cli, protocol] = await Promise.all([
      run(["exec", file, "--label", "Review home screen", "--tab", "project", "--json"], ""),
      mcp({ input: code, description: "Review home screen", tab: "project" })
    ])

    expectRequests({ code, label: "Review home screen", tab: "project" })
    expect(JSON.parse(cli.stdout)).toEqual({
      ...success,
      screenshots: [{ path: "/shot.png", design: "home", state: "default", mode: "desktop" }]
    })
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ structuredContent: JSON.parse(cli.stdout) }) })
    )
  })

  it("maps retry patches identically, preserving empty replacement strings and all", async () => {
    const edits = [{ find: " old ", replace: "", all: true }]

    const [cli] = await Promise.all([
      run(["exec", "--edit-id", "failed", "--edits", JSON.stringify(edits)], ""),
      mcp({ editId: "failed", edits })
    ])

    expect(cli.code).toBe(0)
    expectRequests({ label: "Edit designs", editId: "failed", edits })
  })

  it("defaults retry edits to an empty list for both transports", async () => {
    const [cli] = await Promise.all([run(["exec", "--edit-id", "failed"], ""), mcp({ editId: "failed" })])
    expect(cli.code).toBe(0)
    expectRequests({ label: "Edit designs", editId: "failed", edits: [] })
  })

  it.each([
    {
      name: "missing snippet",
      args: [],
      stdin: "",
      input: {},
      error: "Nothing to run: pass a snippet, or an editId with edits",
      cliPath: "/code",
      mcpPath: "/input"
    },
    {
      name: "blank label",
      args: ["--label", " "],
      stdin: "Print(1)",
      input: { input: "Print(1)", description: " " },
      error: "label must be a nonblank string",
      cliPath: "/label",
      mcpPath: "/description"
    },
    {
      name: "non-array edits",
      args: ["--edit-id", "failed", "--edits", "null"],
      stdin: "",
      input: { editId: "failed", edits: null },
      error: "edits must be an array",
      cliPath: "/edits",
      mcpPath: "/edits"
    },
    {
      name: "invalid patch",
      args: ["--edit-id", "failed", "--edits", '[{"find":"x"}]'],
      stdin: "",
      input: { editId: "failed", edits: [{ find: "x" }] },
      error: "Each edit needs a replace string",
      cliPath: "/edits/0/replace",
      mcpPath: "/edits/0/replace"
    },
    {
      name: "edits without retry",
      args: ["--edits", "[]"],
      stdin: "Print(1)",
      input: { input: "Print(1)", edits: [] },
      error: "edits requires an editId",
      cliPath: "/edits",
      mcpPath: "/edits"
    }
  ])(
    "rejects $name before sending RPC in either transport, with the field at fault",
    async ({ args, stdin, input, error, cliPath, mcpPath }) => {
      const [cli, json, protocol] = await Promise.all([
        run(["exec", ...args], stdin),
        run(["exec", ...args, "--json"], stdin),
        mcp(input)
      ])

      expect(requests).toEqual([])
      expect(cli.code).toBe(1)
      expect(cli.stderr.trim()).toBe(error)
      const failure = { code: "invalid_input", message: error, retryable: false }
      expect(JSON.parse(json.stdout)).toEqual({ error: { ...failure, path: cliPath } })
      expect(toolReply(protocol.stdout)).toEqual({
        jsonrpc: "2.0",
        id: 2,
        result: {
          content: [{ type: "text", text: error }],
          structuredContent: { error: { ...failure, path: mcpPath } },
          isError: true
        }
      })
    }
  )

  it("reports failed execution as a CLI failure and MCP tool error with retry details", async () => {
    const failure: ExecReply = {
      ...success,
      ok: false,
      applied: false,
      error: 'No design "hom". Designs: home (Home)',
      details: { code: "unknown_design", retryable: false, field: "design", alternatives: ["home"] },
      editId: "retry-id",
      created: {},
      screenshots: []
    }

    fixture.response = { result: failure }

    const [cli, json, protocol] = await Promise.all([
      run(["exec"], "Print(1)"),
      run(["exec", "--json"], "Print(1)"),
      mcp({ input: "Print(1)" })
    ])

    const canonical = execResponse(failure)
    // A snippet's unknown design isn't one of execute's inputs, so there's no path, but the alternatives stay.
    expect(canonical.error).toEqual({
      code: "unknown_design",
      message: 'No design "hom". Designs: home (Home)',
      retryable: false,
      alternatives: ["home"],
      editId: "retry-id"
    })
    expect(cli.code).toBe(1)
    expect(cli.stdout.trim()).toBe(describeExec(canonical))
    expect(cli.stdout).toContain('retrying with editId "retry-id"')
    expect(json.code).toBe(1)
    expect(JSON.parse(json.stdout)).toEqual(structuredExec(canonical))
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [{ type: "text", text: describeExec(canonical) }],
        structuredContent: structuredExec(canonical),
        isError: true
      }
    })
  })

  it("explains Measure's single frame the same way in both transports (PAR-461)", async () => {
    const signup: ContainerSpec = {
      id: "signup",
      name: "Sign up",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "page", children: [] },
      states: [
        { id: "default", name: "Default" },
        { id: "loading", name: "Loading" }
      ]
    }

    const project: AgentSnapshot = {
      tab: "measure",
      components: [],
      tokens: [],
      theme: [],
      modes: defaultModeSettings,
      documents: [{ path: "app.par", document: { version: 3, containers: [signup] } }],
      libraryDesigns: [],
      tokenOverrides: [],
      mainDocument: "app.par",
      props: {},
      selection: {},
      bounds: {}
    }

    const render: AgentHooks["render"] = async () => {
      throw new Error("Measure rendered before checking its options")
    }

    const code = `await Measure("signup", { state: "all" })`

    // The reply as the app builds it from the agent's result, which the CLI's check takes.
    const { changes: _changes, ...result } = await execute({ label: "Measure", code }, project, {
      presence: () => undefined,
      render
    })

    const reply = replies.exec.parse({ ...result, applied: false, screenshots: [] })
    fixture.response = { result: reply }

    const [cli, json, protocol] = await Promise.all([
      run(["exec"], code),
      run(["exec", "--json"], code),
      mcp({ input: code })
    ])

    const canonical = execResponse(reply)
    expect(canonical.error).toEqual({
      code: "invalid_input",
      message: expect.stringMatching(
        /^Measure lays out one frame, so state takes one state id, not "all"\. .* States in Sign up: default \(Default\), loading \(Loading\)\./
      ),
      retryable: false,
      // invalid_input keeps the field it names, as every snippet check does.
      path: "/state",
      alternatives: ["default", "loading"],
      editId: result.editId
    })
    expect(cli.code).toBe(1)
    expect(cli.stdout.trim()).toBe(describeExec(canonical))
    expect(json.code).toBe(1)
    expect(JSON.parse(json.stdout)).toEqual(structuredExec(canonical))
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [{ type: "text", text: describeExec(canonical) }],
        structuredContent: structuredExec(canonical),
        isError: true
      }
    })
  })

  it("codes a snippet failure without details as execution_failed", () => {
    const reply: ExecReply = { ...success, ok: false, error: "x is not defined (line 1)", editId: "e1" }
    expect(execResponse(reply).error).toEqual({
      code: "execution_failed",
      message: "x is not defined (line 1)",
      retryable: false,
      editId: "e1"
    })
  })

  it("shows the patches a Replace discarded in both transports, and nothing when none were (PAR-455)", async () => {
    const replaced: ExecReply = {
      ...success,
      warnings: [],
      screenshots: [],
      discarded: [
        {
          design: "home",
          replaced: "hero",
          replacement: "k3x9a",
          nodes: [
            { id: "hero", name: "Hero", viewports: ["mobile"], states: ["loading"] },
            { id: "card/title", variants: ["size=small"] }
          ]
        }
      ]
    }

    fixture.response = { result: replaced }

    const [cli, json, protocol] = await Promise.all([
      run(["exec"], "Print(1)"),
      run(["exec", "--json"], "Print(1)"),
      mcp({ input: "Print(1)" })
    ])

    const text = describeExec(execResponse(replaced))
    expect(text).toContain(
      [
        "Discarded by Replace (reapply what you still want to the new node):",
        "  home/hero, now k3x9a:",
        "    Hero (hero): viewports mobile; states loading",
        "    card/title: variants size=small"
      ].join("\n")
    )
    expect(cli.stdout.trim()).toBe(text)
    expect(JSON.parse(json.stdout).discarded).toEqual(replaced.discarded)
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          content: [{ type: "text", text }],
          structuredContent: execResponse(replaced)
        })
      })
    )
    expect(describeExec(execResponse(success))).not.toContain("Discarded")
    expect(structuredExec(execResponse(success))).not.toHaveProperty("discarded")
  })

  it("preserves desktop RPC errors in both transports, coded app_error when the app gives no code", async () => {
    fixture.response = { error: "Tab is not ready" }

    const [cli, json, protocol] = await Promise.all([
      run(["exec"], "Print(1)"),
      run(["exec", "--json"], "Print(1)"),
      mcp({ input: "Print(1)" })
    ])

    expect(cli.code).toBe(1)
    expect(cli.stderr.trim()).toBe("Tab is not ready")
    const error = { code: "app_error", message: "Tab is not ready", retryable: false }
    expect(JSON.parse(json.stdout)).toEqual({ error })
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: "Tab is not ready" }], structuredContent: { error }, isError: true }
    })
  })

  it("keeps the app's code for a retry whose snippet it no longer has, pointing at editId in both", async () => {
    fixture.response = {
      error: "No failed snippet with editId gone; send the whole snippet again",
      details: { code: "unknown_edit_id", retryable: false, field: "editId" }
    }

    const [json, protocol] = await Promise.all([
      run(["exec", "--edit-id", "gone", "--json"], ""),
      mcp({ editId: "gone" })
    ])

    const error = {
      code: "unknown_edit_id",
      message: "No failed snippet with editId gone; send the whole snippet again",
      retryable: false,
      path: "/editId"
    }

    expect(JSON.parse(json.stdout)).toEqual({ error })
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ structuredContent: { error }, isError: true }) })
    )
  })

  it("says the app isn't running, as a retryable not_running, in both", async () => {
    const env = { PARITY_AGENT_FILE: join(fixture.directory, "missing.json") }

    const messages = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "Contract Caller" } } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "execute", arguments: { input: "Print(1)" } } }
    ]

    const [json, protocol] = await Promise.all([
      run(["exec", "--json"], "Print(1)", env),
      run(["mcp"], messages.map((message) => JSON.stringify(message) + "\n").join(""), env)
    ])

    const error = expect.objectContaining({ code: "not_running", retryable: true })
    expect(json.code).toBe(1)
    expect(JSON.parse(json.stdout)).toEqual({ error })
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ structuredContent: { error }, isError: true }) })
    )
  })

  it("lists tools without output schemas, which cost agents context and no client needs (PAR-510)", async () => {
    const result = await run(["mcp"], JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n")
    const tools = toolReply(result.stdout)?.result?.tools ?? []
    expect(tools.length).toBeGreaterThan(0)

    for (const tool of tools) {
      expect(tool).not.toHaveProperty("outputSchema")
    }
  })
})

describe("execute request validation", () => {
  it.each([
    { code: "Print(1)", editId: "retry" },
    { code: 4 },
    { code: "Print(1)", tab: null },
    { editId: "retry", edits: [null] },
    { editId: "retry", edits: [{ find: "", replace: "x" }] },
    { editId: "retry", edits: [{ find: "x", replace: "y", all: "yes" }] },
    { editId: "retry", edits: [{ find: "x", replace: "y", other: true }] }
  ])("rejects malformed input %j", (input) => {
    expect(() => executeRequest(input)).toThrow(
      /snippet or an editId|code must|tab must|edit must|edit needs|Edit all|Unknown edit/
    )
  })
})
