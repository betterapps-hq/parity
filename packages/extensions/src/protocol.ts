import type { Checks } from "@parity-app/channel"
import { parseData } from "@parity-app/core"
import type {
  CommandTarget,
  ComponentTarget,
  DesignOperation,
  Fact,
  FileEdit,
  JsonValue,
  NodeRef,
  OpenWhere,
  PickItem,
  ServerRequest,
  SettingValue,
  Tone,
  ViewData,
  ViewKind
} from "@parity-app/extension-api"
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
  /** The tabs, sections and pages it declares, by id, with the kind of view each holds. */
  views: Record<string, ViewKind>
  state: StateValues
  /** What's selected in the window with the project open, which `parity.selection.get` gives until it changes. */
  selection: NodeRef[]
  /** Its settings' values now, by key, and whose each one is: the person's (`app`) or the project's (`project`). */
  settings: { values: Record<string, SettingValue>; scopes: Record<string, "app" | "project"> }
}

/** Where `parity.navigate` goes, by method. */
export type NavigateTo =
  | { kind: "reveal" | "zoomTo" | "pageUrl"; ref: NodeRef }
  | { kind: "openDesign"; key: string }
  | { kind: "setMode"; mode: string }
  | { kind: "setState"; design: string; state: string }
  | { kind: "showTab"; id: string }
  | { kind: "openSettings"; id: string }

/** What the project service asks of a host. */
export interface HostMethods {
  /** Loads the extension's code and calls its `activate`. Answers once `activate` has. */
  activate: { params: ActivateParams; result: undefined }
  /** Runs one of its commands, once it has activated. */
  run: { params: { command: string; target?: CommandTarget }; result: undefined }
  /** Answers at once, unless the extension's code is keeping the host busy, with the memory its process holds. */
  ping: { params: undefined; result: { memory?: number } | undefined }
  /** Some of its settings changed, in Settings or by its own `update`: their values now, by key. */
  "settings.changed": { params: { values: Record<string, SettingValue> }; result: undefined }
  /** The person cancelled a task under `ui.progress`. */
  cancel: { params: { progress: number }; result: undefined }
  /** The person changed a field of one of its forms. */
  "view.changed": { params: { view: string; key: string; value: string | number | boolean }; result: undefined }
  /** What's selected in the window changed. */
  "selection.changed": { params: { refs: NodeRef[] }; result: undefined }
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
  "facts.set": { params: { target: ComponentTarget; facts: Fact[] }; result: undefined }
  "ui.notify": {
    params: { message: string; detail?: string; tone?: Tone; actions?: string[] }
    result: { action?: string }
  }
  "ui.pick": { params: { items: PickItem[]; title?: string; placeholder?: string }; result: { index?: number } }
  "ui.input": { params: { title: string; value?: string; placeholder?: string }; result: { value?: string } }
  "ui.confirm": { params: { message: string; detail?: string; confirm?: string }; result: { confirmed: boolean } }
  "ui.open": { params: { url: string; where?: OpenWhere }; result: undefined }
  /** Sets one of its `project` settings, or puts it back to its default without `value`. */
  "settings.update": { params: { key: string; value?: SettingValue }; result: undefined }
  /** Shows a task's progress, says what it's doing now, or ends it with `done`. */
  "ui.progress": { params: { id: number; title?: string; detail?: string; done?: boolean }; result: undefined }
  /** Draws one of its views with this data, replacing what it drew before. */
  "view.set": { params: { id: string; data: ViewData }; result: undefined }
  /** Empties one of its views again. */
  "view.clear": { params: { id: string }; result: undefined }
  /** Opens one of its views' tab or page. */
  "view.reveal": { params: { id: string }; result: undefined }
  "servers.serve": { params: ServerRequest; result: { url: string } }
  "servers.adopt": { params: { id: string; name: string; url: string }; result: undefined }
  "servers.stop": { params: { id: string }; result: undefined }
  "servers.routed": { params: undefined; result: { url: string; address: string }[] }
  /** Changes designs as one undo step, with the `edits` permission. */
  "edits.transact": { params: { label: string; operations: DesignOperation[] }; result: undefined }
  /** Writes project files the `write` permission names, never a `.par`. Answers with the paths it changed. */
  "files.edit": { params: { label: string; files: FileEdit[] }; result: { paths: string[] } }
  "selection.set": { params: { refs: NodeRef[] }; result: undefined }
  "selection.highlight": { params: { refs: NodeRef[] }; result: undefined }
  /** Moves around the window; `pageUrl` answers with the URL. */
  navigate: { params: NavigateTo; result: { url?: string } }
  /** Runs one of Parity's own commands, or an extension's. */
  "commands.execute": { params: { command: string; target?: CommandTarget }; result: undefined }
}

const text = z.string().max(20_000)

const jsonValue: z.ZodType<JsonValue> = z.json()

const checkOf =
  <T extends z.ZodType>(schema: T) =>
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what the host sent, read here
  (params: unknown): z.output<T> =>
    parseData(schema, params)

const url = z.url({ protocol: /^https?$/ })

const viewLabel = z.string().max(200)
const iconName = z.string().max(64)
const tone = z.enum(["info", "success", "warning", "error"])
const viewAction = z.strictObject({ command: z.string().max(200), when: z.string().max(200).optional() })

const viewItem = z.strictObject({
  key: z.string().max(500),
  label: viewLabel,
  detail: z.string().max(2000).optional(),
  value: z.string().max(2000).optional(),
  icon: iconName.optional(),
  tone: tone.optional(),
  cells: z.array(z.string().max(500)).max(20).optional(),
  parent: z.string().max(500).optional(),
  target: z.strictObject({ type: z.literal("component"), key: z.string() }).optional()
})

const field = { key: z.string().max(200), label: viewLabel, detail: z.string().max(2000).optional() }

const formField = z.discriminatedUnion("type", [
  z.strictObject({
    ...field,
    type: z.literal("text"),
    value: z.string().max(20_000),
    placeholder: viewLabel.optional()
  }),
  z.strictObject({ ...field, type: z.literal("number"), value: z.number() }),
  z.strictObject({ ...field, type: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({
    ...field,
    type: z.literal("select"),
    value: z.string().max(500),
    options: z.array(z.strictObject({ value: z.string().max(500), label: viewLabel })).max(200)
  })
])

const viewOptions = z.strictObject({
  description: z.string().max(5000).optional(),
  empty: z.strictObject({ title: viewLabel, detail: z.string().max(2000).optional() }).optional(),
  toolbar: z.array(viewAction).max(10).optional(),
  itemActions: z.array(viewAction).max(10).optional(),
  columns: z.array(viewLabel).max(20).optional()
})

/** A view's data as a host sends it: a form holds fields, and the other kinds hold items. */
const viewData: z.ZodType<ViewData> = z.union([
  z.strictObject({ kind: z.literal("form"), options: viewOptions, items: z.array(formField).max(200) }),
  z.strictObject({
    kind: z.enum(["table", "tree", "list", "keyValue"]),
    options: viewOptions,
    items: z.array(viewItem).max(10_000)
  })
])

const designKey = z.string().max(2000)

const nodeId = z.string().max(500)

const label = z.string().min(1).max(200)

const designOperation: z.ZodType<DesignOperation> = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("insert"),
    design: designKey,
    parent: nodeId,
    slot: nodeId.optional(),
    before: nodeId.optional(),
    node: jsonValue
  }),
  z.strictObject({ op: z.literal("remove"), design: designKey, node: nodeId }),
  z.strictObject({
    op: z.literal("move"),
    design: designKey,
    node: nodeId,
    parent: nodeId,
    slot: nodeId.optional(),
    before: nodeId.optional()
  }),
  z.strictObject({
    op: z.literal("set"),
    design: designKey,
    node: nodeId,
    path: z.array(z.string().max(200)).min(1).max(10),
    value: jsonValue.optional()
  })
])

const filePath = z.string().min(1).max(1000)

const fileText = z.string().max(10_000_000)

const fileEdit: z.ZodType<FileEdit> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("create"), path: filePath, content: fileText }),
  z.strictObject({ kind: z.literal("replace"), path: filePath, expected: fileText, content: fileText }),
  z.strictObject({ kind: z.literal("patch"), path: filePath, find: fileText.min(1), replace: fileText }),
  z.strictObject({ kind: z.literal("delete"), path: filePath, expected: fileText })
])

const name = z.string().min(1).max(500)

const nodeRef = z.strictObject({ owner: name, type: name, key: z.string().min(1).max(2000) })

const refs = z.strictObject({ refs: z.array(nodeRef).max(10_000) })

const componentTarget = z.strictObject({ type: z.literal("component"), key: z.string() })

const commandTarget = z.discriminatedUnion("type", [
  componentTarget,
  z.strictObject({ type: z.literal("layer"), design: z.string().max(2000), node: z.string().max(500) })
])

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
      target: componentTarget,
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
  "ui.open": checkOf(z.strictObject({ url, where: z.enum(["browser", "parity"]).optional() })),
  "settings.update": checkOf(
    z.strictObject({
      key: z.string().max(200),
      value: z.union([z.string().max(20_000), z.number(), z.boolean()]).optional()
    })
  ),
  "ui.progress": checkOf(
    z.strictObject({
      id: z.int(),
      title: z.string().max(200).optional(),
      detail: z.string().max(500).optional(),
      done: z.boolean().optional()
    })
  ),
  "view.set": checkOf(z.strictObject({ id: z.string().max(200), data: viewData })),
  "view.clear": checkOf(z.strictObject({ id: z.string().max(200) })),
  "view.reveal": checkOf(z.strictObject({ id: z.string().max(200) })),
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
  "servers.routed": checkOf(z.undefined()),
  "edits.transact": checkOf(z.strictObject({ label, operations: z.array(designOperation).min(1).max(10_000) })),
  "files.edit": checkOf(z.strictObject({ label, files: z.array(fileEdit).min(1).max(1000) })),
  "selection.set": checkOf(refs),
  "selection.highlight": checkOf(refs),
  navigate: checkOf(
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.enum(["reveal", "zoomTo", "pageUrl"]), ref: nodeRef }),
      z.strictObject({ kind: z.literal("openDesign"), key: name }),
      z.strictObject({ kind: z.literal("setMode"), mode: name }),
      z.strictObject({ kind: z.literal("setState"), design: name, state: name }),
      z.strictObject({ kind: z.literal("showTab"), id: name }),
      z.strictObject({ kind: z.literal("openSettings"), id: name })
    ])
  ),
  "commands.execute": checkOf(z.strictObject({ command: name, target: commandTarget.optional() }))
}
