#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { runCheck } from "./check.ts"
import {
  call,
  describeAccessibility,
  describeComponents,
  describeConsole,
  describeExec,
  describeProblems,
  describeProps,
  describeTokens,
  type ExecResponse
} from "./client.ts"
import { executeOperation } from "./execute.ts"
import { runLib } from "./lib.ts"
import { serveMcp } from "./mcp.ts"
import { operations, skillOperation } from "./operations.ts"
import { readSkill } from "./skills.ts"

const usage = `parity: drive the Parity app from a terminal or an agent

  parity tabs                               list open project tabs
  parity state [--tab t]                    designs, selection, modes, components and tokens of a tab
  parity exec [file] --label "Do x"         run a snippet (from a file, or stdin) as one undoable step
       [--edit-id id --edits '[{"find":"a","replace":"b"}]']   retry a failed snippet with edits
  parity screenshot <design> [--state s|all] [--mode m|shown|all] [--scale 2] [--tab t]
  parity a11y <design> [--state s|all] [--mode m|shown|all] [--tab t]
                                            check accessibility with axe-core, in every state and the modes shown
                                            unless narrowed; exits with 1 when it finds issues
  parity problems <design> [--state s|all] [--mode m|shown|all] [--tab t]
                                            render errors, overflow, clipping and unknown components, in every state
                                            and the modes shown unless narrowed; exits with 1 when it finds any
  parity console [--clear] [--tab t]        what the project's code wrote to the console, on the canvas and in
                                            offscreen renders; --clear empties it after reading
  parity tokens [--category c] [--source semantic|theme] [--search s] [--tab t]
                                            the tokens styles can name, with their values per theme
  parity components [--tab t]               the components designs can use, by library
  parity props <Component> [--all] [--tab t]
                                            a component's props from its source; --all adds the attributes it passes on
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
  parity open <folder>                      open a project in a new tab
  parity skill [file]                       print the design skill, or one of its files
  parity mcp                                serve these as MCP tools on stdio

Options take a tab id, project root or name with --tab; the active tab is the default.`

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
    all: { type: "boolean" },
    category: { type: "string" },
    source: { type: "string" },
    search: { type: "string" },
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
    help: { type: "boolean", short: "h" }
  }
})

const [command, ...rest] = positionals

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

async function main(): Promise<void> {
  if (!command || values.help) {
    console.log(usage)
    return
  }
  switch (command) {
    case "tabs":
      return print(await operations.tabs.run({}, call))
    case "state":
      return print(await operations.state.run({ tab: values.tab }, call))
    case "open":
      return print(await operations.open.run({ root: rest[0]?.trim() ? resolve(rest[0]) : rest[0] }, call))
    case "skill":
      console.log(await skillOperation.run({ path: rest[0] }, readSkill))
      return
    case "mcp":
      serveMcp()
      return
    case "lib":
      if (rest[0] === "check") {
        return runCheck(rest[1], {
          ...(values.tab ? { tab: values.tab } : {}),
          ...(values.mode?.[0] ? { mode: values.mode[0] } : {}),
          ...(values.json ? { json: true } : {}),
          ...(values.record ? { record: true } : {})
        })
      }
      return runLib(rest[0], {
        ...(values.root ? { root: values.root } : {}),
        ...(values.out ? { out: values.out } : {}),
        ...(values.registry ? { registry: true } : {}),
        ...(values.id ? { id: values.id } : {}),
        ...(values.name ? { name: values.name } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.range ? { range: values.range } : {}),
        ...(values.only ? { only: values.only } : {}),
        ...(values["no-examples"] ? { noExamples: true } : {}),
        ...(values["no-tags"] ? { noTags: true } : {}),
        ...(values.edits ? { edits: values.edits } : {}),
        ...(values.json ? { json: true } : {})
      })
    case "exec": {
      const editId = values["edit-id"]
      let code: string | undefined
      if (rest[0]) code = await readFile(rest[0], "utf8")
      else if (!editId) code = (await stdin()) || undefined
      const edits: unknown = values.edits === undefined ? undefined : JSON.parse(values.edits)
      const result = await executeOperation.run({ tab: values.tab, label: values.label, code, editId, edits }, call)
      report(result, executeOperation.failed(result))
      return
    }
    case "screenshot": {
      const result = await operations.screenshot.run(
        {
          tab: values.tab,
          design: rest[0],
          state: values.state,
          mode: values.mode,
          scale: values.scale === undefined ? undefined : Number(values.scale)
        },
        call
      )
      report(result, operations.screenshot.failed(result))
      return
    }
    case "a11y":
    case "accessibility": {
      const result = await operations.accessibility.run(
        {
          tab: values.tab,
          design: rest[0],
          state: values.state,
          mode: values.mode
        },
        call
      )
      if (values.json) print(result)
      else console.log(describeAccessibility(result))
      if (operations.accessibility.failed(result)) process.exitCode = 1
      return
    }
    case "problems": {
      const result = await operations.problems.run(
        {
          tab: values.tab,
          design: rest[0],
          state: values.state,
          mode: values.mode
        },
        call
      )
      if (values.json) print(result)
      else console.log(describeProblems(result))
      if (operations.problems.failed(result)) process.exitCode = 1
      return
    }
    case "tokens": {
      const filter = { category: values.category, source: values.source, search: values.search }
      const tokens = await operations.tokens.run({ tab: values.tab, ...filter }, call)
      if (values.json) print(tokens)
      else console.log(describeTokens(tokens))
      return
    }
    case "components": {
      const result = await operations.components.run({ tab: values.tab }, call)
      if (values.json) print(result)
      else console.log(describeComponents(result))
      return
    }
    case "props": {
      const result = await operations.props.run({ tab: values.tab, component: rest[0], all: values.all }, call)
      if (values.json) print(result)
      else console.log(describeProps(result))
      return
    }
    case "console": {
      const result = await operations.console.run({ tab: values.tab, clear: values.clear }, call)
      if (values.json) print(result)
      else console.log(describeConsole(result))
      return
    }
    default:
      throw new Error(`Unknown command ${command}\n\n${usage}`)
  }
}

function report(result: ExecResponse, failed: boolean): void {
  if (values.json) print({ ...result, screenshots: result.screenshots.map(({ png: _png, ...shot }) => shot) })
  else console.log(describeExec(result))
  if (failed) process.exitCode = 1
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

async function stdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf8")
}
