import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * The processes Parity and extensions start, adopt and stop for a project (PAR-1103, docs/proposals/processes.md).
 * Arguments, variables and public addresses are never sent: they can hold keys, or open the person's server to anyone.
 * The builder keeps its own `builder.*` events, so it sends none of these.
 */

const lifetime = z.enum(["server", "task"]).describe("Whether it runs until it's stopped, or once")
const name = z.string().describe("Its name, as the processes list shows it")
const owner = z.string().describe("`parity`, or the id of the extension that started or adopted it")
const role = z.string().describe("For Parity's own, what it does, as `tool`; else the role its spec gives, or empty")

const runKind = z
  .enum(["bin", "script", "exec", "node", "parity"])
  .describe("What kind of command it runs; `parity` for one of Parity's own")

const command = z.string().describe("The package, script, executable or module it runs, as `storybook`; no arguments")
const durationMs = z.number().nonnegative().describe("How long it took, in milliseconds")
const uptimeMs = z.number().nonnegative().describe("How long it had been running, in milliseconds")
const exitCode = z.number().int().optional().describe("Its exit code, when it exited with one")
const signal = z.string().optional().describe("The signal that ended it, when one did")
const output = z.string().describe("The last of what it printed, up to 50 lines, with secrets replaced")

const common = { lifetime, name, owner, role, runKind, command }

export const processStarted = defineEvent(
  "processes.started",
  z.object({
    ...common,
    durationMs,
    ready: z.enum(["http", "tcp", "output", "none"]).describe("How Parity knew it was ready"),
    portMoved: z.boolean().describe("Whether the port it asked for was taken, so it got another"),
    run: z.number().int().positive().describe("Which run this is: 1, then one more each time it starts again")
  }),
  {
    level: "info",
    sentBy: ["service"],
    when: "A process Parity started is ready: a server passes its ready check, a task has spawned."
  }
)

export const processFailed = defineEvent(
  "processes.failed",
  z.object({
    ...common,
    durationMs,
    reason: z
      .enum(["exited", "timeout", "spawn"])
      .describe("Whether it exited before it was ready, wasn't ready in time, or couldn't be spawned"),
    exitCode,
    signal,
    output
  }),
  { level: "warn", sentBy: ["service"], when: "A run fails before it's ready." }
)

export const processCrashed = defineEvent(
  "processes.crashed",
  z.object({
    ...common,
    uptimeMs,
    exitCode,
    signal,
    restarting: z.boolean().describe("Whether it's started again, as its spec asks"),
    output
  }),
  { level: "warn", sentBy: ["service"], when: "A running server stops by itself." }
)

export const processStopped = defineEvent(
  "processes.stopped",
  z.object({
    ...common,
    uptimeMs,
    by: z
      .enum(["person", "extension", "project", "undetected", "service", "removed"])
      .describe(
        "Who stopped it: the person from the list, its extension, the project's closing, its tool no longer detected, the service exiting, or its extension's removal"
      )
  }),
  { level: "info", sentBy: ["service"], when: "A process is stopped on purpose." }
)

export const processRestarted = defineEvent(
  "processes.restarted",
  z.object({
    ...common,
    durationMs,
    by: z
      .enum(["person", "extension", "crash"])
      .describe("Who started it again: the person, its extension, or a crash"),
    outcome: z.enum(["ok", "error"]).describe("Whether its next run was ready")
  }),
  { level: "info", sentBy: ["service"], when: "A process starts its next run." }
)

export const processTaskFinished = defineEvent(
  "processes.taskFinished",
  z.object({
    ...common,
    durationMs,
    outcome: z.enum(["passed", "failed", "canceled"]).describe("How it ended"),
    how: z.enum(["exited", "timeout", "stopped"]).describe("Whether it exited, ran out of time, or was stopped"),
    exitCode,
    reported: z.boolean().describe("Whether its owner set progress or a summary by the time this was sent")
  }),
  {
    level: "info",
    sentBy: ["service"],
    when: "A task ends, and its owner has summarized it or 5 seconds have passed."
  }
)

export const processAdopted = defineEvent(
  "processes.adopted",
  z.object({
    name,
    owner,
    foundBy: z.enum(["port", "provider", "endpoint"]).describe("How it was found: a port check, a provider, or given"),
    provider: z.string().optional().describe("The discovery provider's extension, when one found it")
  }),
  { level: "info", sentBy: ["service"], when: "An extension adopts a running server." }
)

export const processLost = defineEvent(
  "processes.lost",
  z.object({
    name,
    owner,
    adoptedForMs: z.number().nonnegative().describe("How long it was adopted, in milliseconds"),
    checkedBy: z.enum(["pid", "connect"]).describe("Whether its process id or a connection said it was gone")
  }),
  { level: "warn", sentBy: ["service"], when: "An adopted server goes away." }
)

export const processRefused = defineEvent(
  "processes.refused",
  z.object({
    owner,
    runKind: runKind.optional(),
    command: command.optional(),
    code: z
      .enum([
        "process_spec_invalid",
        "process_not_permitted",
        "process_not_found",
        "process_unsupported",
        "process_spec_differs",
        "process_adopted",
        "process_provider_failed",
        "process_id_taken",
        "process_not_local"
      ])
      .describe("Why it was refused"),
    provider: z.string().optional().describe("The extension whose environment or launcher failed, when one did")
  }),
  { level: "warn", sentBy: ["service"], when: "`start` or `adopt` is refused, before anything runs." }
)

export const processReattached = defineEvent(
  "processes.reattached",
  z.object({
    owner,
    processes: z.number().int().nonnegative().describe("How many of its processes it got back"),
    hostStopped: z
      .enum(["crash", "stuck", "reload"])
      .describe("Why its host stopped: it crashed, it wasn't answering, or it was reloaded")
  }),
  {
    level: "info",
    sentBy: ["service"],
    when: "An extension's host that started again gets back the processes it owns."
  }
)

export const processFound = defineEvent(
  "processes.found",
  z.object({
    owner,
    ports: z.number().int().nonnegative().describe("How many ports it asked about"),
    candidates: z.number().int().nonnegative().describe("How many servers it found"),
    providers: z.number().int().nonnegative().describe("How many discovery providers were asked"),
    cached: z.number().int().nonnegative().describe("How many providers answered from their last answer"),
    durationMs
  }),
  { level: "info", sample: 0.1, sentBy: ["service"], when: "An extension's `find` returns." }
)

const providerKind = z.enum(["addresses", "discovery", "environment", "launcher"]).describe("The kind of provider")

export const processProviderFailed = defineEvent(
  "processes.providerFailed",
  z.object({
    provider: z.string().describe("The extension's id"),
    kind: providerKind,
    reason: z
      .enum(["error", "timeout", "invalid", "refused"])
      .describe(
        "It threw, ran out of time, answered what its schema refuses, or gave an address or server Parity refuses"
      ),
    durationMs,
    message: z.string().optional().describe("What went wrong, scrubbed")
  }),
  {
    level: "warn",
    sentBy: ["service"],
    when: "A provider call throws, runs out of time, or answers what Parity refuses."
  }
)

export const processProviderSlow = defineEvent(
  "processes.providerSlow",
  z.object({ provider: z.string().describe("The extension's id"), kind: providerKind, durationMs }),
  { level: "info", sentBy: ["service"], when: "A provider call takes over half its time limit, but answers." }
)

export const processEvents = [
  processStarted,
  processFailed,
  processCrashed,
  processStopped,
  processRestarted,
  processTaskFinished,
  processAdopted,
  processLost,
  processRefused,
  processReattached,
  processFound,
  processProviderFailed,
  processProviderSlow
] as const
