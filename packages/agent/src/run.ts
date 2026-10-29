import { randomUUID } from "node:crypto"
import { createContext, Script, type Context } from "node:vm"
import type { AgentHooks, AgentSnapshot, ExecResult } from "./types.ts"
import { AgentWorkspace } from "./workspace.ts"

export interface ExecRequest {
  label: string
  /** The snippet. Omit it when retrying a failed one with `edits`. */
  code?: string
  /** A failed call's id, to retry its snippet with `edits` applied. */
  editId?: string
  edits?: { find: string; replace: string; all?: boolean }[]
}

/** Each tab keeps one context, so values assigned without `const` or `let` carry over to the next call. */
const contexts = new Map<string, Context>()
/** Snippets that failed, kept so a retry can patch them instead of resending. */
const failed = new Map<string, string>()

/**
 * Runs an agent's snippet against a working copy of a tab. It either succeeds and returns every change to apply as
 * one step, or fails and changes nothing, returning an `editId` to retry with.
 */
export async function execute(request: ExecRequest, snapshot: AgentSnapshot, hooks: AgentHooks): Promise<ExecResult> {
  const code = request.editId ? patch(request.editId, request.edits ?? []) : request.code
  if (!code?.trim()) throw new Error("Nothing to run: pass a snippet, or an editId with edits")
  const workspace = new AgentWorkspace(snapshot, hooks, request.label)
  workspace.emit({ kind: "start" })

  try {
    await run(snapshot.tab, code, workspace.api())
    const result = workspace.result()
    if (request.editId) failed.delete(request.editId)
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
      editId,
      output: workspace.output,
      warnings: [],
      screenshots: [],
      created: {},
      changes: { documents: [], tokens: [] }
    }
  }
}

async function run(tab: string, code: string, api: Record<string, unknown>): Promise<void> {
  let context = contexts.get(tab)
  if (!context) {
    context = createContext({})
    contexts.set(tab, context)
  }
  Object.assign(context, api, { console: { log: api.Print, warn: api.Print, error: api.Print } })
  // The wrapper adds one line before the snippet, so line numbers in errors match what the agent wrote.
  const script = new Script(`(async () => {\n${code}\n})()`, { filename: "snippet.js", lineOffset: -1 })
  await (script.runInContext(context, { timeout: 5000 }) as Promise<void>)
}

function patch(editId: string, edits: { find: string; replace: string; all?: boolean }[]): string {
  let code = failed.get(editId)
  if (code === undefined) throw new Error(`No failed snippet with editId ${editId}; send the whole snippet again`)
  for (const [index, edit] of edits.entries()) {
    const count = code.split(edit.find).length - 1
    if (count === 0) throw new Error(`Edit ${index + 1}: "${edit.find}" isn't in the snippet`)
    if (count > 1 && !edit.all)
      throw new Error(`Edit ${index + 1}: "${edit.find}" appears ${count} times; make it unique or set all`)
    code = edit.all ? code.replaceAll(edit.find, edit.replace) : code.replace(edit.find, edit.replace)
  }
  return code
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const line = /snippet\.js:(\d+)(?::(\d+))?/.exec(error.stack ?? "")
  return line ? `${error.message} (line ${line[1]}${line[2] ? `, column ${line[2]}` : ""})` : error.message
}
