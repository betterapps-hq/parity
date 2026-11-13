import { randomUUID } from "node:crypto"
import { createContext, Script, type Context } from "node:vm"
import { CodedError, describeConflicts, errorDetails } from "@parity-app/core"
import { z } from "zod"
import type { AgentHooks, AgentSnapshot, ExecResult } from "./types.ts"
import { type AgentApi, AgentWorkspace } from "./workspace.ts"

export interface ExecRequest {
  label: string
  /** The snippet. Omit it when retrying a failed one with `edits`. */
  code?: string
  /** A failed call's id, to retry its snippet with `edits` applied. */
  editId?: string
  edits?: { find: string; replace: string; all?: boolean }[]
}

/**
 * How long a snippet may run, in milliseconds. A run is stopped once it has taken `total` in all, renders and screenshots
 * included, or has computed for `stretch` without awaiting, and it fails, changing nothing.
 */
export interface SnippetLimits {
  total: number
  stretch: number
}

/**
 * An agent's snippet gets 2 minutes, room for dozens of renders and screenshots, which can take seconds each, and 5
 * seconds of computing between awaits, which its start alone had before (PAR-1037).
 */
export const agentLimits: SnippetLimits = { total: 120_000, stretch: 5000 }

/**
 * The app's own snippets, which export or report designs by screenshotting each in a list they're given, take as long
 * as those renders do, however many there are.
 */
export const appLimits: SnippetLimits = { total: Number.POSITIVE_INFINITY, stretch: 5000 }

/**
 * Each tab keeps one context, so values assigned without `const` or `let` carry over to the next call, with its own
 * `Promise`, which `run` hands the snippet API calls' results as.
 */
interface TabContext {
  context: Context
  promise: PromiseConstructor
}

const contexts = new Map<string, TabContext>()

/** Evaluated in a snippet's context to run the promise jobs waiting there. */
const nothing = new Script("undefined")

/** Snippets that failed, kept so a retry can patch them instead of resending. */
const failed = new Map<string, string>()

/**
 * Runs an agent's snippet against a working copy of a tab. It either succeeds and returns every change, applied as one
 * step through `hooks.apply` when given, or fails and changes nothing, returning an `editId` to retry with. A call
 * whose changes conflict with what changed in the editor since the snapshot fails the same way, naming the designs.
 */
export async function execute(
  request: ExecRequest,
  snapshot: AgentSnapshot,
  hooks: AgentHooks,
  limits: SnippetLimits = agentLimits
): Promise<ExecResult> {
  const code = request.editId ? patch(request.editId, request.edits ?? []) : request.code

  if (!code?.trim()) {
    throw new CodedError("Nothing to run: pass a snippet, or an editId with edits", {
      code: "invalid_input",
      field: "code"
    })
  }

  const workspace = new AgentWorkspace(snapshot, hooks, request.label)
  workspace.emit({ kind: "start" })

  try {
    await run(snapshot.tab, code, workspace.api(), limits)
    await workspace.checkTokenKinds()
    const result = workspace.result()
    const { designs, modes, tokens, references = [] } = result.changes

    if (hooks.apply && (designs.length > 0 || modes || tokens.length > 0 || references.length > 0)) {
      const conflicts = await hooks.apply(result.changes)

      if (conflicts.length > 0) {
        throw new CodedError(describeConflicts(conflicts), { code: "conflict", retryable: true })
      }
    }

    if (request.editId) {
      failed.delete(request.editId)
    }

    workspace.emit({ kind: "end" })
    workspace.flush()

    return { ok: true, ...result }
  } catch (error) {
    const editId = request.editId ?? randomUUID().slice(0, 8)
    failed.set(editId, code)
    const message = describeError(error)
    workspace.emit({ kind: "end", error: message })
    workspace.flush()

    return {
      ok: false,
      error: message,
      details: errorDetails(error) ?? { code: "execution_failed", retryable: false },
      editId,
      output: workspace.output,
      warnings: [],
      warningGroups: [],
      screenshots: [],
      created: {},
      changes: { designs: [], tokens: [] }
    }
  }
}

/**
 * Runs a snippet in its tab's context until it settles or runs out of time. The context runs its own promise jobs
 * (`afterEvaluate`), and only while something is evaluated in it, under that evaluation's timeout. So the snippet's
 * start runs under one, and once an API call it awaits settles, `resume` evaluates nothing there to run what it does
 * next under another, which stops a loop after an `await` as it stops one before. Once the run is over, the API calls
 * it was given refuse, so a loop still awaiting them stops too.
 */
async function run(tab: string, code: string, api: AgentApi, limits: SnippetLimits): Promise<void> {
  const { context, promise } = tabContext(tab)
  const start = performance.now()
  let over = false
  // Whether the last stretch was cut short by the run's time, not its own limit, which says which a timeout was.
  let lastOfRun = false
  let stop: (cause: unknown) => void = () => undefined

  // `runInContext` gives whatever the script evaluates to, which each call says.
  const evaluate = <Value>(script: Script): Value => {
    const left = limits.total - (performance.now() - start)
    lastOfRun = left < limits.stretch

    return script.runInContext(context, { timeout: Math.max(1, Math.floor(Math.min(limits.stretch, left))) })
  }

  const live: Live = {
    over: () => over,
    // Checked as well as timed, since API calls that settle without waiting on anything never let the timer fire.
    spent: () => over || performance.now() - start >= limits.total,
    resume: () => {
      try {
        if (live.spent()) {
          throw outOfTime(limits)
        }

        evaluate<undefined>(nothing)
      } catch (cause) {
        stop(cause)
      }
    }
  }

  const guarded = guard(api, live, promise, limits)
  Object.assign(context, guarded, { console: { log: guarded.Print, warn: guarded.Print, error: guarded.Print } })
  // The wrapper adds one line before the snippet, so line numbers in errors match what the agent wrote.
  const script = new Script(`(async () => {\n${code}\n})()`, { filename: "snippet.js", lineOffset: -1 })
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await new Promise<void>((resolve, reject) => {
      stop = (cause) => {
        over = true
        reject(cause)
      }

      if (Number.isFinite(limits.total)) {
        timer = setTimeout(() => stop(outOfTime(limits)), limits.total)
      }

      // Its own `then`, not `await` or `Promise.race`, which would queue the call to it among the context's jobs.
      // SAFETY: the script is an async arrow called at once, so what it evaluates to is the promise of its run.
      void evaluate<Promise<void>>(script).then(resolve, reject)
    })
  } catch (cause) {
    if (!isTimeout(cause)) {
      throw cause
    }

    throw lastOfRun ? outOfTime(limits) : stretchTooLong(limits)
  } finally {
    over = true
    clearTimeout(timer)
  }
}

function tabContext(tab: string): TabContext {
  let found = contexts.get(tab)

  if (!found) {
    const context = createContext({}, { microtaskMode: "afterEvaluate" })
    // SAFETY: a new context's `Promise` is its own constructor, read before a snippet could assign another.
    found = { context, promise: new Script("Promise").runInContext(context) as PromiseConstructor }
    contexts.set(tab, found)
  }

  return found
}

/** A run as the API calls it was given see it. */
interface Live {
  /** Whether the run has ended, after which nothing it was waiting on goes on. */
  over(): boolean
  /** Whether API calls refuse: the run has ended or its time is spent. */
  spent(): boolean
  /** Runs the promise jobs waiting in the context: what the snippet does next. */
  resume(): void
}

/**
 * The API with each function refusing once the run's time is spent, and each promise one returns handed to the snippet
 * as a promise of its context, settled with `resume` right after. The snippet's `await` queues what it does next on
 * that promise, so it's waiting in the context to run when `resume` does. A promise from here would queue it only after
 * a job of this process's own, too late when the call settles without waiting on anything.
 */
function guard(api: AgentApi, live: Live, SnippetPromise: PromiseConstructor, limits: SnippetLimits): AgentApi {
  const guarded: AgentApi = { ...api }

  for (const [name, member] of Object.entries(api)) {
    // Each function is wrapped alike, whatever it takes and gives.
    const value: unknown = member

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the snippet API's edge: its functions are told from its values to be wrapped
    if (typeof value !== "function") {
      continue
    }

    const call = (...args: unknown[]) => {
      if (live.spent()) {
        throw outOfTime(limits)
      }

      const result: unknown = value(...args)

      if (!(result instanceof Promise)) {
        return result
      }

      return new SnippetPromise((resolve, reject) => {
        const settle = (done: () => void) => {
          // A call that settles once the run's time is spent settles into nothing, and `resume` stops the run. Settled,
          // it would queue what the snippet does next in the context, where the tab's next call would run it, calling
          // that call's API.
          if (!live.spent()) {
            done()
          }

          live.resume()
        }

        void result.then(
          (settled) => settle(() => resolve(settled)),
          (cause) => settle(() => reject(cause))
        )
      })
    }

    Object.assign(guarded, { [name]: call })
  }

  return guarded
}

function outOfTime(limits: SnippetLimits): Error {
  return new Error(
    `Stopped after ${seconds(limits.total)}, the most a snippet can run. Split the work across calls, ` +
      "or look for a loop that never ends."
  )
}

function stretchTooLong(limits: SnippetLimits): Error {
  return new Error(
    `Stopped after ${seconds(limits.stretch)} of computing without an await. Look for a loop that never ends.`
  )
}

function seconds(ms: number): string {
  const [count, unit] = ms >= 60_000 ? [ms / 60_000, "minute"] : [ms / 1000, "second"]

  return `${count} ${unit}${count === 1 ? "" : "s"}`
}

/** What `vm` throws when an evaluation runs past its timeout, from a realm whose `Error` may not be this one's. */
const timeoutError = z.object({ code: z.literal("ERR_SCRIPT_EXECUTION_TIMEOUT") })

function isTimeout(cause: unknown): boolean {
  return timeoutError.safeParse(cause).success
}

function patch(editId: string, edits: { find: string; replace: string; all?: boolean }[]): string {
  let code = failed.get(editId)

  if (code === undefined) {
    throw new CodedError(`No failed snippet with editId ${editId}; send the whole snippet again`, {
      code: "unknown_edit_id",
      field: "editId"
    })
  }

  for (const [index, edit] of edits.entries()) {
    const count = code.split(edit.find).length - 1
    const field = `edits/${index}/find`

    if (count === 0) {
      throw new CodedError(`Edit ${index + 1}: "${edit.find}" isn't in the snippet`, { code: "invalid_input", field })
    }

    if (count > 1 && !edit.all) {
      throw new CodedError(`Edit ${index + 1}: "${edit.find}" appears ${count} times; make it unique or set all`, {
        code: "invalid_input",
        field
      })
    }

    code = edit.all ? code.replaceAll(edit.find, edit.replace) : code.replace(edit.find, edit.replace)
  }

  return code
}

function describeError(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return String(cause)
  }

  const line = /snippet\.js:(\d+)(?::(\d+))?/.exec(cause.stack ?? "")

  return line ? `${cause.message} (line ${line[1]}${line[2] ? `, column ${line[2]}` : ""})` : cause.message
}
