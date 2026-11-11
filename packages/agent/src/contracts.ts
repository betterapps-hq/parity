/**
 * What agents send Parity and what it answers, as zod schemas (PAR-590): each RPC method's params and its result. The
 * CLI and its MCP server check agents' requests with them, publish them to MCP clients as JSON Schema, and check the
 * app's answers before reading them. The app checks what it's sent with the same schemas (PAR-598). Nothing here
 * touches files or the network, or loads the rest of core or the agent's workspace, so the CLI starts quickly.
 */

import { CodedError } from "@parity-app/core/errors"
import { propGroups, propKinds } from "@parity-app/core/props"
import { checkData, jsonText, plainObject } from "@parity-app/core/schema"
import { z } from "zod"

// Requests. Each message names its field, as the CLI has always worded them, so it reads on its own in a terminal,
// which doesn't show the path.

/**
 * Checks an agent's request: returns what the schema reads, with its defaults, or throws `invalid_input` with the
 * schema's message and the field at fault as its path. `depth` stops the path that many fields in: an operation's
 * fields are flat, so a bad item in a list of modes points at `mode`. A field set to `undefined` counts as left out,
 * as a terminal's missing options leave it.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what an agent sent, read here
export function readRequest<T extends z.ZodType>(schema: T, input: unknown, depth = Infinity): z.output<T> {
  const sent = plainObject.safeParse(input).data
  const given = sent ? Object.fromEntries(Object.entries(sent).filter(([, value]) => value !== undefined)) : input
  const checked = checkData(schema, given)

  if (checked.success) {
    return checked.data
  }

  const field = checked.problem.pointer
    .split("/")
    .slice(1, depth + 1)
    .join("/")

  throw new CodedError(checked.problem.message, field ? { code: "invalid_input", field } : { code: "invalid_input" })
}

/**
 * A request's JSON Schema, as MCP's `tools/list` publishes it: what an agent may send, with the defaults. It leaves out
 * `$schema`, since MCP reads 2020-12 without it and every tool would pay for it in the list's 12 KiB (PAR-510).
 */
export function requestJsonSchema(schema: z.ZodType) {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { io: "input" })

  return json
}

/** Text with something besides whitespace, kept as written, since a snippet is sent as it is. */
function nonblank(message: string) {
  return z.string(message).min(1, message).regex(/\S/, message)
}

function text(name: string, description: string) {
  return nonblank(`${name} must be a nonblank string`).describe(description)
}

/** One id, a list of them, or a word such as "all", as renders take a state and a mode. */
function selector(name: string) {
  const message = `${name} must be a nonblank string or a nonempty list of nonblank strings`
  const item = nonblank(message)

  return z.union([item, z.array(item, message).min(1, message)], message)
}

/** A one-item list as its item, as the app has always been sent it. */
function single(value: string | string[]): string | string[] {
  return Array.isArray(value) && value.length === 1 ? value[0]! : value
}

function flag(name: string, description: string) {
  return z.boolean(`${name} must be a boolean`).default(false).describe(description)
}

/** How many items a list read returns at most: a default that keeps a reply small, and a ceiling. */
function limit(description: string, fallback: number, most: number) {
  const message = `limit must be a whole number from 1 to ${most}`

  return z.int(message).min(1, message).max(most, message).default(fallback).describe(description)
}

// The fields `z.strictObject` takes, by its own parameter rather than zod's internal name for them.
type ObjectFields = NonNullable<Parameters<typeof z.strictObject>[0]>

/** An operation's input: these fields and no others, in an object. */
function fields<Fields extends ObjectFields>(entries: Fields) {
  return z.strictObject(entries, {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Unknown input field ${issue.keys[0] ?? ""}`
        : "Operation input must be an object"
  })
}

/** What every call's tab field says, the same in the CLI's help, MCP tools and the skill (PAR-514). */
const tabDescription =
  'Tab id, project root or name, or "active" for what the person is looking at. Defaults to the open project the ' +
  'current folder is in, else "active".'

const tab = text("tab", tabDescription).optional()

/** Which source a search asks, by its connector's id. Without one, any that finds the kind. */
const connector = z
  .string("connector must be a connector's id, from a result")
  .optional()
  .describe("A connector's id, from a result. Defaults to any.")

/**
 * A filter a search names by the connector's own id for it. Main checks the value against the connector that runs the
 * search, so a second source of the same kind with other values takes them without a change here.
 */
function filter(name: string, description: string) {
  return text(name, description).optional()
}

/** Results already shown, for a source that gives more by leaving them out. Main says which way the source pages. */
const exclude = z
  .array(nonblank("exclude must be a list of ids"), "exclude must be a list of ids")
  .max(100, "exclude takes up to 100 ids")
  .optional()
  .describe("Ids already seen, for more.")

/** The page of results, for a source that gives more by page. */
const page = z.int("page must be a whole number").min(1, "page must be 1 or more").optional().describe("Next page.")

const design = text("design", "Design id or name.")
const scaleMessage = "scale must be a finite number from 0.25 to 3"
const scale = z.number(scaleMessage).min(0.25, scaleMessage).max(3, scaleMessage).default(1).describe("Pixel density.")
const absoluteRoot = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/
const blankRoot = "root must be a nonblank string"

/** A project folder. Being absolute already rules out blank text, so the schema publishes only that pattern. */
const root = z
  .string(blankRoot)
  .min(1, blankRoot)
  .refine((path) => /\S/.test(path), blankRoot)
  .regex(absoluteRoot, "root must be an absolute project folder path")
  .describe("Absolute project folder path.")

/** A render's frames: every state and the modes the design shows, unless the call narrows them. */
const checks = {
  tab,
  design,
  state: selector("state").default("all").transform(single).describe('State id, list of ids, or "all".'),
  mode: selector("mode").default("shown").transform(single).describe('Mode id, list of ids, "shown" or "all".')
}

const defaultLabel = "Edit designs"
const nothingToRun = "Nothing to run: pass a snippet, or an editId with edits"
const codeMessage = "code must be a nonblank string"
const findMessage = "Each edit needs a nonempty find string"

/** One exact find and replace edit to a failed snippet. */
const edit = z.strictObject(
  {
    find: z.string(findMessage).min(1, findMessage),
    replace: z.string("Each edit needs a replace string"),
    all: z.boolean("Edit all must be a boolean").optional()
  },
  { error: (issue) => (issue.code === "unrecognized_keys" ? "Unknown edit field" : "Each edit must be an object") }
)

/** Execute's fields. A snippet and a retry take different ones; MCP names label and code description and input. */
const execute = {
  tab,
  label: nonblank("label must be a nonblank string")
    .default(defaultLabel)
    .describe('Shown while it runs. Prefer 3 to 8 words, e.g. "Add pricing tiers".'),
  code: z
    .string({ error: (issue) => (issue.input === undefined ? nothingToRun : codeMessage) })
    .min(1, codeMessage)
    .regex(/\S/, codeMessage)
    .describe("The snippet. Omit when retrying with editId."),
  editId: text("editId", "The failed call's editId, to retry with edits."),
  edits: z
    .array(edit, "edits must be an array")
    .default([])
    .describe("Exact find and replace edits to the failed snippet, applied in order.")
}

/** A field only the other kind of request takes: a snippet with an editId, or retry edits with no editId. */
function misplaced(keys: readonly string[]): string {
  if (keys.includes("editId") || keys.includes("code")) {
    return "Pass a snippet or an editId, not both"
  }

  if (keys.includes("edits")) {
    return "edits requires an editId"
  }

  return `Unknown input field ${keys[0] ?? ""}`
}

function executeKind<Fields extends ObjectFields>(entries: Fields) {
  return z.strictObject(entries, {
    error: (issue) => (issue.code === "unrecognized_keys" ? misplaced(issue.keys) : "Operation input must be an object")
  })
}

/**
 * Each operation's input by RPC method, as the CLI and MCP take it and the app is sent it. Execute's is a snippet to
 * run, or a failed snippet's editId with edits to it (PAR-451).
 */
export const requests = {
  tabs: fields({}),
  state: fields({ tab }),
  status: fields({
    tab,
    summary: flag("summary", "Add each unsaved file's designs and token values, and the undo and redo labels."),
    limit: limit("Most ids or labels in each list of the summary.", 10, 100)
  }),
  modes: fields({
    tab,
    design: text("design", "Design id or name. With it, just that design, with each of its frames' sizes.").optional()
  }),
  open: fields({ root }),
  screenshot: fields({
    tab,
    design,
    scale,
    state: selector("state")
      .transform(single)
      .optional()
      .describe('State id, list of ids, or "all". Defaults to the state the design shows.'),
    mode: selector("mode")
      .transform(single)
      .optional()
      .describe('Mode id, list of ids, "shown" or "all". Defaults to the primary mode.'),
    sheet: flag("sheet", "One labeled image of every frame instead of one per frame.")
  }),
  problems: fields(checks),
  accessibility: fields(checks),
  console: fields({
    tab,
    clear: flag("clear", "Empty the console after reading, including entries beyond limit."),
    limit: limit("Most entries to return, newest kept.", 50, 1000)
  }),
  tokens: fields({
    tab,
    category: text("category", "Token category.").optional(),
    source: text("source", "Token source, such as semantic or theme.").optional(),
    search: z.string("search must be a string").optional().describe("Token name search."),
    limit: limit("Most tokens to return.", 100, 1000)
  }),
  components: fields({ tab }),
  props: fields({
    tab,
    component: text("component", "Component id or name."),
    all: flag("all", "Include passed-through attributes.")
  }),
  report: fields({
    tab,
    message: text("message", "What you did, expected and saw."),
    design: text("design", "Design id or name; its frames go with it.").optional(),
    state: text("state", "State id. Defaults to the shown one.").optional(),
    node: text("node", "Node id.").optional(),
    testRun: text("testRun", "Test pass. Defaults to PARITY_TEST_RUN.").optional()
  }),
  references: fields({
    tab,
    query: text(
      "query",
      'One screen: its type, then up to three parts, as "paywall with a free trial". No platform, style words or negations. Name an app for only its screens.'
    ),
    connector,
    platform: filter("platform", "ios for phone apps, or web. Defaults to web."),
    depth: filter("depth", "deep keeps strong matches, for searches with parts; it spends the source's AI credits."),
    limit: limit("Most screens.", 6, 20),
    exclude,
    page
  }),
  media: fields({
    tab,
    query: text("query", 'One subject, as "desk by a window".'),
    connector,
    type: filter("type", "photos (default), illustrations, vectors or videos."),
    orientation: filter("orientation", "horizontal or vertical."),
    color: filter("color", "One color, as blue, grayscale or transparent."),
    limit: limit("Most results.", 6, 20),
    exclude,
    page
  }),
  place: fields({
    tab,
    connector: text("connector", "The result's connector, from the search."),
    id: text("id", "The result's id, from a search."),
    node: text("node", 'The image or video, or a component with a prop that takes it, as design/node: "home/photo".'),
    prop: text("prop", "A component's prop that takes the picture or video. Defaults to src.").optional(),
    state: text("state", "State id, for a component's prop in one state.").optional()
  }),
  placedReferences: fields({
    tab,
    design: text("design", "Design id or name, for only its references.").optional(),
    limit: limit("Most pictures; each is a whole screen.", 6, 20)
  }),
  images: fields({
    tab,
    search: text("search", "Text in a name, alt text or credit.").optional(),
    unused: flag("unused", "Only images no design or code uses."),
    limit: limit("Most images.", 50, 500)
  }),
  removeImage: fields({
    tab,
    image: text("image", "Path, address (/images/hero.png) or file name.")
  }),
  exec: z.union([
    executeKind({ tab: execute.tab, label: execute.label, code: execute.code }),
    executeKind({ tab: execute.tab, label: execute.label, editId: execute.editId, edits: execute.edits })
  ])
}

/** Reading the skill or a file it references, which the CLI does on its own, with no app. */
export const skillRequest = fields({ path: text("path", "Skill file to read.").default("SKILL.md") })

/**
 * What the CLI posts to the app's `/rpc` endpoint, as JSON text (PAR-598): the method, its params, who's calling when
 * the CLI or MCP knows, and whether it came through the CLI or MCP. The app checks the params with the method's own
 * schema in `requests`, and reads the caller and transport leniently, since they're only shown on the canvas and
 * recorded in telemetry (PAR-641).
 */
export const rpcRequest = jsonText(
  z.object(
    {
      method: z.string("method must be a string"),
      params: z.unknown().optional(),
      agent: z.unknown().optional(),
      agentId: z.unknown().optional(),
      client: z.unknown().optional(),
      transport: z.unknown().optional()
    },
    "The request must be a JSON object"
  )
)

// Answers, as the app sends them. A field that older copies of the app leave out is optional and says so. Objects
// stay open, so a field a newer copy adds passes through to agents rather than failing the check.

/** What the app answers over HTTP: the method's result, or the error with its details when it knew the cause. */
export const rpcReply = z.looseObject({
  result: z.unknown().optional(),
  error: z.string().optional(),
  details: z.unknown().optional()
})

const strings = z.array(z.string())
const ref = z.looseObject({ id: z.string(), name: z.string() })
const number = z.number()

/** One open project. */
const tabSummary = z.looseObject({
  id: z.string(),
  name: z.string(),
  root: z.string(),
  active: z.boolean(),
  status: z.enum(["loading", "ready", "error"]),
  error: z.string().optional(),
  designs: z.int().describe("How many designs the project has.")
})

/** One design on the canvas, and where its board is. Its size is missing until its board has been drawn. */
const designSummary = z.looseObject({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  file: z.string(),
  x: number,
  y: number,
  width: number.optional(),
  height: number.optional(),
  states: z.array(ref),
  showing: z.looseObject({ state: z.string(), mode: z.string(), beside: strings }),
  nodes: z.int(),
  references: z
    .int()
    .optional()
    .describe("How many references are on the canvas for it, which get_references shows. Missing when none.")
})

const overlap = z.looseObject({
  designs: strings,
  names: strings,
  width: number.optional().describe("How far they share, title band included."),
  height: number.optional(),
  titleOnly: z.boolean().optional().describe("Only the lower board's title covers the other; the boards are clear."),
  estimated: z
    .boolean()
    .optional()
    .describe("One isn't drawn yet, so its size is estimated from its frames. Absent: both measured.")
})

const stateReply = z.looseObject({
  tab: tabSummary,
  revision: z
    .string()
    .optional()
    .describe("Opaque; the same only while nothing in the tab has changed. Missing from a copy older than PAR-481."),
  selection: z.looseObject({ design: z.string().optional(), node: z.string().optional(), mode: z.string().optional() }),
  designs: z.array(designSummary),
  overlaps: z
    .array(overlap)
    .describe(
      "Every pair of boards on the canvas that's too close, as execute's Overlaps() lists them. A pair with " +
        "titleOnly doesn't collide: the lower board's title covers the upper one."
    ),
  modes: z
    .array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        width: number,
        primary: z
          .boolean()
          .describe("The project's first mode: every design's main frame unless it picks another. Only one is.")
      })
    )
    .describe("The project's modes, primary first."),
  components: strings,
  tokens: z.looseObject({ count: z.int(), semantic: strings, themeCategories: strings }),
  viewport: plainObject.optional(),
  detection: plainObject.optional()
})

const historySide = z.looseObject({
  count: z.int(),
  labels: strings.optional().describe("With summary: newest first, up to limit.")
})

const statusReply = z.looseObject({
  tab: ref,
  revision: z
    .string()
    .describe("Opaque; the same only while nothing in the tab has changed. Compare it with state's revision."),
  dirty: z.boolean().describe("Something applied (and undoable) isn't on disk yet."),
  autosave: z.boolean().describe("Changes save themselves; otherwise they wait for the person's Save."),
  unsaved: z.array(
    z.looseObject({
      path: z.string(),
      kind: z.enum(["document", "stylesheet"]),
      designs: z.looseObject({ added: strings, changed: strings, removed: strings }).optional(),
      modes: z.boolean().optional(),
      tokens: strings.optional(),
      more: z.int().optional()
    })
  ),
  tokenEdits: z.int().describe("Token values waiting for Save to write them to the stylesheet."),
  save: z.looseObject({ status: z.enum(["saved", "unsaved", "saving", "failed"]), error: z.string().optional() }),
  errors: z.array(z.looseObject({ path: z.string(), error: z.string() })),
  undo: historySide,
  redo: historySide
})

const modeOption = z.looseObject({
  id: z.string(),
  name: z.string(),
  width: number.optional(),
  height: number.optional(),
  device: z.string().optional(),
  className: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional()
})

const modesReply = z.looseObject({
  tab: ref,
  variables: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      kind: z.enum(["viewport", "theme", "locale", "custom"]),
      options: z.array(modeOption)
    })
  ),
  viewports: z
    .array(
      z.looseObject({ id: z.string(), name: z.string(), width: number, height: number, device: z.string().optional() })
    )
    .describe("Viewport ids, which Responsive and a node's responsive patches take. Not mode ids."),
  modes: z
    .array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        primary: z.boolean(),
        viewport: z.string(),
        width: number,
        height: number,
        values: z.record(z.string(), z.string()),
        classNames: strings,
        attributes: z.record(z.string(), z.string())
      })
    )
    .describe("Mode ids, which renders (screenshot, problems, accessibility) and a design's modes take."),
  designs: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      state: z.string(),
      states: strings,
      main: z.string(),
      beside: strings,
      frames: z
        .array(
          z.looseObject({
            mode: z.string(),
            width: number,
            height: number.optional().describe("Fixed frame height, which clips; absent when it grows."),
            window: z.looseObject({ width: number, height: number })
          })
        )
        .optional()
    })
  )
})

const warningGroup = z.looseObject({
  category: z
    .string()
    .describe(
      "Stable: render_failed, unknown_component, unknown_component_design, unknown_prop, invalid_option, " +
        "not_a_token, not_a_length_token, overlap, title_clearance, canvas_overlaps, kind_changed or " +
        "unnamed_layout. overlap and title_clearance cover boards this call created, changed or moved: " +
        "overlap when two boards collide, title_clearance when they're clear but one's title covers the other. " +
        "canvas_overlaps counts the rest of the canvas's; call Overlaps() to check every board."
    ),
  severity: z
    .enum(["error", "warning", "suggestion"])
    .describe("error: a render failed, so a check or screenshot is missing. suggestion: worth doing, not wrong."),
  message: z.string().describe("What's wrong and what to do about it."),
  count: z.int().min(1).describe("How many places it was found."),
  at: strings.describe("Every place: a node's design/node path, or a frame. Empty for a whole board.")
})

const discarded = z.looseObject({
  design: z.string(),
  replaced: z.string().describe("The node Replace swapped out."),
  replacement: z.string().describe("The node that took its place."),
  nodes: z.array(
    z.looseObject({
      id: z.string().describe("The old node's id, or instance/inner path."),
      name: z.string().optional(),
      viewports: strings.optional().describe("Viewport ids it had responsive patches for."),
      states: strings.optional().describe("State ids it had patches in."),
      variants: strings.optional().describe("Variant options it had patches in, as param=option.")
    })
  )
})

/** A snippet's or a screenshot's result: a failure's message, with its details beside it when the app knew the cause. */
const execReply = z.looseObject({
  ok: z.boolean(),
  applied: z.boolean().describe("Changes landed on the canvas as one undoable step."),
  output: strings.describe("Lines from Print."),
  warnings: strings.describe("One line per warning group, places first."),
  warningGroups: z
    .array(warningGroup)
    .optional()
    .describe(
      "The warnings as data, in the same order: each finding once, with how many places and which. Errors come " +
        "first, then warnings, then suggestions. Missing from a copy older than PAR-460."
    ),
  error: z.string().optional(),
  details: z.unknown().optional(),
  editId: z.string().optional(),
  created: z.record(z.string(), z.string()).describe("Names of designs and nodes created, mapped to their ids."),
  discarded: z
    .array(discarded)
    .optional()
    .describe(
      "Patches each Replace threw away with the node it swapped out. Present only when there were some; reapply " +
        "what's still wanted to the replacement with Responsive, Update with a state, or UpdateState."
    ),
  screenshots: z.array(
    z.looseObject({
      path: z.string().describe("Where the PNG was saved."),
      png: z.string(),
      design: z.string(),
      state: z.string(),
      mode: z.string()
    })
  ),
  sheets: z
    .array(
      z.looseObject({
        design: z.string(),
        path: z.string().describe("Where the PNG was saved."),
        png: z.string(),
        width: z.int(),
        height: z.int(),
        scale: z.number().describe("Sheet pixels per CSS pixel."),
        frames: z
          .array(
            z.looseObject({
              state: z.string(),
              mode: z.string(),
              x: z.int(),
              y: z.int(),
              width: z.int(),
              height: z.int()
            })
          )
          .describe("Where each frame is on the sheet, in its pixels.")
      })
    )
    .optional()
    .describe("With sheet, one per design, in place of screenshots.")
})

/** A box in a frame, in CSS pixels from its top left corner. */
const frameBox = z.looseObject({ x: number, y: number, width: number, height: number })

/**
 * One problem in one frame. Layout problems (`frame-overflow`, `clipped`) name the node, what it overflows (the node
 * that clips it, or the frame, which has none), both boxes, and how far past each edge it reaches.
 */
const problem = z.looseObject({
  state: z.string(),
  mode: z.string(),
  kind: z
    .enum(["render-error", "unknown-component", "content-wider", "frame-overflow", "clipped", "outside-frame"])
    .optional(),
  problem: z.string(),
  node: z.string().optional(),
  name: z.string().optional(),
  box: frameBox.optional(),
  container: z.looseObject({ node: z.string().optional(), name: z.string().optional(), box: frameBox }).optional(),
  overflow: z
    .looseObject({
      left: number.optional(),
      right: number.optional(),
      top: number.optional(),
      bottom: number.optional()
    })
    .optional()
})

const problemsReply = z.looseObject({
  tab: ref,
  design: ref,
  problems: z.array(problem),
  frames: z.int(),
  warnings: strings
})

const accessibilityReply = z.looseObject({
  tab: ref,
  design: ref,
  findings: z.array(
    z.looseObject({
      state: z.string(),
      mode: z.string(),
      rule: z.string(),
      impact: z.enum(["critical", "serious", "moderate", "minor"]),
      help: z.string(),
      helpUrl: z.string(),
      node: z.string().optional(),
      name: z.string().optional(),
      detail: z.string(),
      /** For a contrast failure: the token to color the layer's text with, or `"none"` when none of the project's pass. */
      contrast: z
        .looseObject({
          fix: z.union([z.literal("none"), z.looseObject({ token: z.string(), ratio: number })]).optional()
        })
        .optional()
    })
  ),
  frames: z.int(),
  warnings: strings
})

const consoleReply = z.looseObject({
  tab: ref,
  /** Every entry the console holds, oldest first. */
  entries: z.array(
    z.looseObject({
      level: z.enum(["info", "warning", "error", "debug"]),
      text: z.string(),
      source: z.string(),
      line: z.int(),
      where: z.enum(["canvas", "offscreen"]),
      count: z.int(),
      first: number,
      last: number,
      design: z.string().optional().describe("The design that wrote it, by key (path#id), when known."),
      state: z.string().optional(),
      mode: z.string().optional()
    })
  )
})

const tokenInfo = z.looseObject({
  name: z.string(),
  category: z.string(),
  source: z.string(),
  values: z.record(z.string(), z.string()).describe("Value per theme.")
})

const componentsReply = z.looseObject({
  components: strings,
  /** The file each of the project's own components is written in, from the project root, by component (PAR-167). */
  files: z.record(z.string(), z.string()).optional(),
  iconLibraries: strings.optional(),
  /** The app's capitalised exports the type checker left out, with why. */
  leftOut: z
    .array(z.looseObject({ name: z.string(), path: z.string(), reason: z.string(), undecided: z.boolean().optional() }))
    .optional(),
  /** How many components have drawn on the canvas without errors so far. */
  drawn: z.int().optional(),
  /** Components failing to draw on the canvas now: why in words, and the kind of problem. */
  failing: z
    .array(
      z.looseObject({ id: z.string(), problem: z.enum(["provider", "server", "async", "error"]), reason: z.string() })
    )
    .optional(),
  /** The person's corrections in the main project file, saved or not: exports listed by hand. */
  corrections: z
    .looseObject({ include: z.array(z.looseObject({ path: z.string(), export: z.string() })).optional() })
    .optional()
})

/** A component's composition, as `@parity-app/editor`'s `componentComposition` reads it (PAR-454). */
const composition = z.looseObject({
  role: z
    .enum(["provider", "wrapper", "component"])
    .describe("provider draws nothing and gives parts inside it context; wrapper draws and holds other parts."),
  parents: z
    .discriminatedUnion("status", [
      z.looseObject({
        status: z.literal("listed"),
        chain: z
          .array(z.looseObject({ component: z.string(), optional: z.boolean().optional() }))
          .describe("Outermost first."),
        from: z.string().optional().describe("What said so, such as the library's examples or the error it throws.")
      }),
      z.looseObject({ status: z.literal("none") }),
      z.looseObject({ status: z.literal("unknown"), reason: z.string() })
    ])
    .describe("listed: insert it inside chain; none: it needs nothing; unknown: nothing says, see reason."),
  holds: strings.describe("Parts that go directly inside it."),
  slots: z.array(z.looseObject({ name: z.string(), key: z.string(), kind: z.enum(["children", "element", "render"]) })),
  example: z.looseObject({
    node: z.unknown().describe("A node Insert takes as it is: the component inside its parents."),
    status: z.enum(["drawn", "failing", "untried"]).describe("Whether the component has drawn on the canvas."),
    reason: z.string().optional()
  })
})

const propsReply = z.looseObject({
  component: z.string(),
  path: z.string().optional(),
  /** What the project's code imports it from: a package, or the file through the app's alias. */
  import: z.string().optional(),
  known: z.boolean(),
  props: z.array(
    z.looseObject({
      name: z.string(),
      kind: z.enum(propKinds),
      group: z.enum(propGroups),
      options: z.array(z.union([z.string(), number, z.boolean()])).optional(),
      default: z.union([z.string(), number, z.boolean(), z.null()]).optional(),
      required: z.boolean().optional(),
      type: z.string().optional(),
      description: z.string().optional()
    })
  ),
  /** What it needs around it and holds inside it. Missing from a copy older than PAR-454. */
  composition: composition.optional()
})

/** A problem an agent reported (PAR-646): the Sentry user feedback it became, and what went with it. */
const reportReply = z.looseObject({
  feedbackId: z.string().describe("The Sentry event ID of the feedback."),
  link: z
    .string()
    .describe(
      "The feedback in Sentry, beside its replay and trace. Sentry files it in Linear and links the issue there."
    ),
  traceId: z.string().optional().describe("The trace it's tied to: the call's, from the command on."),
  replayId: z.string().optional().describe("The window's replay, when it records one."),
  tags: z
    .record(z.string(), z.string())
    .describe("What it's about, as Sentry tags: tab, design, state, node, test_run."),
  attachments: strings.describe("The files sent with it: the window's screenshot, the frames and the diagnostics.")
})

/** One of the project's images (PAR-834): a file, a linked image, or a path layers name with no file. */
const projectImage = z.looseObject({
  kind: z.enum(["file", "linked", "missing"]),
  src: z.string().describe("What layers set src to."),
  path: z.string().optional().describe("The file, from the project's root."),
  name: z.string(),
  bytes: z.int().optional(),
  alt: z.string().optional(),
  credit: z.looseObject({ name: z.string(), url: z.string(), source: z.string().optional() }).optional(),
  usedBy: z
    .array(z.looseObject({ document: z.string(), design: z.string(), designName: z.string(), node: z.string() }))
    .describe("The layers that show it."),
  usedInCode: z.array(z.looseObject({ path: z.string(), line: z.int() })).describe("The lines of code that name it.")
})

const imagesReply = z.looseObject({
  images: z.array(projectImage),
  total: z.int().describe("How many matched before the limit."),
  truncated: z.boolean()
})

/** An image removed: its file, and the edit's label. */
const removeImageReply = z.looseObject({ path: z.string(), label: z.string() })

/** A picture saved for an agent to look at, as a file, with its bytes for MCP to show. */
const preview = z.looseObject({
  path: z.string().describe("Where the preview was saved."),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  data: z.string().optional().describe("The preview as base64, which MCP shows and --json leaves out.")
})

/**
 * Something a connector found (PAR-829): a screen from a real app, or a stock picture or video, the same shape from
 * every source, with its preview saved as a file for the agent to look at.
 */
const foundItem = z.looseObject({
  id: z.string().describe("The source's id, which exclude takes."),
  connector: z.string().describe("The connector that found it, which connector and place take."),
  source: z.string().describe("Where it's from, to credit."),
  kind: z.string().optional().describe("screens, photos or videos; only photos go in designs."),
  title: z.string().describe("The app's name, or what a picture shows."),
  platform: z.enum(["ios", "web"]).optional(),
  link: z.string().describe("Its page at the source."),
  width: z.int().optional(),
  height: z.int().optional(),
  credit: z
    .array(z.looseObject({ name: z.string(), url: z.string().optional() }))
    .describe("Who to credit, in order: the app or its author, then the source."),
  preview: preview.optional().describe("Missing when the preview couldn't be fetched.")
})

/** What a search found, or why it found nothing to show. */
const foundReply = z.looseObject({
  found: z.array(foundItem),
  allowance: z
    .looseObject({ remaining: z.int(), limit: z.int().optional() })
    .optional()
    .describe("Searches the source allows before turning them away, when it says."),
  problem: z
    .looseObject({
      code: z
        .string()
        .describe(
          "no-key, key-refused, no-access, rate-limited, invalid or unavailable. Only invalid is yours to fix."
        ),
      message: z.string(),
      retryAfter: number.optional().describe("Seconds to wait before searching again.")
    })
    .optional(),
  done: z.boolean().optional().describe("True when more of a search was asked for and there's no more.")
})

/** What placing a result did: the node it went in and who to credit, or why it wasn't placed. */
const placeReply = z.looseObject({
  placed: z.boolean(),
  node: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  credit: z
    .array(z.looseObject({ name: z.string(), url: z.string().optional() }))
    .optional()
    .describe("Who to credit where the design shows it, in order: its author, then the source."),
  problem: z.looseObject({ code: z.string(), message: z.string() }).optional()
})

/**
 * A reference on the canvas (PAR-889): where it's from, why it's there, who placed it, the design it's for, and its
 * picture saved for the agent to look at.
 */
const placedReference = z.looseObject({
  id: z.string().describe("Its id on the canvas, not the source's."),
  app: z.string(),
  platform: z.enum(["ios", "web"]).optional(),
  link: z.string().describe("Its page at the source."),
  picture: z.string().describe("Its picture's link."),
  expired: z.boolean().optional().describe("Set when the picture's link has stopped working."),
  query: z.string().optional().describe("The description that found it."),
  note: z.string().optional().describe("Why it's there."),
  by: z.string().optional().describe("The agent that placed it. Missing when the person did."),
  design: z
    .looseObject({ id: z.string(), name: z.string(), file: z.string() })
    .optional()
    .describe("The design it's for. Missing when it was placed for none and no design is near."),
  preview: preview.optional().describe("Missing when the picture couldn't be fetched.")
})

const placedReferencesReply = z.looseObject({
  tab: ref,
  references: z.array(placedReference),
  withoutPictures: z.int().optional().describe("How many past limit have no picture. Name a design or raise limit.")
})

/**
 * Each method's answer by RPC method, which the CLI checks before reading it. `copy` is what a copy says about itself,
 * which calls are routed by (PAR-514): its tabs, and when its window last had focus, missing from a copy too old to
 * say. A screenshot is a snippet Parity writes, so it answers as `exec` does.
 */
export const replies = {
  copy: z.looseObject({ tabs: z.array(tabSummary), focusedAt: number.optional() }),
  tabs: z.array(tabSummary),
  state: stateReply,
  status: statusReply,
  modes: modesReply,
  open: tabSummary,
  exec: execReply,
  screenshot: execReply,
  problems: problemsReply,
  accessibility: accessibilityReply,
  console: consoleReply,
  tokens: z.array(tokenInfo),
  components: componentsReply,
  props: propsReply,
  report: reportReply,
  references: foundReply,
  media: foundReply,
  place: placeReply,
  placedReferences: placedReferencesReply,
  images: imagesReply,
  removeImage: removeImageReply
}

/**
 * Each RPC method's params, as the CLI sends them once its request schema has read them, and its answer (PAR-564). The
 * CLI client asks by it and the app's dispatch answers by it, so a shape that drifts on either side fails to compile.
 * `copy` takes nothing.
 */
export type AgentMethods = {
  [M in keyof typeof replies]: {
    params: M extends keyof typeof requests ? z.output<(typeof requests)[M]> : Record<string, never>
    result: z.output<(typeof replies)[M]>
  }
}

export type AgentMethod = keyof AgentMethods

/** Whether `method` is one the app answers. */
export function isAgentMethod(method: string): method is AgentMethod {
  return Object.hasOwn(replies, method)
}
