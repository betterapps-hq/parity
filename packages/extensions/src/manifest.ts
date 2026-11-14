import { parseData } from "@parity-app/core"
import type {
  ActivationEvent,
  AgentToolContribution,
  CommandContribution,
  Contributions,
  JsonSchema,
  JsonValue,
  Manifest,
  MenuItem,
  MenuPlacement,
  PathIcon,
  Providers,
  SettingContribution
} from "@parity-app/extension-api"
import { z } from "zod"

/*
 * Reads an extension's manifest, the `parity` field of its `package.json`, and refuses one that breaks a rule: a field
 * it doesn't know, an id that doesn't start with the manifest's `prefix`, a menu or activation event naming a command it
 * doesn't declare, or a logo that isn't path data. Parity draws every contribution from what this returns, before the
 * extension's code loads.
 */

/** A prefix, or one part of an id after it: a letter, then letters, digits and dashes. */
const part = /^[a-z][a-zA-Z0-9-]*$/

/** A kit icon's name, in kebab case. */
const iconName = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected an icon's name in kebab case, as book-open")

const viewKind = z.enum(["table", "tree", "list", "form", "keyValue"])

const title = z.string().trim().min(1, "can't be blank")

/** Path data's commands and numbers, and nothing that could carry script. */
const pathData = /^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\-\s]+$/

const pathIcon = z.strictObject({
  viewBox: z.string().regex(/^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/, "expected four numbers, as 0 0 24 24"),
  path: z.string().trim().min(1, "can't be blank").regex(pathData, "expected path data, as an SVG path's d"),
  fillRule: z.enum(["nonzero", "evenodd"]).optional()
}) satisfies z.ZodType<PathIcon>

const activationMessage = "expected onDetect, onStartup, onCommand:id, onView:id or onNodeType:type"

/** Whether a string is an activation event. */
function isActivationEvent(event: string): event is ActivationEvent {
  return /^(?:onDetect|onStartup|onCommand:.+|onView:.+|onNodeType:.+)$/.test(event)
}

const activationEvent = z.string().transform((event, context): ActivationEvent => {
  if (isActivationEvent(event)) {
    return event
  }

  context.addIssue({ code: "custom", message: activationMessage })

  return z.NEVER
})

const command = z.strictObject({
  id: z.string(),
  title,
  icon: iconName.optional(),
  note: z.string().optional(),
  starts: z.string().optional()
}) satisfies z.ZodType<CommandContribution>

/** A context key, or `!key` for one that mustn't hold. */
const contextKey = z.string().regex(/^!?[a-z][\w.-]*$/, "expected a context key, or !key")

const menuItem = z.strictObject({
  command: z.string(),
  when: contextKey.optional(),
  enablement: contextKey.optional(),
  disabledReason: z.string().optional()
}) satisfies z.ZodType<MenuItem>

const placements = ["layers", "canvas", "designTitle", "selectionHeading", "componentCard", "media", "search"] as const

/** Whether a string is a menu placement. */
function isPlacement(placement: string): placement is MenuPlacement {
  return placements.some((known) => known === placement) || /^appMenu\/[^/]+\/[^/]+$/.test(placement)
}

const menuPlacement = z.string().transform((placement, context): MenuPlacement => {
  if (isPlacement(placement)) {
    return placement
  }

  context.addIssue({ code: "custom", message: `expected one of ${placements.join(", ")} or appMenu/<menu>/<group>` })

  return z.NEVER
})

const jsonValue: z.ZodType<JsonValue> = z.json()

const jsonSchema: z.ZodType<JsonSchema> = z.record(z.string(), jsonValue)

const empty = z.strictObject({})

const providers = z.strictObject({
  renderer: z.strictObject({ guest: z.string() }).optional(),
  builder: z.strictObject({ entry: z.string() }).optional(),
  styles: empty.optional(),
  router: empty.optional(),
  entities: empty.optional(),
  connector: empty.optional(),
  search: empty.optional()
}) satisfies z.ZodType<Providers>

const agentTool = z.strictObject({
  name: z.string(),
  description: title,
  input: z.strictObject({
    type: z.literal("object"),
    properties: z.record(z.string(), jsonSchema).optional(),
    required: z.array(z.string()).optional()
  })
}) satisfies z.ZodType<AgentToolContribution>

const setting = z.strictObject({
  type: z.enum(["string", "number", "boolean"]),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  scope: z.enum(["app", "project"]),
  title,
  enum: z.array(z.string()).optional(),
  enumTitles: z.array(z.string()).optional()
}) satisfies z.ZodType<SettingContribution>

const contributions = z.strictObject({
  commands: z.array(command).optional(),
  menus: z.record(menuPlacement, z.array(menuItem)).optional(),
  keybindings: z
    .array(z.strictObject({ command: z.string(), key: z.string(), when: contextKey.optional() }))
    .optional(),
  tabs: z
    .array(
      z.strictObject({
        id: z.string(),
        area: z.enum(["left", "right", "bottom"]),
        title,
        icon: iconName.optional(),
        view: viewKind
      })
    )
    .optional(),
  sections: z
    .array(
      z.strictObject({
        id: z.string(),
        title,
        nodeType: z.string().optional(),
        when: contextKey.optional(),
        view: viewKind
      })
    )
    .optional(),
  pages: z.array(z.strictObject({ id: z.string(), title, icon: iconName.optional(), view: viewKind })).optional(),
  statusItems: z
    .array(
      z.strictObject({
        id: z.string(),
        title,
        label: z.string().optional(),
        icon: iconName.optional(),
        command: z.string().optional()
      })
    )
    .optional(),
  nodeTypes: z
    .array(z.strictObject({ id: z.string(), name: title, icon: iconName.optional(), color: z.string().optional() }))
    .optional(),
  providers: providers.optional(),
  agentTools: z.array(agentTool).optional(),
  settings: z.record(z.string(), setting).optional()
}) satisfies z.ZodType<Contributions>

const manifest = z
  .strictObject({
    displayName: title,
    prefix: z.string().regex(part, "expected a letter, then letters, digits and dashes"),
    icon: pathIcon,
    activates: z.array(activationEvent),
    detect: z.string().optional(),
    watches: z.array(z.string()).optional(),
    permissions: z
      .strictObject({
        read: z.array(z.string()).optional(),
        write: z.array(z.string()).optional(),
        network: z.array(z.string()).optional(),
        processes: z.array(z.string()).optional(),
        edits: z.boolean().optional()
      })
      .optional(),
    extensionDependencies: z.array(z.string()).optional(),
    contributes: contributions
  })
  .superRefine((read, context) => {
    for (const problem of ruleProblems(read)) {
      context.addIssue({ code: "custom", path: problem.path, message: problem.message })
    }
  }) satisfies z.ZodType<Manifest>

/** The fields of `package.json` Parity reads of an extension. It's the developer's file, so the rest pass through. */
const extensionPackage = z.looseObject({
  name: z.string().min(1, "can't be blank"),
  version: z.string().min(1, "can't be blank"),
  main: z.string().min(1, "can't be blank"),
  engines: z.looseObject({ parity: z.string().optional() }).optional(),
  parity: manifest
})

/** An extension as Parity found it: its id, its version, its code's entry module and its manifest. */
export interface ExtensionPackage {
  /** Its package name. */
  id: string
  version: string
  /** Its code's entry module, relative to the package. */
  main: string
  /** The range of Parity versions it works with, from `engines.parity`. */
  engine?: string
  manifest: Manifest
}

/**
 * Reads an extension's `package.json`, or throws `TypeError` naming the first problem by its JSON pointer, as
 * `/parity/contributes/commands/0/id: must start with "storybook."`.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: an extension's package.json as it was read
export function readExtension(packageJson: unknown): ExtensionPackage {
  const read = parseData(extensionPackage, packageJson)
  const found: ExtensionPackage = { id: read.name, version: read.version, main: read.main, manifest: read.parity }

  if (read.engines?.parity) {
    found.engine = read.engines.parity
  }

  return found
}

interface Problem {
  path: (string | number)[]
  message: string
}

/** What breaks the rules a schema can't say: every id starts with the prefix, and what's named is declared. */
function ruleProblems(read: Manifest): Problem[] {
  const problems: Problem[] = []
  const { prefix, contributes } = read

  const own = (id: string) =>
    id.startsWith(`${prefix}.`) &&
    id
      .slice(prefix.length + 1)
      .split(".")
      .every(isPart)

  const needsPrefix = (id: string, path: (string | number)[]) => {
    if (!own(id)) {
      problems.push({ path, message: `must start with "${prefix}." and name its part with letters, digits and dashes` })
    }
  }

  // Node types are scoped by their owner rather than named with the prefix.
  const ids = (kind: "commands" | "tabs" | "sections" | "pages" | "statusItems") =>
    (contributes[kind] ?? []).map((each, index) => {
      needsPrefix(each.id, ["contributes", kind, index, "id"])

      return each.id
    })

  const commands = new Set(ids("commands"))
  const views = new Set([...ids("tabs"), ...ids("pages")])
  ids("sections")
  ids("statusItems")

  const declared = (id: string, path: (string | number)[]) => {
    if (!commands.has(id)) {
      problems.push({ path, message: `names a command the manifest doesn't declare: ${id}` })
    }
  }

  for (const [placement, items] of Object.entries(contributes.menus ?? {})) {
    for (const [index, item] of (items ?? []).entries()) {
      declared(item.command, ["contributes", "menus", placement, index, "command"])
      contextNeedsPrefix(item.when, ["contributes", "menus", placement, index, "when"])
      contextNeedsPrefix(item.enablement, ["contributes", "menus", placement, index, "enablement"])
    }
  }

  for (const [index, binding] of (contributes.keybindings ?? []).entries()) {
    declared(binding.command, ["contributes", "keybindings", index, "command"])
  }

  for (const [index, item] of (contributes.statusItems ?? []).entries()) {
    if (item.command !== undefined) {
      declared(item.command, ["contributes", "statusItems", index, "command"])
    }
  }

  for (const [index, tool] of (contributes.agentTools ?? []).entries()) {
    needsPrefix(tool.name, ["contributes", "agentTools", index, "name"])
  }

  for (const key of Object.keys(contributes.settings ?? {})) {
    needsPrefix(key, ["contributes", "settings", key])
  }

  for (const [index, event] of read.activates.entries()) {
    const [kind, id] = splitEvent(event)

    if (kind === "onCommand") {
      declared(id, ["activates", index])
    } else if (kind === "onView" && !views.has(id)) {
      problems.push({ path: ["activates", index], message: `names a tab or page the manifest doesn't declare: ${id}` })
    }
  }

  return problems

  function contextNeedsPrefix(key: string | undefined, path: (string | number)[]) {
    if (key !== undefined) {
      needsPrefix(key.replace(/^!/, ""), path)
    }
  }
}

function isPart(text: string): boolean {
  return part.test(text)
}

/** An activation event's kind, and the id after its colon. */
export function splitEvent(event: ActivationEvent): [kind: string, id: string] {
  const colon = event.indexOf(":")

  return colon === -1 ? [event, ""] : [event.slice(0, colon), event.slice(colon + 1)]
}
