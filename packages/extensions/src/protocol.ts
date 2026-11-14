import type { Checks } from "@parity-app/channel"
import { parseData } from "@parity-app/core"
import type { CommandTarget, Fact, JsonValue, PickItem, ServerRequest, Tone } from "@parity-app/extension-api"
import { z } from "zod"

/*
 * What the project service and an extension's host ask each other, over `@parity-app/channel` and the host's IPC
 * channel. The service trusts nothing the host sends, since the extension's code runs there and could post anything, so
 * every request from the host is read through `hostChecks` before it's handled.
 */

/** What a host's `parity.state` starts with: the extension's values for every project, and for this one. */
export interface StateValues {
  app: Record<string, JsonValue>
  project: Record<string, JsonValue>
}

/** What a host needs to activate its extension. */
export interface ActivateParams {
  extension: { id: string; version: string; displayName: string; prefix: string }
  /** Its code's entry module, as an absolute path. */
  main: string
  project: { root: string; name: string; detected?: JsonValue }
  /** The ids the manifest declares, which registrations are checked against. */
  commands: string[]
  statusItems: string[]
  state: StateValues
}

/** What the project service asks of a host. */
export interface HostMethods {
  /** Loads the extension's code and calls its `activate`. Answers once `activate` has. */
  activate: { params: ActivateParams; result: undefined }
  /** Runs one of its commands, once it has activated. */
  run: { params: { command: string; target?: CommandTarget }; result: undefined }
  /** Answers at once, unless the extension's code is keeping the host busy. */
  ping: { params: undefined; result: undefined }
  /** The person cancelled a task under `ui.progress`. */
  cancel: { params: { progress: number }; result: undefined }
  /** Disposes of the extension's subscriptions and calls its `deactivate`, then ends the host. */
  stop: { params: undefined; result: undefined }
}

/** A line in an extension's log. */
export interface LogLine {
  level: "info" | "warning" | "error"
  text: string
  /** An error's stack. */
  stack?: string
  /** When it was written, in milliseconds since 1970. */
  at: number
}

/** A status bar item's value and tooltip as the extension last set them. */
export interface StatusValue {
  value?: string
  tooltip?: string
}

/** What a host asks of the project service. */
export interface HostServiceMethods {
  log: { params: Omit<LogLine, "at">; result: undefined }
  "state.update": { params: { scope: "app" | "project"; key: string; value?: JsonValue }; result: undefined }
  "status.set": { params: { id: string } & StatusValue; result: undefined }
  "status.remove": { params: { id: string }; result: undefined }
  "context.set": { params: { key: string; value: boolean | string[] }; result: undefined }
  "facts.set": { params: { target: CommandTarget; facts: Fact[] }; result: undefined }
  "ui.notify": {
    params: { message: string; detail?: string; tone?: Tone; actions?: string[] }
    result: { action?: string }
  }
  "ui.pick": { params: { items: PickItem[]; title?: string; placeholder?: string }; result: { index?: number } }
  "ui.input": { params: { title: string; value?: string; placeholder?: string }; result: { value?: string } }
  "ui.confirm": { params: { message: string; detail?: string; confirm?: string }; result: { confirmed: boolean } }
  "ui.open": { params: { url: string }; result: undefined }
  /** Shows a task's progress, says what it's doing now, or ends it with `done`. */
  "ui.progress": { params: { id: number; title?: string; detail?: string; done?: boolean }; result: undefined }
  "servers.serve": { params: ServerRequest; result: { url: string } }
  "servers.adopt": { params: { id: string; name: string; url: string }; result: undefined }
  "servers.stop": { params: { id: string }; result: undefined }
  "servers.routed": { params: undefined; result: { url: string; address: string }[] }
}

const text = z.string().max(20_000)

const jsonValue: z.ZodType<JsonValue> = z.json()

const checkOf =
  <T extends z.ZodType>(schema: T) =>
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what the host sent, read here
  (params: unknown): z.output<T> =>
    parseData(schema, params)

const url = z.url({ protocol: /^https?$/ })

/** Reads each of a host's requests before the service handles it. */
export const hostChecks: Checks<HostServiceMethods> = {
  log: checkOf(z.strictObject({ level: z.enum(["info", "warning", "error"]), text, stack: text.optional() })),
  "state.update": checkOf(
    z.strictObject({ scope: z.enum(["app", "project"]), key: z.string().max(200), value: jsonValue.optional() })
  ),
  "status.set": checkOf(
    z.strictObject({ id: z.string(), value: z.string().max(200).optional(), tooltip: z.string().max(2000).optional() })
  ),
  "status.remove": checkOf(z.strictObject({ id: z.string() })),
  "context.set": checkOf(
    z.strictObject({ key: z.string(), value: z.union([z.boolean(), z.array(z.string()).max(100_000)]) })
  ),
  "facts.set": checkOf(
    z.strictObject({
      target: z.strictObject({ type: z.literal("component"), key: z.string() }),
      facts: z
        .array(z.strictObject({ id: z.string().max(100), label: z.string().max(100), value: z.string().max(200) }))
        .max(20)
    })
  ),
  "ui.notify": checkOf(
    z.strictObject({
      message: z.string().max(500),
      detail: z.string().max(2000).optional(),
      tone: z.enum(["info", "success", "warning", "error"]).optional(),
      actions: z.array(z.string().max(40)).max(3).optional()
    })
  ),
  "ui.pick": checkOf(
    z.strictObject({
      items: z.array(z.strictObject({ label: z.string().max(200), detail: z.string().max(500).optional() })).max(5000),
      title: z.string().max(200).optional(),
      placeholder: z.string().max(200).optional()
    })
  ),
  "ui.input": checkOf(
    z.strictObject({
      title: z.string().max(200),
      value: z.string().max(2000).optional(),
      placeholder: z.string().max(200).optional()
    })
  ),
  "ui.confirm": checkOf(
    z.strictObject({
      message: z.string().max(500),
      detail: z.string().max(2000).optional(),
      confirm: z.string().max(40).optional()
    })
  ),
  "ui.open": checkOf(z.strictObject({ url })),
  "ui.progress": checkOf(
    z.strictObject({
      id: z.int(),
      title: z.string().max(200).optional(),
      detail: z.string().max(500).optional(),
      done: z.boolean().optional()
    })
  ),
  "servers.serve": checkOf(
    z.strictObject({
      id: z.string().max(100),
      name: z.string().max(100),
      script: z.string(),
      args: z.array(z.string()),
      port: z.int().min(1).max(65_535),
      readyPath: z.string().startsWith("/"),
      env: z.record(z.string(), z.string()).optional()
    })
  ),
  "servers.adopt": checkOf(z.strictObject({ id: z.string().max(100), name: z.string().max(100), url })),
  "servers.stop": checkOf(z.strictObject({ id: z.string().max(100) })),
  "servers.routed": checkOf(z.undefined())
}
