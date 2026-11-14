import { locateNode } from "@parity-app/core"
import { selectionRefs } from "@parity-app/editor"
import type {
  CommandContribution,
  CommandTarget,
  MenuPlacement,
  NodeRef,
  StatusItemContribution
} from "@parity-app/extension-api"
import { type ExtensionKey, holdsWhen, type ResolvedKeys, resolveKeys, type WhenValue } from "@parity-app/extensions"
import { toast } from "sonner"
import type { ExtensionStatus, ExtensionUiRequest, LogLine } from "../shared/protocol.ts"
import { type Command, keymap, keysOf } from "./chrome/keymap.ts"
import { matches } from "./chrome/keys.ts"
import { projectPart } from "./project-part.ts"
import { reportError } from "./report-error.ts"
import { request } from "./service.ts"
import { createStore, type Store, useStore } from "./store.ts"
import type { ProjectSession } from "./workspace.ts"

/*
 * An open project's extensions, as the window draws them (PAR-1089): each one's contributions from its manifest, which
 * show before its code loads, with what its host set since, its host's state and its log. The service sends each change
 * as it happens. A host that crashes or gets stuck is named in a notification with Restart, and its contributions leave
 * the panels and menus while it's stopped.
 */

/** What an extension asks of the window that isn't `parity.ui`. */
export type EditorRequest = Extract<
  ExtensionUiRequest,
  { method: "selection.set" | "selection.highlight" | "navigate" | "commands.execute" }
>

/** Whether a request from an extension is one this module answers. */
export function isEditorRequest(asked: ExtensionUiRequest): asked is EditorRequest {
  return (
    asked.method === "selection.set" ||
    asked.method === "selection.highlight" ||
    asked.method === "navigate" ||
    asked.method === "commands.execute"
  )
}

/** A project's extensions and their logs. */
export interface ProjectExtensions {
  extensions: ExtensionStatus[]
  logs: Record<string, LogLine[]>
}

/** How many lines of each extension's log the window keeps, as the service does. */
const keptLines = 500

type Session = Pick<ProjectSession, "id" | "untilClosed">

class Extensions {
  readonly store: Store<ProjectExtensions> = createStore<ProjectExtensions>(() => ({ extensions: [], logs: {} }))
  readonly #session: Session
  #loaded = false

  constructor(session: Session) {
    this.#session = session
    void request("extensions.list", { projectId: session.id }).then(
      (listed) => {
        // What arrived meanwhile is newer than the list.
        const { extensions, logs } = this.store.get()
        this.store.set({
          extensions: this.#loaded ? extensions : listed.extensions,
          logs: { ...listed.logs, ...logs }
        })
        this.#loaded = true
      },
      () => undefined
    )
  }

  changed(extensions: ExtensionStatus[]): void {
    const before = this.store.get().extensions
    this.#loaded = true
    this.store.update((now) => ({ ...now, extensions }))

    for (const extension of extensions) {
      const was = before.find((candidate) => candidate.id === extension.id)?.state

      if (was !== extension.state && (extension.state === "crashed" || extension.state === "stuck")) {
        announceTrouble(this.#session, extension)
      }
    }
  }

  logged(extension: string, line: LogLine): void {
    this.store.update((now) => ({
      ...now,
      logs: { ...now.logs, [extension]: [...(now.logs[extension] ?? []), line].slice(-keptLines) }
    }))
  }

  /** Empties an extension's log in this window. */
  clear(extension: string): void {
    this.store.update((now) => ({ ...now, logs: { ...now.logs, [extension]: [] } }))
  }

  dispose(): void {
    this.store.dispose()
  }
}

/** An open project's extensions. */
export const extensionsOf = projectPart((session: Session) => new Extensions(session))

/** An open project's extensions, drawn again as they change. */
export function useExtensions(session: Session): ProjectExtensions {
  return useStore(extensionsOf(session).store)
}

/** Whether an extension's contributions show: everywhere but while it's stopped after crashing. */
export function showing(extension: ExtensionStatus): boolean {
  return extension.state !== "crashed"
}

/** A command in one placement, for what it's shown for, and whether it can run there. */
export interface PlacedCommand {
  extension: ExtensionStatus
  command: CommandContribution
  enabled: boolean
  /** Why it's greyed, when it is. */
  disabledReason?: string
}

/**
 * What Parity knows of where a command shows, which a manifest's `when` and `enablement` read (PAR-1092): the node it's
 * shown for (`node.type`, `node.owner`, `node.key`), how many things are selected (`selection.count`), the tool picked
 * (`tool`), and the tools the project has (`project.uses(tool)`).
 */
export interface WhenFacts {
  node?: NodeRef
  selectionCount?: number
  tool?: string
  /** The project's tools, by the prefixes of their extensions and the ids of their adapters. */
  tools?: readonly string[]
}

/** What's selected in a project's tab, by `NodeRef`, the one picked last at the end. */
export function selectedRefs(session: Pick<ProjectSession, "selection" | "store">): NodeRef[] {
  return selectionRefs(session.selection.get(), (design, node) => {
    const root = session.store.getEntry(design)?.container.root

    return root && locateNode(root, node)?.node.type
  })
}

/** What the project's tab knows that a `when` reads: what's selected, the tool and the project's tools. */
export function whenFactsOf(session: Pick<ProjectSession, "info" | "selection" | "store">, node?: NodeRef): WhenFacts {
  const refs = selectedRefs(session)
  const { note, reference } = session.selection.get()

  const facts: WhenFacts = {
    // A note or a reference isn't a node, but it's selected.
    selectionCount: refs.length + (note || reference ? 1 : 0),
    tool: session.selection.getTool(),
    tools: session.info.detection.tools.map((tool) => tool.id)
  }

  const shown = node ?? refs.at(-1)

  if (shown) {
    facts.node = shown
  }

  return facts
}

/**
 * Whether a `when` or `enablement` holds for `target`, with what the extension set, its facts about the target
 * (`fact.<id>`) and what Parity knows. A component target is its node when the facts name none.
 */
export function holdsFor(
  extensions: readonly ExtensionStatus[],
  extension: ExtensionStatus,
  text: string | undefined,
  target?: CommandTarget,
  facts: WhenFacts = {}
): boolean {
  const node = facts.node ?? (target ? targetNode(target) : undefined)
  const key = target ? targetKey(target) : node?.key

  const value = (name: string): WhenValue | undefined => {
    switch (name) {
      // Parity's own: it holds for a layer that isn't a component's.
      case "layer":
        return target?.type === "layer"
      case "node.type":
        return node?.type
      case "node.owner":
        return node?.owner
      case "node.key":
        return node?.key
      case "selection.count":
        return facts.selectionCount
      case "tool":
        return facts.tool
      default:
        break
    }

    if (name.startsWith("fact.")) {
      const id = name.slice("fact.".length)
      const found = [extension, ...extensions].flatMap((each) => (key === undefined ? [] : (each.facts[key] ?? [])))

      return found.find((fact) => fact.id === id)?.value
    }

    return extension.context[name]
  }

  const uses = (tool: string) =>
    (facts.tools ?? []).includes(tool) || extensions.some((each) => each.prefix === tool && showing(each))

  return holdsWhen(text, key === undefined ? { value, uses } : { value, uses, target: key })
}

/**
 * What a context key's list holds for a target: a component's key, a layer's as `app.par#home/title`, a page's route
 * id, or a view's item's key.
 */
function targetKey(target: CommandTarget): string {
  return target.type === "layer" ? `${target.design}/${target.node}` : target.key
}

/**
 * A command's target as a node, when the facts name none: a component, a page's route, or a layer of the designs' own.
 * A view's item isn't a node.
 */
function targetNode(target: CommandTarget): NodeRef | undefined {
  switch (target.type) {
    case "component":
      return { owner: "", type: "component", key: target.key }
    case "route":
      return { owner: "", type: "route", key: target.key }
    case "layer":
      return { owner: "design", type: "layer", key: targetKey(target) }
    case "item":
      return undefined
  }
}

/** The commands extensions place at `placement`, for `target`, in the order their manifests list them. */
export function commandsAt(
  extensions: readonly ExtensionStatus[],
  placement: MenuPlacement,
  target?: CommandTarget,
  facts?: WhenFacts
): PlacedCommand[] {
  return extensions.filter(showing).flatMap((extension) =>
    (extension.contributes.menus?.[placement] ?? []).flatMap((item): PlacedCommand[] => {
      const command = extension.contributes.commands?.find((declared) => declared.id === item.command)

      // A layer that isn't a component's, or a page, shows only what's placed for it with a `when`, as `layer` or
      // `node.type == route`, so commands for components, as Open in Storybook, don't show greyed on every one.
      const unplaced = (target?.type === "layer" || target?.type === "route") && item.when === undefined

      if (!command || unplaced || !holdsFor(extensions, extension, item.when, target, facts)) {
        return []
      }

      const enabled = holdsFor(extensions, extension, item.enablement, target, facts)
      const placed: PlacedCommand = { extension, command, enabled }

      if (!enabled && item.disabledReason) {
        placed.disabledReason = item.disabledReason
      }

      return [placed]
    })
  )
}

/** A status bar item an extension declares, with what its code last set. */
export interface ShownStatusItem {
  extension: ExtensionStatus
  item: StatusItemContribution
  value?: string
  tooltip?: string
}

/** The status bar items extensions declare, with their last values, in the order their manifests list them. */
export function statusItems(extensions: readonly ExtensionStatus[]): ShownStatusItem[] {
  return extensions
    .filter(showing)
    .flatMap((extension) =>
      (extension.contributes.statusItems ?? []).map((item) => ({ extension, item, ...extension.status[item.id] }))
    )
}

// SAFETY: `keymap` has a key for each command and no others.
const parityCommands = Object.keys(keymap) as Command[]

/**
 * Which of extensions' keys work, and which clash (PAR-1092): Parity's own keys win, with the person's changes, and a
 * key two extensions ask for goes to neither. An extension stopped after crashing has none.
 */
export function extensionKeys(extensions: readonly ExtensionStatus[]): ResolvedKeys {
  return resolveKeys(
    parityCommands.flatMap((command) => keysOf(command)),
    extensions.flatMap((extension) =>
      showing(extension) ? [{ id: extension.id, keybindings: extension.contributes.keybindings }] : []
    )
  )
}

/** The extension key a key event is, whose `when` holds, if any. */
export function extensionKeyFor(
  event: Parameters<typeof matches>[0],
  extensions: readonly ExtensionStatus[],
  facts: WhenFacts
): { key: ExtensionKey; extension: ExtensionStatus; command: CommandContribution } | undefined {
  for (const key of extensionKeys(extensions).keys) {
    const extension = extensions.find((each) => each.id === key.extension)
    const command = extension?.contributes.commands?.find((declared) => declared.id === key.command)

    if (
      extension &&
      command &&
      matches(event, key.keys) &&
      holdsFor(extensions, extension, key.when, undefined, facts)
    ) {
      return { key, extension, command }
    }
  }

  return undefined
}

/**
 * Runs an extension's command, for what it was run from. A failure is reported naming the command, with Restart when
 * its extension has stopped or isn't answering.
 */
export async function runCommand(
  session: Session,
  { extension, command }: Pick<PlacedCommand, "extension" | "command">,
  target?: CommandTarget
): Promise<void> {
  try {
    await request(
      "extensions.run",
      target ? { projectId: session.id, command: command.id, target } : { projectId: session.id, command: command.id }
    )
  } catch (cause) {
    const current = extensionsOf(session)
      .store.get()
      .extensions.find((candidate) => candidate.id === extension.id)

    const down = current?.state === "crashed" || current?.state === "stuck"

    reportError(cause, {
      operation: "extensions.run",
      title: `${command.title} didn't work`,
      description: cause instanceof Error ? cause.message.slice(0, 600) : String(cause),
      context: { extension: extension.id, command: command.id },
      action: down ? { label: "Restart", onClick: () => restartExtension(session, extension.id) } : undefined
    })
  }
}

/** Ends an extension's host and starts it again. */
export function restartExtension(session: Pick<Session, "id">, extension: string): void {
  void request("extensions.restart", { projectId: session.id, extension }).catch((cause: unknown) =>
    reportError(cause, { operation: "extensions.restart", title: "Couldn't restart the extension" })
  )
}

/** Names an extension that crashed or stopped answering, with Restart. */
function announceTrouble(session: Session, extension: ExtensionStatus): void {
  const title =
    extension.state === "crashed" ? `${extension.displayName} stopped` : `${extension.displayName} isn't answering`

  toast.warning(title, {
    id: `extension-trouble:${session.id}:${extension.id}`,
    description: extension.reason,
    duration: 15_000,
    action: { label: "Restart", onClick: () => restartExtension(session, extension.id) }
  })
}
