import type {
  CommandContribution,
  CommandTarget,
  MenuPlacement,
  StatusItemContribution
} from "@parity-app/extension-api"
import { toast } from "sonner"
import type { ExtensionStatus, LogLine } from "../shared/protocol.ts"
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
function showing(extension: ExtensionStatus): boolean {
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

/** Whether a context key holds for `target`: `true`, or a list holding the target's key. `!key` turns it around. */
function holds(extension: ExtensionStatus, key: string | undefined, target: CommandTarget | undefined): boolean {
  if (key === undefined) {
    return true
  }

  const negated = key.startsWith("!")
  const value = extension.context[negated ? key.slice(1) : key]
  const found = value === true || (Array.isArray(value) && target !== undefined && value.includes(target.key))

  return negated ? !found : found
}

/** The commands extensions place at `placement`, for `target`, in the order their manifests list them. */
export function commandsAt(
  extensions: readonly ExtensionStatus[],
  placement: MenuPlacement,
  target?: CommandTarget
): PlacedCommand[] {
  return extensions.filter(showing).flatMap((extension) =>
    (extension.contributes.menus?.[placement] ?? []).flatMap((item): PlacedCommand[] => {
      const command = extension.contributes.commands?.find((declared) => declared.id === item.command)

      if (!command || !holds(extension, item.when, target)) {
        return []
      }

      const enabled = holds(extension, item.enablement, target)
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
