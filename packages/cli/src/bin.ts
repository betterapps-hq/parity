#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { buffer } from "node:stream/consumers"
import { parseArgs } from "node:util"
import type { JsonValue } from "@parity-app/core/schema"
import { runCheck } from "./check.ts"
import {
  call,
  describeAccessibility,
  describeComponents,
  describeConsole,
  describeExec,
  describeModes,
  describeProblems,
  describeProps,
  describePhotos,
  describePlace,
  describeReferences,
  describeReport,
  describeStatus,
  describeTokens
} from "./client.ts"
import { describeDiagnostics, writeDiagnostics } from "./diagnostics.ts"
import { invalidInput, operationError } from "./errors.ts"
import { executeOperation } from "./execute.ts"
import { runLib } from "./lib.ts"
import { describeLogs, logsFields, readLogs } from "./logs.ts"
import { serveMcp } from "./mcp.ts"
import { type Operation, type OperationInput, operations, skillOperation } from "./operations.ts"
import { stderr, stdout } from "./output.ts"
import { readSkill } from "./skills.ts"
import { inCliRun, reportCliFailure, startCliTelemetry } from "./telemetry.ts"

const usage = `parity: drive the Parity app from a terminal or an agent

  parity tabs                               list open project tabs
  parity state [--tab t]                    designs, selection, modes, components and tokens of a tab
  parity status [--summary] [--limit 10] [--tab t]
                                            the tab's revision, whether anything applied isn't saved, the files and
                                            token values waiting for Save, the last save and failed writes, and undo
                                            and redo; --summary names the designs, tokens and steps
  parity modes [design] [--tab t]           viewports (the ids Responsive takes), variables, modes (the ids renders
                                            take) and what each design shows; a design adds its frames' sizes
  parity exec [file] --label "Do x"         run a snippet (from a file, or stdin) as one undoable step
       [--edit-id id --edits '[{"find":"a","replace":"b"}]']   retry a failed snippet with edits
  parity screenshot <design> [--state s|all] [--mode m|shown|all] [--scale 2] [--tab t]
  parity a11y <design> [--state s|all] [--mode m|shown|all] [--tab t]
                                            check accessibility with axe-core, in every state and the modes shown
                                            unless narrowed; exits with 1 when it finds issues
  parity problems <design> [--state s|all] [--mode m|shown|all] [--tab t]
                                            render errors, overflow, clipping and unknown components, in every state
                                            and the modes shown unless narrowed; exits with 1 when it finds any
  parity console [--clear] [--limit 50] [--tab t]
                                            what the project's code wrote to the console, on the canvas and in
                                            offscreen renders, the newest 50 unless --limit says; --clear empties it
                                            after reading
  parity tokens [--category c] [--source semantic|theme] [--search s] [--limit 100] [--tab t]
                                            the tokens styles can name, with their values per theme, the first 100
                                            unless --limit says
  parity components [--tab t]               the components designs can use, by library
  parity props <Component> [--all] [--tab t]
                                            a component's props from its source, then what it goes inside and holds,
                                            with an example to insert; --all adds the attributes it passes on
  parity lib [package] [--root dir] [--out file|-] [--registry] [--id id] [--name n] [--range r] [--json]
       [--only new|all|A,B] [--edits file] [--no-examples] [--no-tags]
                                            write a .lib.par: a package's components, tokens, breakpoints, icons and
                                            decorators, found from its types and styles, with each part's parents and
                                            what it needs to render, tried with React's server renderer. Without a
                                            package, the app at --root (the current folder) is described, into the
                                            .lib.par at its root. Runs without the app; --registry writes into
                                            Parity's own registry. Over an existing file it reports new, changed and
                                            removed components; --only new or --only A,B writes just those, keeping
                                            the rest as they were. Hand edits (the file's edits, or a shared --edits
                                            file) are kept, and any whose export has gone are reported. Parts
                                            and samples come first from the library's own examples and stories,
                                            fetched from its repository at the commit the installed version was
                                            published from (cached under ~/.parity/cache); --no-examples skips them.
                                            An icon set's tags are read from its published metadata on npm at the
                                            same version; --no-tags skips them. A package named with a version or
                                            tag (lucide-react@1.63.0, lucide-react@latest) is installed on its own at
                                            that version, under ~/.parity/cache, rather than read from a project;
                                            so is one written with --registry and no --root, at the version its
                                            registry file covers. A file written over keeps its range while it
                                            covers the version read
  parity lib check <library> [--mode m] [--json] [--record] [--tab t]
                                            insert every component of a registry library file into the tab's
                                            project, once alone and once as the Assets panel inserts it, inside its
                                            parents with its sample, and report the parts that fail alone but render
                                            inside; exits with 1 below the library's floor in the registry's
                                            in-app.json. --record keeps why parts failed in the registry's app-errors,
                                            where parity lib --registry reads the parents they name
  parity logs [--level warn] [--process main] [--trace id] [--test-run r] [--since 10m] [--session id|all]
       [--limit 100]                        Parity's own events from its local log, newest last: the last run's
                                            unless --session, --trace or --test-run says, the newest 100 unless
                                            --limit says. Runs without the app, with diagnostics on or off
  parity diagnostics [--out file]           write a zip of what Help > Report a problem sends: the last hour of the
                                            local log, versions, projects and the latest crash, for a bug filed by
                                            hand. Runs without the app
  parity report "<what's wrong>" [--design d] [--state s] [--node n] [--test-run r] [--tab t]
                                            report a problem in Parity itself, even when nothing failed: a Sentry
                                            feedback with a screenshot of the window, its replay, this command's trace
                                            and frames of the design named, tagged with what it's about and the test
                                            pass (PARITY_TEST_RUN unless --test-run says). Prints its link
  parity references "<screen>" [--platform web|ios] [--deep] [--limit 6] [--exclude id]
                                            search Mobbin for screens from real apps, one screen per search, with
                                            the key Parity holds; prints each app, link and id, and saves each
                                            preview under ~/.parity/references. --deep reads intent and keeps strong
                                            matches, spending Mobbin AI credits; --exclude (repeated) leaves out
                                            screens already seen; --connector names the source. Exits with 1 when
                                            the search itself is wrong or the source fails, not when Parity has no key
  parity photos "<subject>" [--orientation landscape|portrait|squarish] [--color c] [--limit 6] [--page 1]
                                            search Unsplash for stock photos, one subject per search, the same way;
                                            --color keeps to one of Unsplash's colors, as teal or black_and_white,
                                            and --page 2 brings the next ones. Credit the photographer and Unsplash
  parity place <connector> <id> "<design/node>" [--prop src] [--state s] [--tab t]
                                            put a photo a search found into an image node, as "home/photo", or a
                                            component's --prop, as one undoable edit from the source's own link;
                                            Parity tells the source it was used. Exits with 1 when it wasn't placed
  parity open <folder>                      open a project in a new tab
  parity skill [file]                       print the design skill, or one of its files
  parity mcp                                serve these as MCP tools on stdio

Options take a tab id, project root or name with --tab, or "active" for what the person is looking at; without it, a
command acts on the open project the current folder is in, else on "active". Each call goes to the running copy of
Parity that has its project open. --json prints any command's
result as the data MCP returns as structuredContent, and a failure as {"error": {code, message, retryable, path,
alternatives, editId}}.`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    tab: { type: "string" },
    label: { type: "string" },
    "edit-id": { type: "string" },
    edits: { type: "string" },
    state: { type: "string", multiple: true },
    mode: { type: "string", multiple: true },
    scale: { type: "string" },
    json: { type: "boolean" },
    record: { type: "boolean" },
    clear: { type: "boolean" },
    summary: { type: "boolean" },
    all: { type: "boolean" },
    category: { type: "string" },
    source: { type: "string" },
    search: { type: "string" },
    limit: { type: "string" },
    root: { type: "string" },
    out: { type: "string" },
    registry: { type: "boolean" },
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    range: { type: "string" },
    only: { type: "string" },
    "no-examples": { type: "boolean" },
    "no-tags": { type: "boolean" },
    level: { type: "string" },
    process: { type: "string" },
    trace: { type: "string" },
    "test-run": { type: "string" },
    design: { type: "string" },
    node: { type: "string" },
    since: { type: "string" },
    session: { type: "string" },
    connector: { type: "string" },
    prop: { type: "string" },
    platform: { type: "string" },
    deep: { type: "boolean" },
    exclude: { type: "string", multiple: true },
    orientation: { type: "string" },
    color: { type: "string" },
    page: { type: "string" },
    help: { type: "boolean", short: "h" }
  }
})

const [command, ...rest] = positionals

/** The running command's input fields, which a failure's path can point at. */
let fields: readonly string[] | undefined

// Each run is recorded with the flags it was given, by name, never their values (PAR-641).
try {
  startCliTelemetry({ serving: command === "mcp" })
  await inCliRun(command ?? "help", Object.keys(values), main)
} catch (error) {
  reportCliFailure(error)
  const failure = operationError(error, fields)

  if (values.json) {
    print({ error: failure })
  }

  stderr(failure.message)
  process.exitCode = 1
}

async function main(): Promise<void> {
  if (!command || values.help) {
    stdout(usage)

    return
  }

  const limit = values.limit === undefined ? undefined : Number(values.limit)

  switch (command) {
    case "tabs":
      return show(operations.tabs, {})
    case "state":
      return show(operations.state, { tab: values.tab })
    case "status":
      return show(operations.status, { tab: values.tab, summary: values.summary, limit }, describeStatus)
    case "modes":
      return show(operations.modes, { tab: values.tab, design: rest[0] }, describeModes)
    case "open":
      return show(operations.open, { root: rest[0]?.trim() ? resolve(rest[0]) : rest[0] })
    case "skill":
      fields = skillOperation.fields
      stdout(await skillOperation.run({ path: rest[0] }, readSkill))

      return
    case "mcp":
      serveMcp()

      return
    case "lib":
      if (rest[0] === "check") {
        // An empty flag counts as unset, here and for `parity lib`.
        return runCheck(rest[1], {
          tab: values.tab || undefined,
          mode: values.mode?.[0] || undefined,
          json: values.json,
          record: values.record
        })
      }

      return runLib(rest[0], {
        root: values.root || undefined,
        out: values.out || undefined,
        registry: values.registry,
        id: values.id || undefined,
        name: values.name || undefined,
        description: values.description || undefined,
        range: values.range || undefined,
        only: values.only || undefined,
        noExamples: values["no-examples"],
        noTags: values["no-tags"],
        edits: values.edits || undefined,
        json: values.json
      })
    case "exec": {
      fields = executeOperation.fields
      const editId = values["edit-id"]
      let code: string | undefined

      if (rest[0]) {
        code = await readFile(rest[0], "utf8")
      } else if (!editId) {
        code = (await stdin()) || undefined
      }

      let edits: JsonValue | undefined

      try {
        edits = values.edits === undefined ? undefined : JSON.parse(values.edits)
      } catch {
        throw invalidInput("edits", "edits must be JSON: a list of {find, replace}")
      }

      const result = await executeOperation.run({ tab: values.tab, label: values.label, code, editId, edits }, call)

      if (values.json) {
        print(executeOperation.structured(result))
      } else {
        stdout(describeExec(result))
      }

      if (executeOperation.failed(result)) {
        process.exitCode = 1
      }

      return
    }

    case "screenshot":
      return show(
        operations.screenshot,
        {
          tab: values.tab,
          design: rest[0],
          state: values.state,
          mode: values.mode,
          scale: values.scale === undefined ? undefined : Number(values.scale)
        },
        describeExec
      )
    case "a11y":
    case "accessibility":
      return show(
        operations.accessibility,
        { tab: values.tab, design: rest[0], state: values.state, mode: values.mode },
        describeAccessibility
      )
    case "problems":
      return show(
        operations.problems,
        { tab: values.tab, design: rest[0], state: values.state, mode: values.mode },
        describeProblems
      )
    case "tokens":
      return show(
        operations.tokens,
        { tab: values.tab, category: values.category, source: values.source, search: values.search, limit },
        describeTokens
      )
    case "components":
      return show(operations.components, { tab: values.tab }, describeComponents)
    case "props":
      return show(operations.props, { tab: values.tab, component: rest[0], all: values.all }, describeProps)
    case "logs": {
      fields = logsFields

      const result = readLogs({
        level: values.level,
        process: values.process,
        trace: values.trace,
        testRun: values["test-run"],
        since: values.since,
        session: values.session,
        limit
      })

      if (values.json) {
        print(result)
      } else {
        stdout(describeLogs(result))
      }

      return
    }

    case "diagnostics": {
      fields = ["out"]
      const result = writeDiagnostics(values.out ? { out: values.out } : {})

      if (values.json) {
        print(result)
      } else {
        stdout(describeDiagnostics(result))
      }

      return
    }

    case "report":
      return show(
        operations.report,
        {
          tab: values.tab,
          message: rest.join(" ") || undefined,
          design: values.design,
          state: values.state?.[0],
          node: values.node,
          testRun: values["test-run"]
        },
        describeReport
      )
    case "references":
      return show(
        operations.references,
        {
          tab: values.tab,
          query: rest.join(" ") || undefined,
          connector: values.connector,
          platform: values.platform,
          depth: values.deep ? "deep" : undefined,
          limit,
          exclude: values.exclude
        },
        describeReferences
      )
    case "photos":
      return show(
        operations.photos,
        {
          tab: values.tab,
          query: rest.join(" ") || undefined,
          connector: values.connector,
          orientation: values.orientation,
          color: values.color,
          limit,
          page: values.page === undefined ? undefined : Number(values.page)
        },
        describePhotos
      )
    case "place":
      return show(
        operations.place,
        {
          tab: values.tab,
          connector: rest[0],
          id: rest[1],
          node: rest[2],
          prop: values.prop,
          state: values.state?.[0]
        },
        describePlace
      )
    case "console":
      return show(operations.console, { tab: values.tab, clear: values.clear, limit }, describeConsole)
    default:
      throw invalidInput(
        undefined,
        `Unknown command ${command}

${usage}`
      )
  }
}

/**
 * Runs a shared operation and prints it: the structured result with --json, the same data MCP returns as
 * structuredContent, or the account for people. A failure exits with 1 either way.
 */
async function show<Result>(
  operation: Operation<Result>,
  input: OperationInput,
  describe?: (result: Result) => string
): Promise<void> {
  fields = operation.fields
  const result = await operation.run(input, call)

  if (values.json || !describe) {
    print(operation.structured(result))
  } else {
    stdout(describe(result))
  }

  if (operation.failed(result)) {
    process.exitCode = 1
  }
}

function print<Value>(value: Value): void {
  stdout(JSON.stringify(value, null, 2))
}

async function stdin(): Promise<string> {
  return (await buffer(process.stdin)).toString("utf8")
}
