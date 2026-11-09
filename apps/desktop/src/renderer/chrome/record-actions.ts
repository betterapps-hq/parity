import { type CommandAttributes, startTrace, tracedCommand } from "../tracing.ts"
import type { Action, ActionResult } from "./actions.ts"

/** What asked for an action, as `command.ran` records it. */
export type CommandSource = CommandAttributes["from"]

export interface RunOptions {
  /** The key that ran it, for an action that acts on which of its keys was pressed. */
  event?: KeyboardEvent
  /**
   * Runs this in the action's place, for the action bound to where it was asked for, such as New screen where the
   * canvas menu opened or Save for a panel's own project.
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

/**
 * Wraps each action so it's recorded by its ID however it's run: the one place commands are recorded (PAR-639). What
 * an action returns or throws passes through unchanged. `ran` hears of each one that applies as it starts, however it's
 * run, as Repeat last action remembers it.
 */
export function recordActions<Id extends string>(
  definitions: Record<Id, Action>,
  selected: () => SelectedCount,
  ran?: (id: Id) => void
): Record<Id, RecordedAction> {
  // SAFETY: the loop below gives it an entry for every ID before it's returned.
  const recorded = {} as Record<Id, RecordedAction>

  // SAFETY: `definitions` is a Record<Id, Action>, so its own keys are the IDs.
  for (const id of Object.keys(definitions) as Id[]) {
    const action = definitions[id]
    recorded[id] = {
      ...action,
      run(from, { event, instead } = {}) {
        const enabled = action.available?.() !== false
        const attributes = { action: id, from, enabled, ...selected() }

        if (!enabled) {
          startTrace("command.ran", attributes).end("cancelled")

          return undefined
        }

        return tracedCommand(attributes, () => {
          ran?.(id)

          return instead ? instead() : action.run(event)
        })
      }
    }
  }

  return recorded
}
