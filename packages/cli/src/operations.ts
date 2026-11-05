import type {
  AccessibilityResponse,
  Routing,
  ComponentsResponse,
  ConsoleEntry,
  ConsoleResponse,
  ModesResponse,
  ProblemsResponse,
  PropsResponse,
  StatusResponse,
  TabSummary,
  TabsResponse,
  TokenInfo,
  TokensResponse
} from "./client.ts"
import { invalidInput } from "./errors.ts"
import {
  type ExecReply,
  type ExecResponse,
  execOutputSchema,
  execResponse,
  executionFailed,
  structuredExec,
  tabDescription
} from "./execute.ts"

interface Field {
  schema: Record<string, unknown>
  required?: boolean
  read(value: unknown, name: string): unknown
}

function text(description: string, required = false, fallback?: string): Field {
  return {
    schema: {
      type: "string",
      minLength: 1,
      pattern: "\\S",
      description,
      ...(fallback === undefined ? {} : { default: fallback })
    },
    required,
    read(value, name) {
      if (value === undefined && !required) return fallback
      if (typeof value !== "string" || !value.trim()) throw invalidInput(name, `${name} must be a nonblank string`)
      return value
    }
  }
}
function boolean(description: string): Field {
  return {
    schema: { type: "boolean", default: false, description },
    read(value, name) {
      if (value === undefined) return false
      if (typeof value !== "boolean") throw invalidInput(name, `${name} must be a boolean`)
      return value
    }
  }
}
function selector(description: string, fallback?: string): Field {
  const item = { type: "string", minLength: 1, pattern: "\\S" }
  return {
    schema: {
      oneOf: [item, { type: "array", minItems: 1, items: item }],
      description,
      ...(fallback ? { default: fallback } : {})
    },
    read(value, name) {
      if (value === undefined) return fallback
      if (typeof value === "string" && value.trim()) return value
      if (Array.isArray(value) && value.length && value.every((item) => typeof item === "string" && item.trim())) {
        return value.length === 1 ? value[0] : value
      }
      throw invalidInput(name, `${name} must be a nonblank string or a nonempty list of nonblank strings`)
    }
  }
}
/** How many items a list read returns at most: a default that keeps a reply small, and a ceiling. */
function limit(description: string, fallback: number, most: number): Field {
  return {
    schema: { type: "integer", minimum: 1, maximum: most, default: fallback, description },
    read(value, name) {
      if (value === undefined) return fallback
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > most) {
        throw invalidInput(name, `${name} must be a whole number from 1 to ${most}`)
      }
      return value
    }
  }
}
const tab = text(tabDescription)
const design = text("Design id or name.", true)
const scale: Field = {
  schema: { type: "number", minimum: 0.25, maximum: 3, default: 1, description: "Pixel density." },
  read(value) {
    if (value === undefined) return 1
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0.25 || value > 3) {
      throw invalidInput("scale", "scale must be a finite number from 0.25 to 3")
    }
    return value
  }
}
const rootText = text("Absolute project folder path.", true)
const absoluteRoot = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/
const root: Field = {
  ...rootText,
  schema: { ...rootText.schema, pattern: absoluteRoot.source },
  read(value) {
    const path = rootText.read(value, "root")
    if (typeof path !== "string" || !absoluteRoot.test(path)) {
      throw invalidInput("root", "root must be an absolute project folder path")
    }
    return path
  }
}

type Send = <T>(method: string, params: Record<string, unknown>, routing?: Routing) => Promise<T>

/**
 * The adapters share these contracts; they only parse their syntax and format results. `run` gives the canonical
 * result, and `structured` the data both CLI `--json` and MCP `structuredContent` return, described by `outputSchema`.
 */
export interface Operation<Result> {
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  /** The input fields, which an error's path can point at. */
  fields: readonly string[]
  /**
   * Which copy of the app the call goes to, from its fields: one with a tab goes to the copy that has it open, one with
   * a root to the copy that has that project or the one the person used last, and one with neither asks every copy.
   */
  routing: Routing
  run(input: Record<string, unknown>, send: Send): Promise<Result>
  failed(result: Result): boolean
  structured(result: Result): Record<string, unknown>
}
function fieldsContract(fields: Record<string, Field>) {
  return {
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.schema])),
      required: Object.entries(fields)
        .filter(([, field]) => field.required)
        .map(([key]) => key)
    },
    request(input: Record<string, unknown>): Record<string, unknown> {
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw invalidInput(undefined, "Operation input must be an object")
      for (const key of Object.keys(input))
        if (!Object.hasOwn(fields, key)) throw invalidInput(key, `Unknown input field ${key}`)
      const result: Record<string, unknown> = {}
      for (const [key, field] of Object.entries(fields)) {
        const value = field.read(input[key], key)
        if (value !== undefined) result[key] = value
      }
      return result
    }
  }
}
interface Options<Result> {
  failed?: (result: Result) => boolean
  structured?: (result: Result) => Record<string, unknown>
}
/** An operation whose canonical result is built from the app's reply, given the validated request. */
function mapped<Result extends object, Reply>(
  method: string,
  fields: Record<string, Field>,
  outputSchema: Record<string, unknown>,
  result: (reply: Reply, request: Record<string, unknown>) => Result,
  options: Options<Result> = {}
): Operation<Result> {
  const contract = fieldsContract(fields)
  const routing = routingFor(fields)
  return {
    inputSchema: contract.inputSchema,
    outputSchema,
    fields: Object.keys(fields),
    routing,
    async run(input, send) {
      const request = contract.request(input)
      return result(await send<Reply>(method, request, routing), request)
    },
    failed: options.failed ?? (() => false),
    structured: options.structured ?? ((value) => Object.fromEntries(Object.entries(value)))
  }
}
/** Which copy a call goes to, from its fields: see `Operation.routing`. */
function routingFor(fields: Record<string, Field>): Routing {
  if ("tab" in fields) return "tab"
  if ("root" in fields) return "open"
  return "copies"
}
/** An operation whose canonical result is the app's reply. */
function operation<Result extends object>(
  method: string,
  fields: Record<string, Field>,
  outputSchema: Record<string, unknown>,
  options: Options<Result> = {}
): Operation<Result> {
  return mapped<Result, Result>(method, fields, outputSchema, (reply) => reply, options)
}

/** The first `count` items, with how many there were, so a reply says when it left some out. */
export function bounded<T>(items: T[], count: number, keep: "first" | "last" = "first") {
  const kept = keep === "first" ? items.slice(0, count) : items.slice(Math.max(0, items.length - count))
  return { items: kept, total: items.length, truncated: kept.length < items.length }
}

// Output schemas. They describe what agents branch on; objects stay open, so a new field isn't a breaking change.
const string = { type: "string" }
const strings = { type: "array", items: string }
const integer = { type: "integer" }
const boolean_ = { type: "boolean" }
function object(properties: Record<string, unknown>, optional: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required: Object.keys(properties).filter((key) => !optional.includes(key)) }
}
const ref = object({ id: string, name: string })
const tabSchema = object(
  {
    id: string,
    name: string,
    root: string,
    active: boolean_,
    status: { type: "string", enum: ["loading", "ready", "error"] },
    error: string,
    designs: { ...integer, description: "How many designs the project has." }
  },
  ["error"]
)
const frameSchema = { state: string, mode: string }
const number = { type: "number" }
const boxSchema = object({ x: number, y: number, width: number, height: number })
const designSchema = object(
  {
    id: string,
    name: string,
    kind: string,
    file: string,
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
    states: { type: "array", items: ref },
    showing: object({ state: string, mode: string, beside: strings }),
    nodes: integer
  },
  ["width", "height"]
)
const stateSchema = object(
  {
    tab: tabSchema,
    selection: object({ design: string, node: string, mode: string }, ["design", "node", "mode"]),
    designs: { type: "array", items: designSchema },
    overlaps: {
      type: "array",
      description:
        "Every pair of boards on the canvas that's too close, as execute's Overlaps() lists them. A pair with " +
        "titleOnly doesn't collide: the lower board's title covers the upper one.",
      items: object(
        {
          designs: strings,
          names: strings,
          width: { ...number, description: "How far they share, title band included." },
          height: number,
          titleOnly: {
            ...boolean_,
            description: "Only the lower board's title covers the other; the boards are clear."
          },
          estimated: {
            ...boolean_,
            description: "One isn't drawn yet, so its size is estimated from its frames. Absent: both measured."
          }
        },
        ["width", "height", "titleOnly", "estimated"]
      )
    },
    modes: {
      type: "array",
      description: "The project's modes, primary first.",
      items: object({
        id: string,
        name: string,
        width: { type: "number" },
        primary: {
          ...boolean_,
          description: "The project's first mode: every design's main frame unless it picks another. Only one is."
        }
      })
    },
    components: strings,
    tokens: object({ count: integer, semantic: strings, themeCategories: strings }),
    viewport: { type: "object" },
    detection: { type: "object" }
  },
  ["viewport", "detection"]
)
const truncation = {
  total: { ...integer, description: "How many there were before the limit." },
  truncated: { ...boolean_, description: "Some were left out; narrow the read or raise limit." }
}
const tokensSchema = object({
  tokens: {
    type: "array",
    items: object({
      name: string,
      category: string,
      source: string,
      values: { type: "object", additionalProperties: string, description: "Value per theme." }
    })
  },
  ...truncation
})
const consoleSchema = object({
  tab: ref,
  entries: {
    type: "array",
    items: object({
      level: { type: "string", enum: ["info", "warning", "error", "debug"] },
      text: string,
      source: string,
      line: integer,
      where: { type: "string", enum: ["canvas", "offscreen"] },
      count: integer,
      first: { type: "number" },
      last: { type: "number" }
    })
  },
  ...truncation
})
const problemsSchema = object({
  tab: ref,
  design: ref,
  problems: {
    type: "array",
    items: object(
      {
        ...frameSchema,
        kind: {
          type: "string",
          enum: ["render-error", "unknown-component", "content-wider", "frame-overflow", "clipped"]
        },
        problem: string,
        node: string,
        name: string,
        box: boxSchema,
        container: object({ node: string, name: string, box: boxSchema }, ["node", "name"]),
        overflow: object({ left: number, right: number, top: number, bottom: number }, [
          "left",
          "right",
          "top",
          "bottom"
        ])
      },
      ["kind", "node", "name", "box", "container", "overflow"]
    )
  },
  frames: integer,
  warnings: strings
})
const accessibilitySchema = object({
  tab: ref,
  design: ref,
  findings: {
    type: "array",
    items: object(
      {
        ...frameSchema,
        rule: string,
        impact: { type: "string", enum: ["critical", "serious", "moderate", "minor"] },
        help: string,
        helpUrl: string,
        node: string,
        name: string,
        detail: string
      },
      ["node", "name"]
    )
  },
  frames: integer,
  warnings: strings
})
const componentsSchema = object(
  {
    components: strings,
    iconLibraries: strings,
    leftOut: {
      type: "array",
      items: object({ name: string, path: string, reason: string, undecided: boolean_ }, ["undecided"])
    },
    drawn: integer,
    failing: {
      type: "array",
      items: object({
        id: string,
        problem: { type: "string", enum: ["provider", "server", "async", "error"] },
        reason: string
      })
    },
    corrections: { type: "object" }
  },
  ["iconLibraries", "leftOut", "drawn", "failing", "corrections"]
)
const propsSchema = object(
  {
    component: string,
    path: string,
    import: string,
    known: boolean_,
    props: {
      type: "array",
      items: object(
        {
          name: string,
          kind: string,
          group: string,
          options: { type: "array", items: { type: ["string", "number", "boolean"] } },
          default: { type: ["string", "number", "boolean", "null"] },
          required: boolean_
        },
        ["group", "options", "default", "required"]
      )
    },
    composition: object({
      role: {
        type: "string",
        enum: ["provider", "wrapper", "component"],
        description: "provider draws nothing and gives parts inside it context; wrapper draws and holds other parts."
      },
      parents: object(
        {
          status: {
            type: "string",
            enum: ["listed", "none", "unknown"],
            description: "listed: insert it inside chain; none: it needs nothing; unknown: nothing says, see reason."
          },
          chain: {
            type: "array",
            description: "Outermost first.",
            items: object({ component: string, optional: boolean_ }, ["optional"])
          },
          from: { ...string, description: "What said so, such as the library's examples or the error it throws." },
          reason: string
        },
        ["chain", "from", "reason"]
      ),
      holds: { ...strings, description: "Parts that go directly inside it." },
      slots: {
        type: "array",
        items: object({ name: string, key: string, kind: { type: "string", enum: ["children", "element", "render"] } })
      },
      example: object(
        {
          node: { type: "object", description: "A node Insert takes as it is: the component inside its parents." },
          status: {
            type: "string",
            enum: ["drawn", "failing", "untried"],
            description: "Whether the component has drawn on the canvas."
          },
          reason: string
        },
        ["reason"]
      )
    })
  },
  ["path", "import", "composition"]
)

const viewportSchema = object(
  { id: string, name: string, width: { type: "number" }, height: { type: "number" }, device: string },
  ["device"]
)
const frameReportSchema = object(
  {
    mode: string,
    width: { type: "number" },
    height: { type: "number", description: "Fixed frame height, which clips; absent when it grows." },
    window: object({ width: { type: "number" }, height: { type: "number" } })
  },
  ["height"]
)
const modesSchema = object({
  tab: ref,
  variables: {
    type: "array",
    items: object({
      id: string,
      name: string,
      kind: { type: "string", enum: ["viewport", "theme", "locale", "custom"] },
      options: { type: "array", items: { type: "object" } }
    })
  },
  viewports: {
    type: "array",
    items: viewportSchema,
    description: "Viewport ids, which Responsive and a node's responsive patches take. Not mode ids."
  },
  modes: {
    type: "array",
    description: "Mode ids, which renders (screenshot, problems, accessibility) and a design's modes take.",
    items: object({
      id: string,
      name: string,
      primary: boolean_,
      viewport: string,
      width: { type: "number" },
      height: { type: "number" },
      values: { type: "object", additionalProperties: string },
      classNames: strings,
      attributes: { type: "object", additionalProperties: string }
    })
  },
  designs: {
    type: "array",
    items: object(
      {
        id: string,
        name: string,
        state: string,
        states: strings,
        main: string,
        beside: strings,
        frames: { type: "array", items: frameReportSchema }
      },
      ["frames"]
    )
  }
})

const historySide = object(
  { count: integer, labels: { ...strings, description: "With summary: newest first, up to limit." } },
  ["labels"]
)
const statusSchema = object(
  {
    tab: ref,
    revision: {
      type: "string",
      description: "Opaque; the same only while nothing in the tab has changed. Compare it with state's revision."
    },
    dirty: { ...boolean_, description: "Something applied (and undoable) isn't on disk yet." },
    autosave: { ...boolean_, description: "Changes save themselves; otherwise they wait for the person's Save." },
    unsaved: {
      type: "array",
      items: object(
        {
          path: string,
          kind: { type: "string", enum: ["document", "stylesheet"] },
          designs: object({ added: strings, changed: strings, removed: strings }),
          modes: boolean_,
          tokens: strings,
          more: integer
        },
        ["designs", "modes", "tokens", "more"]
      )
    },
    tokenEdits: { ...integer, description: "Token values waiting for Save to write them to the stylesheet." },
    save: object({ status: { type: "string", enum: ["saved", "unsaved", "saving", "failed"] }, error: string }, [
      "error"
    ]),
    errors: { type: "array", items: object({ path: string, error: string }) },
    undo: historySide,
    redo: historySide
  },
  []
)

const checks = {
  tab,
  design,
  state: selector('State id, list of ids, or "all".', "all"),
  mode: selector('Mode id, list of ids, "shown" or "all".', "shown")
}

export const operations = {
  tabs: mapped<TabsResponse, TabSummary[]>(
    "tabs",
    {},
    object({ tabs: { type: "array", items: tabSchema } }),
    (tabs) => ({ tabs })
  ),
  state: operation<Record<string, unknown>>("state", { tab }, stateSchema),
  status: operation<StatusResponse>(
    "status",
    {
      tab,
      summary: boolean("Add each unsaved file's designs and token values, and the undo and redo labels."),
      limit: limit("Most ids or labels in each list of the summary.", 10, 100)
    },
    statusSchema
  ),
  modes: operation<ModesResponse>(
    "modes",
    {
      tab,
      design: text("Design id or name. With it, just that design, with each of its frames' sizes.")
    },
    modesSchema
  ),
  open: operation<TabSummary>("open", { root }, tabSchema),
  screenshot: mapped<ExecResponse, ExecReply>(
    "screenshot",
    {
      tab,
      design,
      scale,
      state: selector('State id, list of ids, or "all". Defaults to the state the design shows.'),
      mode: selector('Mode id, list of ids, "shown" or "all". Defaults to the primary mode.')
    },
    execOutputSchema,
    (reply) => execResponse(reply, ["tab", "design", "scale", "state", "mode"]),
    { failed: executionFailed, structured: structuredExec }
  ),
  problems: operation<ProblemsResponse>("problems", checks, problemsSchema, {
    failed: (result) => result.problems.length > 0
  }),
  accessibility: operation<AccessibilityResponse>("accessibility", checks, accessibilitySchema, {
    failed: (result) => result.findings.length > 0
  }),
  console: mapped<ConsoleResponse, { tab: { id: string; name: string }; entries: ConsoleEntry[] }>(
    "console",
    {
      tab,
      clear: boolean("Empty the console after reading, including entries beyond limit."),
      limit: limit("Most entries to return, newest kept.", 50, 1000)
    },
    consoleSchema,
    ({ tab: from, entries }, request) => {
      const { items, total, truncated } = bounded(entries, Number(request.limit), "last")
      return { tab: from, entries: items, total, truncated }
    }
  ),
  tokens: mapped<TokensResponse, TokenInfo[]>(
    "tokens",
    {
      tab,
      category: text("Token category."),
      source: text("Token source, such as semantic or theme."),
      search: {
        schema: { type: "string", description: "Token name search." },
        read(value) {
          if (value !== undefined && typeof value !== "string") throw invalidInput("search", "search must be a string")
          return value
        }
      },
      limit: limit("Most tokens to return.", 100, 1000)
    },
    tokensSchema,
    (tokens, request) => {
      const { items, total, truncated } = bounded(tokens, Number(request.limit))
      return { tokens: items, total, truncated }
    }
  ),
  components: operation<ComponentsResponse>("components", { tab }, componentsSchema),
  props: operation<PropsResponse>(
    "props",
    {
      tab,
      component: text("Component id or name.", true),
      all: boolean("Include passed-through attributes.")
    },
    propsSchema
  )
}

const skill = fieldsContract({ path: text("Skill file to read.", false, "SKILL.md") })
export const skillOperation = {
  inputSchema: skill.inputSchema,
  fields: ["path"],
  async run(input: Record<string, unknown>, read: (path: string) => Promise<string>): Promise<string> {
    const { path } = skill.request(input)
    if (typeof path !== "string") throw invalidInput("path", "path must be a nonblank string")
    return read(path)
  }
}
