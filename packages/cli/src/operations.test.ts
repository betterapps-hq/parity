import { resolve } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import {
  type AccessibilityResponse,
  type ComponentsResponse,
  type ConsoleResponse,
  type ProblemsResponse,
  type PropsResponse,
  describeAccessibility,
  describeComponents,
  describeConsole,
  describeExec,
  describeProblems,
  describeProps,
  describeTokens
} from "./client.ts"
import type { ExecResponse, Screenshot } from "./execute.ts"
import { operations, skillOperation } from "./operations.ts"
import { toolReply, transportFixture } from "./transport-fixture.ts"

const fixture = transportFixture({})
const { requests, run, mcp } = fixture
const tab = { id: "project", name: "Project" }
const screenshot: ExecResponse = { ok: true, applied: false, output: [], warnings: [], created: {}, screenshots: [] }
const problems: ProblemsResponse = { tab, design: { id: "home", name: "Home" }, problems: [], frames: 1, warnings: [] }
const accessibility: AccessibilityResponse = {
  tab,
  design: { id: "home", name: "Home" },
  findings: [],
  frames: 1,
  warnings: []
}
const consoleResult: ConsoleResponse = { tab, entries: [] }
const components: ComponentsResponse = { components: ["Button", "Card"] }
const props: PropsResponse = { component: "Button", known: true, props: [] }
const project = resolve("some/../project")
interface Case {
  name: string
  cli: string[]
  tool: string
  method: keyof typeof operations
  input: Record<string, unknown>
  params: Record<string, unknown>
  result: unknown
  text: string
}
const cases: Case[] = [
  {
    name: "tabs",
    cli: ["tabs"],
    tool: "get_tabs",
    method: "tabs",
    input: {},
    params: {},
    result: [tab],
    text: JSON.stringify([tab], null, 2)
  },
  {
    name: "state",
    cli: ["state"],
    tool: "get_app_state",
    method: "state",
    input: {},
    params: {},
    result: { tab, designs: [] },
    text: JSON.stringify({ tab, designs: [] }, null, 2)
  },
  {
    name: "open",
    cli: ["open", project],
    tool: "open_project",
    method: "open",
    input: { root: project },
    params: { root: project },
    result: tab,
    text: JSON.stringify(tab, null, 2)
  },
  {
    name: "screenshot",
    cli: ["screenshot", "home"],
    tool: "screenshot",
    method: "screenshot",
    input: { design: "home" },
    params: { design: "home", scale: 1 },
    result: screenshot,
    text: describeExec(screenshot)
  },
  {
    name: "problems",
    cli: ["problems", "home"],
    tool: "find_problems",
    method: "problems",
    input: { design: "home" },
    params: { design: "home", state: "all", mode: "shown" },
    result: problems,
    text: describeProblems(problems)
  },
  {
    name: "accessibility",
    cli: ["a11y", "home"],
    tool: "check_accessibility",
    method: "accessibility",
    input: { design: "home" },
    params: { design: "home", state: "all", mode: "shown" },
    result: accessibility,
    text: describeAccessibility(accessibility)
  },
  {
    name: "console",
    cli: ["console"],
    tool: "get_console",
    method: "console",
    input: {},
    params: { clear: false },
    result: consoleResult,
    text: describeConsole(consoleResult)
  },
  {
    name: "tokens",
    cli: ["tokens"],
    tool: "get_tokens",
    method: "tokens",
    input: {},
    params: {},
    result: [],
    text: describeTokens([])
  },
  {
    name: "components",
    cli: ["components"],
    tool: "get_components",
    method: "components",
    input: {},
    params: {},
    result: components,
    text: describeComponents(components)
  },
  {
    name: "props",
    cli: ["props", "Button"],
    tool: "get_props",
    method: "props",
    input: { component: "Button" },
    params: { component: "Button", all: false },
    result: props,
    text: describeProps(props)
  }
]
function expectedReply(text: string, isError = false, images: Screenshot[] = []) {
  return {
    jsonrpc: "2.0",
    id: 2,
    result: {
      content: [
        { type: "text", text },
        ...images.map((shot) => ({ type: "image", data: shot.png, mimeType: "image/png" }))
      ],
      isError
    }
  }
}
function expectRequests(method: string, params: Record<string, unknown>) {
  expect(requests).toHaveLength(2)
  for (const request of requests)
    expect(request).toEqual(expect.objectContaining({ method, params, agent: "Contract Caller" }))
}

describe("remaining transport contracts", () => {
  it.each(cases)("shares $name defaults and human output", async (entry) => {
    fixture.response = { result: entry.result }
    const [cli, protocol] = await Promise.all([run(entry.cli), mcp(entry.input, entry.tool)])
    expect(cli.code).toBe(0)
    expect(cli.stdout.trim()).toBe(entry.text)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(entry.text))
    expectRequests(entry.method, entry.params)
  })

  it.each(cases.filter((entry) => !["tabs", "open"].includes(entry.name)))(
    "keeps $name JSON output and explicit tab selection",
    async (entry) => {
      fixture.response = { result: entry.result }
      const [cli, protocol] = await Promise.all([
        run([...entry.cli, "--json", "--tab", "project"]),
        mcp({ ...entry.input, tab: "project" }, entry.tool)
      ])
      expect(cli.code).toBe(0)
      expect(JSON.parse(cli.stdout)).toEqual(entry.result)
      expect(toolReply(protocol.stdout)).toEqual(expectedReply(entry.text))
      expectRequests(entry.method, { ...entry.params, tab: "project" })
    }
  )

  it.each(cases)("preserves $name RPC errors", async (entry) => {
    fixture.response = { error: "Tab is not ready" }
    const [cli, protocol] = await Promise.all([run(entry.cli), mcp(entry.input, entry.tool)])
    expect(cli.code).toBe(1)
    expect(cli.stderr.trim()).toBe("Tab is not ready")
    expect(toolReply(protocol.stdout)).toEqual(expectedReply("Tab is not ready", true))
  })

  it.each([
    { cli: ["screenshot"], tool: "screenshot", input: {}, error: "design must be a nonblank string" },
    { cli: ["problems"], tool: "find_problems", input: {}, error: "design must be a nonblank string" },
    { cli: ["a11y"], tool: "check_accessibility", input: {}, error: "design must be a nonblank string" },
    { cli: ["props"], tool: "get_props", input: {}, error: "component must be a nonblank string" },
    { cli: ["open"], tool: "open_project", input: {}, error: "root must be a nonblank string" },
    {
      cli: ["state", "--tab", " "],
      tool: "get_app_state",
      input: { tab: " " },
      error: "tab must be a nonblank string"
    },
    {
      cli: ["screenshot", "home", "--scale", "nope"],
      tool: "screenshot",
      input: { design: "home", scale: "nope" },
      error: "scale must be a finite number from 0.25 to 3"
    },
    {
      cli: ["screenshot", "home", "--scale", "4"],
      tool: "screenshot",
      input: { design: "home", scale: 4 },
      error: "scale must be a finite number from 0.25 to 3"
    },
    {
      cli: ["problems", "home", "--state", ""],
      tool: "find_problems",
      input: { design: "home", state: "" },
      error: "state must be a nonblank string or a nonempty list of nonblank strings"
    },
    {
      cli: ["a11y", "home", "--mode", " "],
      tool: "check_accessibility",
      input: { design: "home", mode: [" "] },
      error: "mode must be a nonblank string or a nonempty list of nonblank strings"
    }
  ])("rejects malformed $tool input before RPC", async ({ cli: args, tool, input, error }) => {
    const [cli, protocol] = await Promise.all([run(args), mcp(input, tool)])
    expect(cli.code).toBe(1)
    expect(cli.stderr.trim()).toBe(error)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(error, true))
    expect(requests).toEqual([])
  })

  it.each([
    {
      cli: ["screenshot", "home", "--state", "ready", "--state", "empty", "--mode", "mobile", "--scale", "0.25"],
      tool: "screenshot",
      method: "screenshot",
      input: { design: "home", state: ["ready", "empty"], mode: ["mobile"], scale: 0.25 },
      params: { design: "home", state: ["ready", "empty"], mode: "mobile", scale: 0.25 },
      result: screenshot
    },
    {
      cli: ["problems", "home", "--state", "ready", "--mode", "mobile", "--mode", "desktop"],
      tool: "find_problems",
      method: "problems",
      input: { design: "home", state: ["ready"], mode: ["mobile", "desktop"] },
      params: { design: "home", state: "ready", mode: ["mobile", "desktop"] },
      result: problems
    },
    {
      cli: ["accessibility", "home", "--state", "ready", "--mode", "all"],
      tool: "check_accessibility",
      method: "accessibility",
      input: { design: "home", state: "ready", mode: "all" },
      params: { design: "home", state: "ready", mode: "all" },
      result: accessibility
    },
    {
      cli: ["console", "--clear"],
      tool: "get_console",
      method: "console",
      input: { clear: true },
      params: { clear: true },
      result: consoleResult
    },
    {
      cli: ["tokens", "--category", "color", "--source", "theme", "--search", "brand"],
      tool: "get_tokens",
      method: "tokens",
      input: { category: "color", source: "theme", search: "brand" },
      params: { category: "color", source: "theme", search: "brand" },
      result: []
    },
    {
      cli: ["props", "Button", "--all"],
      tool: "get_props",
      method: "props",
      input: { component: "Button", all: true },
      params: { component: "Button", all: true },
      result: props
    }
  ])("normalizes explicit $tool options identically", async ({ cli: args, tool, method, input, params, result }) => {
    fixture.response = { result }
    const [cli, protocol] = await Promise.all([run(args), mcp(input, tool)])
    expect(cli.code).toBe(0)
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ isError: false }) })
    )
    expectRequests(method, params)
  })

  it("resolves a CLI relative folder before entering the shared open operation", async () => {
    fixture.response = { result: tab }
    const [cli] = await Promise.all([run(["open", "some/../project"]), mcp({ root: project }, "open_project")])
    expect(cli.code).toBe(0)
    expectRequests("open", { root: project })
  })

  it("preserves screenshot image blocks while JSON omits image data", async () => {
    const shots = [{ path: "/shot.png", png: "AA==", design: "home", state: "default", mode: "desktop" }]
    const result = { ...screenshot, screenshots: shots }
    fixture.response = { result }
    const [cli, protocol] = await Promise.all([
      run(["screenshot", "home", "--json"]),
      mcp({ design: "home" }, "screenshot")
    ])
    expect(JSON.parse(cli.stdout)).toEqual({
      ...result,
      screenshots: [{ path: "/shot.png", design: "home", state: "default", mode: "desktop" }]
    })
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(describeExec(result), false, shots))
  })

  it.each([
    {
      cli: ["screenshot", "home"],
      tool: "screenshot",
      result: { ...screenshot, ok: false, error: "Render failed", editId: "retry" },
      text: describeExec({ ...screenshot, ok: false, error: "Render failed", editId: "retry" })
    },
    {
      cli: ["problems", "home"],
      tool: "find_problems",
      result: { ...problems, problems: [{ state: "default", mode: "desktop", problem: "overflow" }] },
      text: describeProblems({ ...problems, problems: [{ state: "default", mode: "desktop", problem: "overflow" }] })
    },
    {
      cli: ["a11y", "home"],
      tool: "check_accessibility",
      result: {
        ...accessibility,
        findings: [
          {
            state: "default",
            mode: "desktop",
            rule: "label",
            impact: "serious",
            help: "Label controls",
            helpUrl: "https://example.com/help",
            detail: "Missing label"
          }
        ]
      },
      text: describeAccessibility({
        ...accessibility,
        findings: [
          {
            state: "default",
            mode: "desktop",
            rule: "label",
            impact: "serious",
            help: "Label controls",
            helpUrl: "https://example.com/help",
            detail: "Missing label"
          }
        ]
      })
    }
  ])("signals $tool failures consistently with full details", async ({ cli: args, tool, result, text }) => {
    fixture.response = { result }
    const [cli, protocol] = await Promise.all([run(args), mcp({ design: "home" }, tool)])
    expect(cli.code).toBe(1)
    expect(cli.stdout.trim()).toBe(text)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(text, true))
  })

  it.each([{}, { path: "execute.md" }])("shares skill reading without desktop RPC: %j", async (input) => {
    const args = "path" in input && typeof input.path === "string" ? [input.path] : []
    const [cli, protocol] = await Promise.all([run(["skill", ...args]), mcp(input, "read_skill")])
    expect(cli.code).toBe(0)
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: cli.stdout.slice(0, -1) }] }
    })
    expect(requests).toEqual([])
  })

  it.each([" ", "../package.json", "missing.md"])("shares skill errors for %j", async (path) => {
    const [cli, protocol] = await Promise.all([run(["skill", path]), mcp({ path }, "read_skill")])
    expect(cli.code).toBe(1)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(cli.stderr.trim(), true))
    expect(requests).toEqual([])
  })

  const malformedMcp: { tool: string; input: Record<string, unknown>; error: string }[] = [
    { tool: "get_console", input: { clear: "false" }, error: "clear must be a boolean" },
    { tool: "get_props", input: { component: "Button", all: 1 }, error: "all must be a boolean" },
    { tool: "get_tokens", input: { search: 1 }, error: "search must be a string" },
    {
      tool: "screenshot",
      input: { design: "home", state: [] },
      error: "state must be a nonblank string or a nonempty list of nonblank strings"
    },
    {
      tool: "screenshot",
      input: { design: "home", mode: ["mobile", 3] },
      error: "mode must be a nonblank string or a nonempty list of nonblank strings"
    },
    {
      tool: "open_project",
      input: { root: "relative/project" },
      error: "root must be an absolute project folder path"
    },
    { tool: "get_tabs", input: { constructor: "ignored?" }, error: "Unknown input field constructor" }
  ]
  it.each(malformedMcp)("rejects malformed MCP $tool arguments without RPC", async ({ tool, input, error }) => {
    const protocol = await mcp(input, tool)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(error, true))
    expect(requests).toEqual([])
  })

  it("rejects a non-object MCP operation input", async () => {
    const protocol = await run(
      ["mcp"],
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_tabs", arguments: [] }
      }) + "\n"
    )
    expect(toolReply(protocol.stdout)).toEqual(expectedReply("Operation input must be an object", true))
    expect(requests).toEqual([])
  })

  it("discovers all desktop operations plus execute and skill from shared contracts", async () => {
    const protocol = await run(["mcp"], JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n")
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({ name: "read_skill", inputSchema: skillOperation.inputSchema }),
            expect.objectContaining({ name: "execute" })
          ])
        }
      })
    )
    for (const entry of cases)
      expect(toolReply(protocol.stdout)).toEqual(
        expect.objectContaining({
          result: {
            tools: expect.arrayContaining([
              expect.objectContaining({
                name: entry.tool,
                inputSchema: operations[entry.method].inputSchema
              })
            ])
          }
        })
      )
  })
})
