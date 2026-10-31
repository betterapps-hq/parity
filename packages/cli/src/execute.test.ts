import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { describeExec } from "./client.ts"
import { type ExecResponse, executeRequest } from "./execute.ts"
import { toolReply, transportFixture } from "./transport-fixture.ts"

const success: ExecResponse = {
  ok: true,
  applied: true,
  output: ["Read 28 designs"],
  warnings: ["Example warning"],
  created: { home: "home-id" },
  screenshots: [{ path: "/shot.png", png: "AA==", design: "home", state: "default", mode: "desktop" }]
}
const fixture = transportFixture(success)
const { requests, run, mcp } = fixture

function expectRequests(params: Record<string, unknown>) {
  expect(requests).toHaveLength(2)
  for (const request of requests) {
    expect(request).toEqual(expect.objectContaining({ method: "exec", params, agent: "Contract Caller" }))
  }
  expect(requests).toContainEqual(expect.objectContaining({ agentId: "cli-session" }))
  expect(requests).toContainEqual(expect.objectContaining({ agentId: expect.stringMatching(/^Contract Caller#/) }))
}

describe("execute transport contract", () => {
  it("omits undeclared CLI ids so long names remain distinct at the desktop boundary", async () => {
    const prefix = "Harness ".repeat(16)
    for (const suffix of ["One", "Two"]) {
      const cli = await run(["tabs"], "", { PARITY_AGENT_NAME: prefix + suffix, PARITY_AGENT_ID: undefined })
      expect(cli.code).toBe(0)
    }
    expect(requests).toEqual([
      { method: "tabs", params: {}, agent: prefix + "One" },
      { method: "tabs", params: {}, agent: prefix + "Two" }
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
        isError: true
      }
    })
  })
  it("maps CLI stdin and MCP input to the same defaults and preserves their response formats", async () => {
    const code = "Print(Designs().length)\n"
    const [cli, protocol] = await Promise.all([run(["exec"], code), mcp({ input: code })])
    expectRequests({ code, label: "Edit designs" })
    expect(cli.code).toBe(0)
    expect(cli.stdout.trim()).toBe(describeExec(success))
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [
          { type: "text", text: describeExec(success) },
          { type: "image", data: "AA==", mimeType: "image/png" }
        ],
        isError: false
      }
    })
  })

  it("maps a CLI file, label and tab to the same request as MCP", async () => {
    const code = "Print('file input')"
    const file = join(fixture.directory, "input.js")
    await writeFile(file, code)
    const [cli] = await Promise.all([
      run(["exec", file, "--label", "Review home screen", "--tab", "project", "--json"], ""),
      mcp({ input: code, description: "Review home screen", tab: "project" })
    ])
    expectRequests({ code, label: "Review home screen", tab: "project" })
    expect(JSON.parse(cli.stdout)).toEqual({
      ...success,
      screenshots: [{ path: "/shot.png", design: "home", state: "default", mode: "desktop" }]
    })
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
      error: "Nothing to run: pass a snippet, or an editId with edits"
    },
    {
      name: "blank label",
      args: ["--label", " "],
      stdin: "Print(1)",
      input: { input: "Print(1)", description: " " },
      error: "label must be a nonblank string"
    },
    {
      name: "non-array edits",
      args: ["--edit-id", "failed", "--edits", "null"],
      stdin: "",
      input: { editId: "failed", edits: null },
      error: "edits must be an array"
    },
    {
      name: "invalid patch",
      args: ["--edit-id", "failed", "--edits", '[{"find":"x"}]'],
      stdin: "",
      input: { editId: "failed", edits: [{ find: "x" }] },
      error: "Each edit needs a replace string"
    },
    {
      name: "edits without retry",
      args: ["--edits", "[]"],
      stdin: "Print(1)",
      input: { input: "Print(1)", edits: [] },
      error: "edits requires an editId"
    }
  ])("rejects $name before sending RPC in either transport", async ({ args, stdin, input, error }) => {
    const [cli, protocol] = await Promise.all([run(["exec", ...args], stdin), mcp(input)])
    expect(requests).toEqual([])
    expect(cli.code).toBe(1)
    expect(cli.stderr.trim()).toBe(error)
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: error }], isError: true }
    })
  })

  it("reports failed execution as a CLI failure and MCP tool error with retry details", async () => {
    const failure = {
      ...success,
      ok: false,
      applied: false,
      error: "Unknown design",
      editId: "retry-id",
      created: {},
      screenshots: []
    }
    fixture.response = { result: failure }
    const [cli, protocol] = await Promise.all([run(["exec"], "Print(1)"), mcp({ input: "Print(1)" })])
    expect(cli.code).toBe(1)
    expect(cli.stdout.trim()).toBe(describeExec(failure))
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: describeExec(failure) }], isError: true }
    })
  })

  it("preserves desktop RPC errors in both transports", async () => {
    fixture.response = { error: "Tab is not ready" }
    const [cli, protocol] = await Promise.all([run(["exec"], "Print(1)"), mcp({ input: "Print(1)" })])
    expect(cli.code).toBe(1)
    expect(cli.stderr.trim()).toBe("Tab is not ready")
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: "Tab is not ready" }], isError: true }
    })
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
