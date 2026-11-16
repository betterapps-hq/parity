import { type CommandAttributes, startTrace, tracedCommand } from "../tracing.ts"
import type { ProjectSession } from "../workspace.ts"
import type { Action, ActionResult } from "./actions.ts"

/** What asked for an action, as `command.ran` records it. */
export type CommandSource = CommandAttributes["from"]

export interface RunOptions {
  /** The key that ran it, for an action that acts on which of its keys was pressed. */
  event?: KeyboardEvent
  /** The tab it acts on, for a panel or toolbar that belongs to one, such as the Tokens panel's Save; else the active tab. */
  session?: ProjectSession
  /**
   * Runs this in the action's place, for the action bound to where it was asked for, such as New screen where the
   * canvas menu opened or Rename in place in Layers.
   */
  instead?: () => ActionResult
}

/** An action as the rest of the window runs it: through `run`, which records it. */
export interface RecordedAction extends Omit<Action, "run"> {
  /**
   * Runs the action and records it as `command.ran`, in a trace of its own that the work it causes in the service and
   * main joins (PAR-629). One that doesn't apply now is recorded as cancelled and doesn't run.
   */
  run(from: CommandSource, options?: RunOptions): ActionResult
}

/** How many layers, and with none, how many designs are selected, as `command.ran` records them. */
export interface SelectedCount {
  layers: number
  designs: number
}

/** What recording an action asks of the tab it acts on. */
export interface Recording<Id extends string> {
  /** The tab an action acts on when it isn't given one. */
  session(): ProjectSession | undefined
  /** Whether the action applies in `session` now. */
  enabled(id: Id, session: ProjectSession | undefined): boolean
  selected(session: ProjectSession | undefined): SelectedCount
  /** Hears of each one that applies as it starts, however it's run, as Repeat last action remembers it. */
  ran?(id: Id): void
}

/**
 * Wraps each action so it's recorded by its ID however it's run: the one place commands are recorded (PAR-639). What
 * an action returns or throws passes through unchanged.
 */
export function recordActions<Id extends string>(
  definitions: Record<Id, Action>,
  recording: Recording<Id>
): Record<Id, RecordedAction> {
  // SAFETY: the loop below gives it an entry for every ID before it's returned.
  const recorded = {} as Record<Id, RecordedAction>

  // SAFETY: `definitions` is a Record<Id, Action>, so its own keys are the IDs.
  for (const id of Object.keys(definitions) as Id[]) {
    const action = definitions[id]
    recorded[id] = {
      ...action,
      run(from, { event, session = recording.session(), instead } = {}) {
        const enabled = recording.enabled(id, session)
        const attributes = { action: id, from, enabled, ...recording.selected(session) }

        if (!enabled) {
          startTrace("command.ran", attributes).end("cancelled")

          return undefined
        }

        return tracedCommand(attributes, () => {
          recording.ran?.(id)

          return instead ? instead() : action.run(session, event)
        })
      }
    }
  }

  return recorded
}
