import { libraryDecorator, parseData, peerVersions, type ToolVersions } from "@parity-app/core"
import { z } from "zod"
import type {
  ActivationEvent,
  AgentToolContribution,
  CommandContribution,
  Contributions,
  Detection,
  JsonSchema,
  JsonValue,
  Manifest,
  MenuItem,
  MenuPlacement,
  PathIcon,
  Providers,
  SettingContribution,
  ToolVersionFacts
} from "../index.ts"
import { keymapKeys } from "./keys.ts"
import { fits } from "./settings.ts"
import { isBuiltInKey, parseWhen, type When, whenKeys } from "./when.ts"

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

/** Whether a `permissions.processes` entry is well formed: a kind of run, then what it names. */
function isProcessPermission(entry: string): boolean {
  return /^(bin|script|exec|node):\S+$/.test(entry)
}

/** Path data's commands and numbers, and nothing that could carry script. */
const pathData = /^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\-\s]+$/

/** A six-digit hex color, and nothing else, so it can't carry CSS. */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected a six-digit hex color, as #FF4785")

const pathIcon = z.strictObject({
  viewBox: z.string().regex(/^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/, "expected four numbers, as 0 0 24 24"),
  path: z.string().trim().min(1, "can't be blank").regex(pathData, "expected path data, as an SVG path's d"),
  fillRule: z.enum(["nonzero", "evenodd"]).optional(),
  color: z.strictObject({ light: hexColor, dark: hexColor }).optional()
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

/** A `when` or `enablement`: context keys and comparisons, joined with `&&`, `||` and `!` (see `when.ts`). */
const contextKey = z.string().superRefine((text, context) => {
  try {
    parseWhen(text)
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) })
  }
})

/** Keys as a manifest writes them, `mod+shift+t`, which the keymap's form must be made from. */
const keys = z.string().superRefine((text, context) => {
  try {
    keymapKeys(text)
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) })
  }
})

const menuItem = z.strictObject({
  command: z.string(),
  when: contextKey.optional(),
  enablement: contextKey.optional(),
  disabledReason: z.string().optional()
}) satisfies z.ZodType<MenuItem>

const placements = [
  "layers",
  "canvas",
  "designTitle",
  "selectionHeading",
  "componentCard",
  "media",
  "process",
  "search"
] as const

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

/** A decorator a router declares: JSON, whose value forms core's library decorator schema checks. */
const frameDecorator = z
  .strictObject({
    when: z.record(z.string(), z.string()).optional(),
    wrap: z.strictObject({
      import: z.string().min(1),
      component: z.string().min(1),
      props: z.record(z.string(), jsonValue).optional()
    })
  })
  .superRefine((decorator, context) => {
    const checked = libraryDecorator.safeParse(decorator)

    for (const issue of checked.success ? [] : checked.error.issues) {
      context.addIssue({ code: "custom", message: issue.message, path: issue.path })
    }
  })

/** A regular expression's source, which has to compile. */
const pattern = z
  .string()
  .min(1)
  .max(200)
  .refine((source) => {
    try {
      return new RegExp(source).source !== ""
    } catch {
      return false
    }
  }, "isn't a regular expression")

const providers = z.strictObject({
  renderer: z
    .strictObject({
      guest: z.string(),
      runtimePackages: z.array(z.string()),
      runtimeImports: z.array(z.string()),
      developmentStandIns: z.record(z.string(), z.string()).optional(),
      componentExtensions: z.array(z.string())
    })
    .optional(),
  builder: z
    .strictObject({
      entry: z.string(),
      watches: z.array(z.string()),
      console: z
        .strictObject({
          chatter: z.array(pattern).max(20).optional(),
          generatedPaths: z.array(pattern).max(20).optional()
        })
        .optional()
    })
    .optional(),
  styles: empty.optional(),
  router: z.strictObject({ decorators: z.array(frameDecorator).max(20).optional() }).optional(),
  entities: z
    .strictObject({
      watches: z.array(z.string()).optional(),
      group: z.string().min(1).max(40).optional(),
      states: z.strictObject({ one: z.string().min(1).max(40), many: z.string().min(1).max(40) }).optional(),
      color: z.strictObject({ light: z.string().min(1).max(100), dark: z.string().min(1).max(100) }).optional()
    })
    .optional(),
  connector: empty.optional(),
  search: empty.optional(),
  addresses: empty.optional(),
  discovery: empty.optional()
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
  keybindings: z.array(z.strictObject({ command: z.string(), key: keys, when: contextKey.optional() })).optional(),
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

const toolVersions = z.strictObject({
  scope: z.string().min(1, "can't be blank").optional(),
  prefix: z.string().min(1, "can't be blank").optional(),
  distributions: z.record(z.string(), title).optional()
}) satisfies z.ZodType<ToolVersionFacts>

const detection = z.strictObject({
  peers: z.boolean().optional(),
  entities: z.boolean().optional(),
  paths: z
    .array(
      z
        .string()
        .refine(
          (path) => path.startsWith("~/") || path.startsWith("$") || !/^(?:[\\/]|[a-z]:)/i.test(path),
          "expected a path from the home folder (~/), a variable's folder ($NAME) or the project's root"
        )
    )
    .optional()
}) satisfies z.ZodType<Detection>

const manifest = z
  .strictObject({
    displayName: title,
    prefix: z.string().regex(part, "expected a letter, then letters, digits and dashes"),
    icon: pathIcon,
    activates: z.array(activationEvent),
    detect: detection.optional(),
    watches: z.array(z.string()).optional(),
    versions: toolVersions.optional(),
    permissions: z
      .strictObject({
        read: z.array(z.string()).optional(),
        write: z.array(z.string()).optional(),
        network: z.array(z.string()).optional(),
        processes: z
          .array(z.string().refine(isProcessPermission, "expected bin:, script:, exec: or node:, then what it runs"))
          .optional(),
        observe: z.boolean().optional(),
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
  peerDependencies: z.record(z.string(), z.string()).optional(),
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
  /**
   * Its tool's versions, from its peer dependencies: the packages that carry the version, the main one first, and the
   * range it supports. Unset when it has none.
   */
  versions?: ToolVersions
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

  const versions = peerVersions(read.peerDependencies, read.parity.versions)

  if (versions) {
    found.versions = versions
  }

  return found
}

interface Problem {
  path: (string | number)[]
  message: string
}

/**
 * What breaks the rules of `detect`: entities need an entities provider, and the `read` permission has to name each
 * path, as `~/.portless/**` names `~/.portless`.
 */
function detectionProblems({ detect, permissions, contributes }: Manifest): Problem[] {
  const problems: Problem[] = []

  if (detect?.entities && !contributes.providers?.entities) {
    problems.push({ path: ["detect", "entities"], message: "needs an entities provider in contributes.providers" })
  }

  for (const [index, path] of (detect?.paths ?? []).entries()) {
    const named = (permissions?.read ?? []).some((glob) => glob === path || glob.startsWith(`${path}/`))

    if (!named) {
      problems.push({ path: ["detect", "paths", index], message: `isn't one the "read" permission names: ${path}` })
    }
  }

  return problems
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

  for (const [index, section] of (contributes.sections ?? []).entries()) {
    contextNeedsPrefix(section.when, ["contributes", "sections", index, "when"])
  }

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
    contextNeedsPrefix(binding.when, ["contributes", "keybindings", index, "when"])
  }

  for (const [index, item] of (contributes.statusItems ?? []).entries()) {
    if (item.command !== undefined) {
      declared(item.command, ["contributes", "statusItems", index, "command"])
    }
  }

  for (const [index, tool] of (contributes.agentTools ?? []).entries()) {
    needsPrefix(tool.name, ["contributes", "agentTools", index, "name"])
  }

  for (const [key, setting] of Object.entries(contributes.settings ?? {})) {
    needsPrefix(key, ["contributes", "settings", key])
    problems.push(...settingProblems(setting).map((message) => ({ path: ["contributes", "settings", key], message })))
  }

  for (const [index, event] of read.activates.entries()) {
    const [kind, id] = splitEvent(event)

    if (kind === "onCommand") {
      declared(id, ["activates", index])
    } else if (kind === "onView" && !views.has(id)) {
      problems.push({ path: ["activates", index], message: `names a tab or page the manifest doesn't declare: ${id}` })
    }
  }

  problems.push(...detectionProblems(read))

  return problems

  /** Every key a `when` looks up is Parity's own, as `node.type`, or starts with the prefix. */
  function contextNeedsPrefix(when: string | undefined, path: (string | number)[]) {
    if (when === undefined) {
      return
    }

    let parsed: When

    // One that doesn't read is named by its own check.
    try {
      parsed = parseWhen(when)
    } catch {
      return
    }

    for (const key of whenKeys(parsed)) {
      if (!isBuiltInKey(key)) {
        needsPrefix(key, path)
      }
    }
  }
}

/** What a setting's schema says of itself that can't hold: choices for a number, or a default that isn't one of them. */
function settingProblems(setting: SettingContribution): string[] {
  const problems: string[] = []

  if (setting.enum && setting.type !== "string") {
    problems.push("only a string setting can have choices in enum")
  }

  if (setting.enumTitles && setting.enumTitles.length !== setting.enum?.length) {
    problems.push("enumTitles must name each of enum's choices, in its order")
  }

  if (setting.default !== undefined && !fits(setting, setting.default)) {
    problems.push(`its default, ${JSON.stringify(setting.default)}, doesn't fit its type and choices`)
  }

  return problems
}

function isPart(text: string): boolean {
  return part.test(text)
}

/** An activation event's kind, and the id after its colon. */
export function splitEvent(event: ActivationEvent): [kind: string, id: string] {
  const colon = event.indexOf(":")

  return colon === -1 ? [event, ""] : [event.slice(0, colon), event.slice(colon + 1)]
}
