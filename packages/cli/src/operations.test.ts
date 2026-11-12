import { resolve } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import {
  type AccessibilityResponse,
  type ComponentsResponse,
  type ConsoleResponse,
  type ModesResponse,
  type ProblemsResponse,
  type PropsResponse,
  type FindResponse,
  type ImagesResponse,
  type PlaceResponse,
  type PlacedReferencesResponse,
  type RemoveImageResponse,
  type ReportResponse,
  type StatusResponse,
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
  describeTokens
} from "./client.ts"
import { type ExecReply, type Screenshot, execResponse, structuredExec } from "./execute.ts"
import { bounded, type OperationFields, operations, skillOperation } from "./operations.ts"
import {
  emptyState,
  fixtureTab,
  type JsonObject,
  processTests,
  succeeded,
  toolReply,
  transportFixture
} from "./transport-fixture.ts"

const fixture = transportFixture({})
const { requests, run, mcp } = fixture
const tab = { id: "project", name: "Project" }
const screenshot: ExecReply = { ok: true, applied: false, output: [], warnings: [], created: {}, screenshots: [] }
const problems: ProblemsResponse = { tab, design: { id: "home", name: "Home" }, problems: [], frames: 1, warnings: [] }

const accessibility: AccessibilityResponse = {
  tab,
  design: { id: "home", name: "Home" },
  findings: [],
  frames: 1,
  warnings: []
}

const consoleReply = { tab, entries: [] }
const consoleResult: ConsoleResponse = { ...consoleReply, total: 0, truncated: false }
const noTokens = { tokens: [], total: 0, truncated: false }
const components: ComponentsResponse = { components: ["Button", "Card"] }
const props: PropsResponse = { component: "Button", known: true, props: [] }

const sidebar: PropsResponse = {
  component: "nova/Sidebar",
  path: "@buildkit/nova",
  known: true,
  props: [{ name: "collapsible", kind: "enum", group: "own", options: ["offcanvas", "icon", "none"] }],
  composition: {
    role: "wrapper",
    parents: { status: "listed", chain: [{ component: "nova/SidebarProvider" }], from: "example" },
    holds: ["nova/SidebarContent"],
    slots: [{ name: "children", key: "children", kind: "children" }],
    example: {
      node: {
        type: "component",
        id: "p1",
        component: "nova/SidebarProvider",
        slots: { children: [{ type: "component", id: "p2", component: "nova/Sidebar" }] }
      },
      status: "drawn"
    }
  }
}

const status: StatusResponse = {
  tab,
  revision: "a1b2c3d4:3",
  dirty: true,
  autosave: false,
  unsaved: [{ path: "app.par", kind: "document" }],
  tokenEdits: 0,
  save: { status: "unsaved" },
  errors: [],
  undo: { count: 3 },
  redo: { count: 0 }
}

const modes: ModesResponse = {
  tab,
  variables: [
    { id: "viewport", name: "Viewport", kind: "viewport", options: [{ id: "mobile", name: "Mobile", width: 390 }] }
  ],
  viewports: [{ id: "mobile", name: "Mobile", width: 390, height: 844 }],
  modes: [
    {
      id: "mobile-light",
      name: "Mobile Light",
      primary: true,
      viewport: "mobile",
      width: 390,
      height: 844,
      values: { viewport: "mobile" },
      classNames: [],
      attributes: {}
    }
  ],
  designs: [{ id: "home", name: "Home", state: "default", states: ["default"], main: "mobile-light", beside: [] }]
}

const imagesFound: ImagesResponse = {
  images: [
    {
      kind: "file",
      src: "/images/hero.png",
      path: "public/images/hero.png",
      name: "hero.png",
      bytes: 2048,
      alt: "A desk",
      usedBy: [{ document: "app.par", design: "home", designName: "Home", node: "hero" }],
      usedInCode: [{ path: "src/index.css", line: 2 }]
    },
    {
      kind: "linked",
      src: "https://images.unsplash.com/photo-1",
      name: "Photo by Ada Park",
      credit: { name: "Ada Park", url: "https://unsplash.com/@adapark", source: "Unsplash" },
      usedBy: [],
      usedInCode: []
    }
  ],
  total: 3,
  truncated: true
}

const removedImage: RemoveImageResponse = { path: "public/images/unused.webp", label: "Remove image" }

const reported: ReportResponse = {
  feedbackId: "0a1b2c",
  link: "https://sentry.io/organizations/better-apps/projects/parity-desktop/events/0a1b2c/",
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  replayId: "r1",
  tags: { tab: "Project", design: "home", state: "default", node: "title" },
  attachments: ["screenshot.png", "home default mobile-light.png", "events.jsonl"]
}

const calm = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  connector: "mobbin",
  source: "Mobbin",
  title: "Calm",
  platform: "ios" as const,
  link: "https://mobbin.com/screens/1b9d6bcd",
  credit: [{ name: "Calm" }, { name: "Mobbin", url: "https://mobbin.com/screens/1b9d6bcd" }],
  preview: { path: "/references/calm.webp", mimeType: "image/webp" as const }
}

const references: FindResponse = { found: [calm] }

/** Two references on the canvas: one an agent placed for Pricing, with a note, and one whose picture has expired. */
const onCanvas: PlacedReferencesResponse = {
  tab: { id: "tab-1", name: "Project" },
  references: [
    {
      id: "r1",
      app: "Calm",
      platform: "ios",
      link: "https://mobbin.com/screens/1b9d6bcd",
      picture: "https://images.mobbin.com/calm.png",
      query: "pricing page",
      note: "Yearly is picked by default",
      by: "Claude",
      design: { id: "pricing", name: "Pricing", file: "app.par" },
      preview: { path: "/references/calm-r1.png", mimeType: "image/png" }
    },
    {
      id: "r2",
      app: "Ledgerly",
      link: "https://mobbin.com/screens/2",
      picture: "https://images.mobbin.com/ledgerly.png",
      expired: true,
      design: { id: "pricing", name: "Pricing", file: "app.par" }
    }
  ]
}

const placed: PlaceResponse = {
  placed: true,
  node: "home/Hero/Photo",
  image: "https://images.unsplash.com/photo-1",
  credit: [{ name: "Ada Park" }, { name: "Unsplash" }]
}

const photos: FindResponse = {
  found: [
    {
      id: "Dwu85P9SOIk",
      connector: "unsplash",
      source: "Unsplash",
      title: "white desk",
      link: "https://unsplash.com/photos/Dwu85P9SOIk",
      credit: [{ name: "Ada Park" }, { name: "Unsplash" }]
    }
  ],
  allowance: { remaining: 49, limit: 50 }
}

const project = resolve("some/../project")

interface Case {
  name: string
  cli: string[]
  tool: string
  method: keyof typeof operations
  input: OperationFields
  params: JsonObject
  /** What the app answers. */
  result: unknown
  /** What CLI --json prints and MCP returns as structuredContent. */
  structured: unknown
  text: string
  /** MCP's text when it differs: data results are compact JSON there. */
  mcpText?: string
}

const cases: Case[] = [
  {
    name: "tabs",
    cli: ["tabs"],
    tool: "get_tabs",
    method: "tabs",
    input: {},
    params: {},
    // Every copy's tabs, from the question the CLI routes by rather than a call of its own.
    result: [fixtureTab],
    structured: { tabs: [fixtureTab] },
    text: JSON.stringify({ tabs: [fixtureTab] }, null, 2),
    mcpText: JSON.stringify({ tabs: [fixtureTab] })
  },
  {
    name: "state",
    cli: ["state"],
    tool: "get_app_state",
    method: "state",
    input: {},
    params: {},
    result: emptyState(fixtureTab),
    structured: emptyState(fixtureTab),
    text: JSON.stringify(emptyState(fixtureTab), null, 2),
    mcpText: JSON.stringify(emptyState(fixtureTab))
  },
  {
    name: "status",
    cli: ["status"],
    tool: "get_status",
    method: "status",
    input: {},
    params: { summary: false, limit: 10 },
    result: status,
    structured: status,
    text: describeStatus(status)
  },
  {
    name: "modes",
    cli: ["modes"],
    tool: "get_modes",
    method: "modes",
    input: {},
    params: {},
    result: modes,
    structured: modes,
    text: describeModes(modes)
  },
  {
    name: "open",
    cli: ["open", project],
    tool: "open_project",
    method: "open",
    input: { root: project },
    params: { root: project },
    result: fixtureTab,
    structured: fixtureTab,
    text: JSON.stringify(fixtureTab, null, 2),
    mcpText: JSON.stringify(fixtureTab)
  },
  {
    name: "screenshot",
    cli: ["screenshot", "home"],
    tool: "screenshot",
    method: "screenshot",
    input: { design: "home" },
    params: { design: "home", scale: 1, sheet: false },
    result: screenshot,
    structured: structuredExec(execResponse(screenshot)),
    text: describeExec(execResponse(screenshot))
  },
  {
    name: "problems",
    cli: ["problems", "home"],
    tool: "find_problems",
    method: "problems",
    input: { design: "home" },
    params: { design: "home", state: "all", mode: "shown" },
    result: problems,
    structured: problems,
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
    structured: accessibility,
    text: describeAccessibility(accessibility)
  },
  {
    name: "console",
    cli: ["console"],
    tool: "get_console",
    method: "console",
    input: {},
    params: { clear: false, limit: 50 },
    result: consoleReply,
    structured: consoleResult,
    text: describeConsole(consoleResult)
  },
  {
    name: "tokens",
    cli: ["tokens"],
    tool: "get_tokens",
    method: "tokens",
    input: {},
    params: { limit: 100 },
    result: [],
    structured: noTokens,
    text: describeTokens(noTokens)
  },
  {
    name: "components",
    cli: ["components"],
    tool: "get_components",
    method: "components",
    input: {},
    params: {},
    result: components,
    structured: components,
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
    structured: props,
    text: describeProps(props)
  },
  {
    name: "props with a composition",
    cli: ["props", "nova/Sidebar"],
    tool: "get_props",
    method: "props",
    input: { component: "nova/Sidebar" },
    params: { component: "nova/Sidebar", all: false },
    result: sidebar,
    structured: sidebar,
    text: describeProps(sidebar)
  },
  {
    name: "report",
    cli: ["report", "The title is cut off", "--design", "home", "--node", "title"],
    tool: "report_problem",
    method: "report",
    input: { message: "The title is cut off", design: "home", node: "title" },
    params: { message: "The title is cut off", design: "home", node: "title" },
    result: reported,
    structured: reported,
    text: describeReport(reported)
  },
  {
    name: "references",
    cli: ["references", "paywall", "with", "a", "free", "trial", "--platform", "ios"],
    tool: "find_references",
    method: "references",
    input: { query: "paywall with a free trial", platform: "ios" },
    params: { query: "paywall with a free trial", platform: "ios", limit: 6 },
    result: references,
    structured: references,
    text: describeReferences(references)
  },
  {
    name: "placed references",
    cli: ["references", "placed", "pricing"],
    tool: "get_references",
    method: "placedReferences",
    input: { design: "pricing" },
    params: { design: "pricing", limit: 6 },
    result: onCanvas,
    structured: onCanvas,
    text: describePlacedReferences(onCanvas)
  },
  {
    name: "media",
    cli: ["media", "desk", "by", "a", "window", "--type", "vectors", "--orientation", "vertical", "--page", "2"],
    tool: "find_media",
    method: "media",
    input: { query: "desk by a window", type: "vectors", orientation: "vertical", page: 2 },
    params: { query: "desk by a window", type: "vectors", orientation: "vertical", limit: 6, page: 2 },
    result: photos,
    structured: photos,
    text: describeMedia(photos)
  },
  {
    name: "place",
    cli: ["place", "unsplash", "Dwu85P9SOIk", "home/Hero/Photo"],
    tool: "place_result",
    method: "place",
    input: { connector: "unsplash", id: "Dwu85P9SOIk", node: "home/Hero/Photo" },
    params: { connector: "unsplash", id: "Dwu85P9SOIk", node: "home/Hero/Photo" },
    result: placed,
    structured: placed,
    text: describePlace(placed)
  },
  {
    name: "images",
    cli: ["images", "--search", "desk", "--unused"],
    tool: "get_images",
    method: "images",
    input: { search: "desk", unused: true },
    params: { search: "desk", unused: true, limit: 50 },
    result: imagesFound,
    structured: imagesFound,
    text: describeImages(imagesFound)
  },
  {
    name: "remove image",
    cli: ["images", "remove", "unused.webp"],
    tool: "remove_image",
    method: "removeImage",
    input: { image: "unused.webp" },
    params: { image: "unused.webp" },
    result: removedImage,
    structured: removedImage,
    text: describeRemovedImage(removedImage)
  }
]

function expectedReply<Structured>(text: string, structured: Structured, isError = false, images: Screenshot[] = []) {
  const content = [
    { type: "text", text },
    ...images.map((shot) => ({ type: "image", data: shot.png, mimeType: "image/png" }))
  ]

  return {
    jsonrpc: "2.0",
    id: 2,
    result: structured === undefined ? { content, isError } : { content, structuredContent: structured, isError }
  }
}

/** An invalid request's structured failure, pointing at the field. */
function invalid(message: string, path?: string) {
  const error = { code: "invalid_input", message, retryable: false }

  return { error: path ? { ...error, path } : error }
}

/** What reaches the app: each transport's request, with the tab the CLI routed it to; `tabs` asks no more than routing. */
function expectRequests(method: keyof typeof operations, params: JsonObject) {
  const { routing } = operations[method]
  const sent = routing === "tab" || routing === "tab-or-any" ? { tab: fixtureTab.id, ...params } : params
  expect(requests).toHaveLength(routing === "copies" ? 0 : 2)

  for (const request of requests) {
    expect(request).toEqual(expect.objectContaining({ method, params: sent, agent: "Contract Caller" }))
  }
}

describe("remaining transport contracts", processTests, () => {
  it.each(cases)("shares $name defaults and human output", async (entry) => {
    fixture.response = { result: entry.result }
    const [cli, protocol] = await Promise.all([run(entry.cli), mcp(entry.input, entry.tool)])
    expect(cli).toEqual(succeeded)
    expect(cli.stdout.trim()).toBe(entry.text)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(entry.mcpText ?? entry.text, entry.structured))
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

      expect(cli).toEqual(succeeded)
      expect(JSON.parse(cli.stdout)).toEqual(entry.structured)
      expect(toolReply(protocol.stdout)).toEqual(expectedReply(entry.mcpText ?? entry.text, entry.structured))
      expectRequests(entry.method, { ...entry.params, tab: "project" })
    }
  )

  // A copy that can't list its tabs is passed over, so `tabs` has no app error to pass on.
  it.each(cases.filter((entry) => entry.name !== "tabs"))(
    "preserves $name RPC errors with the app's code",
    async (entry) => {
      fixture.response = {
        error: "Shop is still opening",
        details: { code: "tab_not_ready", retryable: true }
      }

      const [cli, json, protocol] = await Promise.all([
        run(entry.cli),
        run([...entry.cli, "--json"]),
        mcp(entry.input, entry.tool)
      ])

      expect(cli.code).toBe(1)
      expect(cli.stderr.trim()).toBe("Shop is still opening")
      const failure = { error: { code: "tab_not_ready", message: "Shop is still opening", retryable: true } }
      expect(json.code).toBe(1)
      expect(JSON.parse(json.stdout)).toEqual(failure)
      expect(toolReply(protocol.stdout)).toEqual(expectedReply("Shop is still opening", failure, true))
    }
  )

  it.each([
    {
      cli: ["screenshot", "hom"],
      tool: "screenshot",
      input: { design: "hom" },
      reply: {
        result: {
          ...screenshot,
          ok: false,
          error: 'No design "hom". Designs: home (Home)',
          details: { code: "unknown_design", retryable: false, field: "design", alternatives: ["home"] }
        }
      },
      error: {
        code: "unknown_design",
        message: 'No design "hom". Designs: home (Home)',
        retryable: false,
        path: "/design",
        alternatives: ["home"]
      }
    },
    {
      cli: ["problems", "home", "--state", "loading"],
      tool: "find_problems",
      input: { design: "home", state: "loading" },
      reply: {
        error: 'No state "loading" in Home. States: default, empty',
        details: { code: "unknown_state", retryable: false, field: "state", alternatives: ["default", "empty"] }
      },
      error: {
        code: "unknown_state",
        message: 'No state "loading" in Home. States: default, empty',
        retryable: false,
        path: "/state",
        alternatives: ["default", "empty"]
      }
    },
    {
      cli: ["modes", "dashbord"],
      tool: "get_modes",
      input: { design: "dashbord" },
      reply: {
        error: 'No design "dashbord". Designs: home (Home), dashboard (Dashboard)',
        details: { code: "unknown_design", field: "design", alternatives: ["dashboard", "home"] }
      },
      error: {
        code: "unknown_design",
        message: 'No design "dashbord". Designs: home (Home), dashboard (Dashboard)',
        retryable: false,
        path: "/design",
        alternatives: ["dashboard", "home"]
      }
    },
    {
      cli: ["props", "Buton"],
      tool: "get_props",
      input: { component: "Buton" },
      reply: {
        error: "\"Buton\" isn't one of the project's components. Check Components().",
        details: { code: "unknown_component", field: "component", alternatives: ["Button", "Card"] }
      },
      error: {
        code: "unknown_component",
        message: "\"Buton\" isn't one of the project's components. Check Components().",
        retryable: false,
        path: "/component",
        alternatives: ["Button", "Card"]
      }
    },
    {
      cli: ["state", "--tab", "shop"],
      tool: "get_app_state",
      input: { tab: "shop" },
      reply: {
        error: 'No open tab matches "shop". Tabs: project',
        details: { code: "unknown_tab", field: "tab", alternatives: ["project"], extra: "dropped" }
      },
      error: {
        code: "unknown_tab",
        message: 'No open tab matches "shop". Tabs: project',
        retryable: false,
        path: "/tab",
        alternatives: ["project"]
      }
    }
  ])(
    "returns $error.code with the field and valid ids to use instead",
    async ({ cli: args, tool, input, reply, error }) => {
      fixture.response = reply
      const [cli, protocol] = await Promise.all([run([...args, "--json"]), mcp(input, tool)])
      expect(cli.code).toBe(1)
      expect(JSON.parse(cli.stdout).error).toEqual(error)
      expect(toolReply(protocol.stdout)).toEqual(
        expect.objectContaining({
          result: expect.objectContaining({ structuredContent: JSON.parse(cli.stdout), isError: true })
        })
      )
    }
  )

  it("reads an unknown code from the app as app_error rather than trusting it", async () => {
    fixture.response = { error: "Something broke", details: { code: "made_up", retryable: true } }
    const [cli, protocol] = await Promise.all([run(["state", "--json"]), mcp({}, "get_app_state")])
    const failure = { error: { code: "app_error", message: "Something broke", retryable: false } }
    expect(JSON.parse(cli.stdout)).toEqual(failure)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply("Something broke", failure, true))
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
    const [cli, json, protocol] = await Promise.all([run(args), run([...args, "--json"]), mcp(input, tool)])
    expect(cli.code).toBe(1)
    expect(cli.stderr.trim()).toBe(error)
    const field = `/${error.split(" ")[0]}`
    expect(JSON.parse(json.stdout)).toEqual(invalid(error, field))
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(error, invalid(error, field), true))
    expect(requests).toEqual([])
  })

  it.each<Omit<Case, "name" | "structured" | "text">>([
    {
      cli: ["screenshot", "home", "--state", "ready", "--state", "empty", "--mode", "mobile", "--scale", "0.25"],
      tool: "screenshot",
      method: "screenshot",
      input: { design: "home", state: ["ready", "empty"], mode: ["mobile"], scale: 0.25 },
      params: { design: "home", state: ["ready", "empty"], mode: "mobile", scale: 0.25, sheet: false },
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
      cli: ["console", "--clear", "--limit", "5"],
      tool: "get_console",
      method: "console",
      input: { clear: true, limit: 5 },
      params: { clear: true, limit: 5 },
      result: consoleReply
    },
    {
      cli: ["tokens", "--category", "color", "--source", "theme", "--search", "brand", "--limit", "1000"],
      tool: "get_tokens",
      method: "tokens",
      input: { category: "color", source: "theme", search: "brand", limit: 1000 },
      params: { category: "color", source: "theme", search: "brand", limit: 1000 },
      result: []
    },
    {
      cli: ["tokens", "--nearest", "13px", "--category", "radius"],
      tool: "get_tokens",
      method: "tokens",
      input: { nearest: "13px", category: "radius" },
      params: { nearest: "13px", category: "radius", limit: 100 },
      result: []
    },
    {
      cli: ["status", "--summary", "--limit", "3"],
      tool: "get_status",
      method: "status",
      input: { summary: true, limit: 3 },
      params: { summary: true, limit: 3 },
      result: status
    },
    {
      cli: ["modes", "home"],
      tool: "get_modes",
      method: "modes",
      input: { design: "home" },
      params: { design: "home" },
      result: modes
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
    expect(cli).toEqual(succeeded)
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ isError: false }) })
    )
    expectRequests(method, params)
  })

  it("resolves a CLI relative folder before entering the shared open operation", async () => {
    fixture.response = { result: fixtureTab }
    const [cli] = await Promise.all([run(["open", "some/../project"]), mcp({ root: project }, "open_project")])
    expect(cli).toEqual(succeeded)
    expectRequests("open", { root: project })
  })

  it("preserves screenshot image blocks while structured data omits image data", async () => {
    const shots = [{ path: "/shot.png", png: "AA==", design: "home", state: "default", mode: "desktop" }]
    const result = { ...screenshot, screenshots: shots }
    fixture.response = { result }

    const [cli, protocol] = await Promise.all([
      run(["screenshot", "home", "--json"]),
      mcp({ design: "home" }, "screenshot")
    ])

    const structured = {
      ...result,
      screenshots: [{ path: "/shot.png", design: "home", state: "default", mode: "desktop" }]
    }

    expect(JSON.parse(cli.stdout)).toEqual(structured)
    expect(toolReply(protocol.stdout)).toEqual(
      expectedReply(describeExec(execResponse(result)), structured, false, shots)
    )
  })

  it("sends sheet, returns each sheet as an image, and names its file in the text", async () => {
    const shot = { path: "/home-sheet.png", png: "AA==", design: "home", state: "default", mode: "desktop" }
    const frames = [{ state: "default", mode: "desktop", x: 24, y: 114, width: 640, height: 400 }]
    const sheets = [{ design: "home", path: "/home-sheet.png", png: "AA==", width: 688, height: 538, scale: 1, frames }]
    const result = { ...screenshot, sheets }
    fixture.response = { result }

    const [cli, protocol] = await Promise.all([
      run(["screenshot", "home", "--sheet", "--json"]),
      mcp({ design: "home", sheet: true }, "screenshot")
    ])

    const { png: _png, ...sheet } = sheets[0]!
    const structured = { ...result, sheets: [sheet] }
    const text = describeExec(execResponse(result))

    expect(fixture.requests.at(-1)?.params).toMatchObject({ design: "home", sheet: true })
    expect(JSON.parse(cli.stdout)).toEqual(structured)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(text, structured, false, [shot]))
    expect(text).toContain("home, 1 state by 1 mode: /home-sheet.png")
  })

  it("bounds tokens to the limit, the first ones, and says how many there were", async () => {
    const token = (name: string) => ({ name, category: "color", source: "semantic", values: { default: "#000" } })
    fixture.response = { result: [token("a"), token("b"), token("c")] }

    const [cli, protocol] = await Promise.all([
      run(["tokens", "--limit", "2", "--json"]),
      mcp({ limit: 2 }, "get_tokens")
    ])

    const structured = { tokens: [token("a"), token("b")], total: 3, truncated: true }
    expect(JSON.parse(cli.stdout)).toEqual(structured)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(describeTokens(structured), structured))
  })

  it("bounds the console to the newest entries, oldest first", async () => {
    const entry = (text: string, last: number) => ({
      level: "info",
      text,
      source: "http://localhost/src/app.tsx",
      line: 1,
      where: "canvas",
      count: 1,
      first: last,
      last
    })

    fixture.response = { result: { tab, entries: [entry("one", 1), entry("two", 2), entry("three", 3)] } }

    const [cli, protocol] = await Promise.all([
      run(["console", "--limit", "2", "--json"]),
      mcp({ limit: 2 }, "get_console")
    ])

    const structured = { tab, entries: [entry("two", 2), entry("three", 3)], total: 3, truncated: true }
    expect(JSON.parse(cli.stdout)).toEqual(structured)
    expect(toolReply(protocol.stdout)).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ structuredContent: structured, isError: false }) })
    )
  })

  it.each([0, 1.5, 1001, "10"])("rejects a limit of %j before RPC", async (value) => {
    const protocol = await mcp({ limit: value }, "get_tokens")
    const message = "limit must be a whole number from 1 to 1000"
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(message, invalid(message, "/limit"), true))
    expect(requests).toEqual([])
  })

  it("keeps what it can within a bound", () => {
    expect(bounded([1, 2, 3], 5)).toEqual({ items: [1, 2, 3], total: 3, truncated: false })
    expect(bounded([1, 2, 3], 2, "last")).toEqual({ items: [2, 3], total: 3, truncated: true })
  })

  it.each([
    {
      cli: ["screenshot", "home"],
      tool: "screenshot",
      result: { ...screenshot, ok: false, error: "Render failed" },
      text: describeExec(execResponse({ ...screenshot, ok: false, error: "Render failed" }))
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

    const [cli, json, protocol] = await Promise.all([
      run(args),
      run([...args, "--json"]),
      mcp({ design: "home" }, tool)
    ])

    expect(cli.code).toBe(1)
    expect(cli.stdout.trim()).toBe(text)
    expect(json.code).toBe(1)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(text, JSON.parse(json.stdout), true))
  })

  it.each([{}, { path: "execute.md" }])("shares skill reading without desktop RPC: %j", async (input) => {
    const args = input.path === undefined ? [] : [input.path]
    const [cli, protocol] = await Promise.all([run(["skill", ...args]), mcp(input, "read_skill")])
    expect(cli).toEqual(succeeded)
    expect(toolReply(protocol.stdout)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: cli.stdout.slice(0, -1) }] }
    })
    expect(requests).toEqual([])
  })

  it.each([
    { path: " ", alternatives: [] },
    { path: "../package.json", alternatives: [] },
    { path: "missing.md", alternatives: expect.arrayContaining(["SKILL.md", "execute.md"]) }
  ])("shares skill errors for $path", async ({ path, alternatives }) => {
    const [cli, json, protocol] = await Promise.all([
      run(["skill", path]),
      run(["skill", path, "--json"]),
      mcp({ path }, "read_skill")
    ])

    expect(cli.code).toBe(1)
    const failure = JSON.parse(json.stdout)
    expect(failure.error).toEqual(expect.objectContaining({ code: "invalid_input", path: "/path" }))
    expect(failure.error.alternatives ?? []).toEqual(alternatives)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(cli.stderr.trim(), failure, true))
    expect(requests).toEqual([])
  })

  const malformedMcp: { tool: string; input: JsonObject; error: string; path: string }[] = [
    { tool: "get_console", input: { clear: "false" }, error: "clear must be a boolean", path: "/clear" },
    { tool: "get_props", input: { component: "Button", all: 1 }, error: "all must be a boolean", path: "/all" },
    { tool: "get_tokens", input: { search: 1 }, error: "search must be a string", path: "/search" },
    {
      tool: "screenshot",
      input: { design: "home", state: [] },
      error: "state must be a nonblank string or a nonempty list of nonblank strings",
      path: "/state"
    },
    {
      tool: "screenshot",
      input: { design: "home", mode: ["mobile", 3] },
      error: "mode must be a nonblank string or a nonempty list of nonblank strings",
      path: "/mode"
    },
    {
      tool: "open_project",
      input: { root: "relative/project" },
      error: "root must be an absolute project folder path",
      path: "/root"
    },
    {
      tool: "get_tabs",
      input: { constructor: "ignored?" },
      error: "Unknown input field constructor",
      path: "/constructor"
    },
    { tool: "get_modes", input: { design: " " }, error: "design must be a nonblank string", path: "/design" },
    { tool: "get_status", input: { summary: "yes" }, error: "summary must be a boolean", path: "/summary" },
    {
      tool: "get_status",
      input: { limit: 101 },
      error: "limit must be a whole number from 1 to 100",
      path: "/limit"
    },
    { tool: "get_modes", input: { mode: "mobile" }, error: "Unknown input field mode", path: "/mode" }
  ]

  it.each(malformedMcp)("rejects malformed MCP $tool arguments without RPC", async ({ tool, input, error, path }) => {
    const protocol = await mcp(input, tool)
    expect(toolReply(protocol.stdout)).toEqual(expectedReply(error, invalid(error, path), true))
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

    expect(toolReply(protocol.stdout)).toEqual(
      expectedReply("Operation input must be an object", invalid("Operation input must be an object"), true)
    )
    expect(requests).toEqual([])
  })

  it("discovers all desktop operations plus execute and skill from shared contracts", async () => {
    expect(new Set(cases.map((entry) => entry.method))).toEqual(new Set(Object.keys(operations)))
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

    // Each is its contract's schema, with the subagent a call can name beside its fields (PAR-960).
    for (const entry of cases) {
      const contract = operations[entry.method].inputSchema
      const inputSchema = { ...contract, properties: { ...contract.properties, subagent: { type: "string" } } }
      expect(toolReply(protocol.stdout)).toEqual(
        expect.objectContaining({
          result: { tools: expect.arrayContaining([expect.objectContaining({ name: entry.tool, inputSchema })]) }
        })
      )
    }
  })

  // Published from the zod schemas (PAR-590): clients that take anyOf but not oneOf, and pattern, still read them.
  it("publishes a selector as nonblank text or a nonempty list of it", () => {
    const nonblank = { type: "string", minLength: 1, pattern: "\\S" }
    expect(operations.problems.inputSchema.properties).toEqual(
      expect.objectContaining({
        state: expect.objectContaining({
          default: "all",
          anyOf: [nonblank, { type: "array", minItems: 1, items: nonblank }]
        }),
        design: expect.objectContaining(nonblank)
      })
    )
  })

  it("refuses an answer it can't read, as app_error naming what's wrong", async () => {
    fixture.response = { result: { ...status, unsaved: [{ path: "app.par", kind: "folder" }] } }
    const cli = await run(["status", "--json"])
    expect(cli.code).toBe(1)
    expect(JSON.parse(cli.stdout).error).toEqual({
      code: "app_error",
      message: expect.stringContaining('answer to status (/unsaved/0/kind: expected one of "document", "stylesheet")'),
      retryable: false
    })
  })

  it("says in text what a component goes inside, with the example to insert", () => {
    expect(describeProps(sidebar).split("\n").slice(-6, -1)).toEqual([
      "It's a wrapper, which other parts go inside.",
      "Goes inside, outermost first: nova/SidebarProvider (from its example)",
      "Holds: nova/SidebarContent",
      "Slots: children (children)",
      "Example for Insert, drawn on the canvas:"
    ])
    expect(describeProps(sidebar)).toContain(JSON.stringify(sidebar.composition!.example.node))
  })

  // Every agent that loads Parity's tools pays for this list in its context, so it grows only on purpose (PAR-510).
  // Raise the budget when a tool earns it, not to make room for longer schemas or descriptions.
  it("names the test pass PARITY_TEST_RUN names in a report, unless the command names another", async () => {
    fixture.response = { result: reported }
    const fromVariable = await run(["report", "Wrong colour", "--state", "error"], "", { PARITY_TEST_RUN: "pass-7" })
    expect(fromVariable).toEqual(succeeded)
    await run(["report", "Wrong colour", "--test-run", "pass-8"], "", { PARITY_TEST_RUN: "pass-7" })

    const sent = (testRun: string, state?: string) =>
      expect.objectContaining({
        method: "report",
        params: state
          ? { tab: fixtureTab.id, message: "Wrong colour", state, testRun }
          : { tab: fixtureTab.id, message: "Wrong colour", testRun }
      })

    expect(requests).toEqual([sent("pass-7", "error"), sent("pass-8")])
  })

  it("says what a report is tied to and tagged with, and where it went", () => {
    expect(describeReport(reported).split("\n")).toEqual([
      "Reported to Sentry: https://sentry.io/organizations/better-apps/projects/parity-desktop/events/0a1b2c/",
      "Tied to trace 4bf92f3577b34da6a3ce929d0e0e4736 and replay r1.",
      "Tagged tab Project, design home, state default, node title.",
      "Sent with screenshot.png, home default mobile-light.png, events.jsonl.",
      "Sentry files it in Linear and links the issue from the feedback."
    ])
  })

  it("keeps the MCP tool list within its budget", async () => {
    const protocol = await run(["mcp"], JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n")
    const tools = toolReply(protocol.stdout)?.result?.tools
    // 11.7 KB when set, down from 33 KB with output schemas; 12.5 KB with get_logs (PAR-636); 13.6 KB with
    // report_problem (PAR-646); 14.6 KB with find_references (PAR-829), 15.6 KB with find_photos (now find_media), 16.1 KB with a
    // connector to name on each, 17.2 KB with place_result, 18.8 KB with get_images and remove_image (PAR-834), 19 KB with find_media taking a type (PAR-837), 19.5 KB with get_references (PAR-889),
    // 20.2 KB with get_tokens' nearest (PAR-833), 21.1 KB with a bare subagent on each tool that reaches the app
    // (PAR-960), so 21.5 KB.
    expect(Buffer.byteLength(JSON.stringify(tools))).toBeLessThanOrEqual(21.5 * 1024)
  })

  it("shows each reference's preview as an image over MCP, and leaves its base64 out of --json", async () => {
    const result = { found: [{ ...calm, preview: { ...calm.preview, data: "UklGRg==" } }] }
    fixture.response = { result }

    const [cli, protocol] = await Promise.all([
      run(["references", "paywall", "--json"]),
      mcp({ query: "paywall" }, "find_references")
    ])

    expect(JSON.parse(cli.stdout)).toEqual(references)
    expect(toolReply(protocol.stdout)?.result?.content).toEqual([
      { type: "text", text: describeReferences(result) },
      { type: "image", data: "UklGRg==", mimeType: "image/webp" }
    ])
  })

  it("says why a references search found nothing, and exits with 1 only when it's something to fix", async () => {
    const noKey = "This copy of Parity has no Mobbin key, so it can't search Mobbin. Carry on without Mobbin."
    fixture.response = { result: { found: [], problem: { code: "no-key", message: noKey } } }
    const without = await run(["references", "paywall"])
    fixture.response = {
      result: { found: [], problem: { code: "invalid", message: "Mobbin's platform can be web or ios." } }
    }
    const invalid = await run(["references", "paywall"])

    expect([without.stdout.trim(), without.code]).toEqual([noKey, 0])
    expect([invalid.stdout.trim(), invalid.code]).toEqual(["Mobbin's platform can be web or ios.", 1])
  })

  it("says a search has run out rather than that nothing matches", () => {
    expect(describeReferences({ found: [], done: true })).toBe("No more results for this search.")
    expect(describeReferences({ found: [] })).toBe(
      "Nothing matches. Try fewer parts, other words, or the other platform."
    )
  })

  it("lists each screen found with its link, id and preview, and what to do with them", () => {
    expect(describeReferences(references).split("\n")).toEqual([
      "1 screen from Mobbin:",
      "1. Calm (ios) https://mobbin.com/screens/1b9d6bcd",
      "   by Calm",
      "   mobbin 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      "   preview /references/calm.webp",
      "Follow their patterns with the project's own components and tokens; never copy an app's layout, text or branding. Credit the app and the source."
    ])
  })

  it("shows each placed reference's picture over MCP, and leaves its base64 out of --json", async () => {
    const [first, second] = onCanvas.references
    const preview = { path: "/references/calm-r1.png", mimeType: "image/png" as const, data: "iVBORw==" }
    const result = { ...onCanvas, references: [{ ...first, preview }, second] }
    fixture.response = { result }

    const [cli, protocol] = await Promise.all([run(["references", "placed", "--json"]), mcp({}, "get_references")])

    expect(JSON.parse(cli.stdout)).toEqual(onCanvas)
    expect(toolReply(protocol.stdout)?.result?.content).toEqual([
      { type: "text", text: describePlacedReferences(result) },
      { type: "image", data: "iVBORw==", mimeType: "image/png" }
    ])
  })

  it("lists each placed reference with the design it's for, who placed it and why, and its picture", () => {
    expect(describePlacedReferences(onCanvas).split("\n")).toEqual([
      "2 references on Project's canvas:",
      "1. Calm (ios) https://mobbin.com/screens/1b9d6bcd",
      "   for Pricing, placed by Claude: Yearly is picked by default",
      '   found with "pricing page"',
      "   picture /references/calm-r1.png",
      "2. Ledgerly https://mobbin.com/screens/2",
      "   for Pricing, placed by the person",
      "   picture expired",
      "Follow their patterns with the project's own components and tokens; never copy an app's layout, text or branding."
    ])
    expect(describePlacedReferences({ ...onCanvas, references: [] })).toBe("No references to show.")
    expect(
      describePlacedReferences({ ...onCanvas, withoutPictures: 3 })
        .split("\n")
        .at(-2)
    ).toBe("3 more without pictures: name a design or raise limit to see them.")
  })

  it("lists each stock result found with its author, and how many searches are left", () => {
    expect(describeMedia(photos).split("\n")).toEqual([
      "1 result from Unsplash:",
      "1. white desk https://unsplash.com/photos/Dwu85P9SOIk",
      "   by Ada Park",
      "   unsplash Dwu85P9SOIk",
      "   no preview: open the link",
      "Unsplash allows 49 more searches for now.",
      'Place a picture in an image node, or a video in a video node, with place_result (parity place <connector> <id> "<node>"), then credit its author and the source where the design shows it.'
    ])
  })

  it("says where a photo was placed and who to credit, or why it wasn't", () => {
    expect(describePlace(placed).split("\n")).toEqual([
      "Placed in home/Hero/Photo.",
      "Credit Ada Park, then Unsplash where the design shows it."
    ])
    expect(describePlace({ placed: false, problem: { code: "invalid", message: "Search again." } })).toBe(
      "Search again."
    )
  })
})
