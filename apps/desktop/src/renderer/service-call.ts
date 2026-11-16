import { type ReportContext, reportError } from "./report-error.ts"
import { notify, type ToastOptions } from "./toasts.tsx"

/**
 * What a progress notification becomes once its call answers: a success; a failure the answer carries, reported as a
 * thrown one would be; `dismiss` to take it away; or `keep` to leave it for the caller, which replaces it by its id.
 */
export type CallOutcome =
  | ({ success: string } & Omit<ToastOptions, "id">)
  | ({ failure: unknown } & Omit<ReportContext, "id">)
  | "dismiss"
  | "keep"

/** A call to the service, or anything else that takes a while, and what the person and telemetry hear of it. */
export interface ServiceCall<Answer> {
  /** What the notification says while the call runs. */
  progress: string
  /** The progress notification's options, such as a description, or the id of a notification it takes the place of. */
  shown?: ToastOptions
  run: () => Promise<Answer>
  /** Records how it went and says what the notification becomes. `took` is how long the call took, in milliseconds. */
  done: (answer: Answer, took: number) => CallOutcome
  /**
   * What follows a success while the notification shows it, such as reopening the project to load what was added. A
   * failure here fails the call.
   */
  after?: (answer: Answer) => Promise<void>
  /**
   * How a call that throws is reported, and what it records of its own beside `error.caught`. A call that reports its
   * own failures through `done` leaves it out, and one that throws anyway takes its notification away and throws on.
   */
  failed?: Omit<ReportContext, "id" | "description"> & {
    /** The failure's description; its reason in plain words by default. */
    description?: (cause: unknown) => string | undefined
    track?: (cause: unknown, took: number) => void
  }
}

/**
 * Runs a call with a notification saying so: shown while it runs, then turned into its outcome, or into the failure,
 * which is reported and recorded (PAR-991). Gives the answer, or nothing once the call threw and was reported.
 */
export async function serviceCall<Answer>(call: ServiceCall<Answer>): Promise<Answer | undefined> {
  const { progress, shown, run, done, after, failed } = call
  const id = notify.progress(progress, shown)
  const began = performance.now()

  try {
    const answer = await run()
    const outcome = done(answer, Math.round(performance.now() - began))

    if (outcome === "dismiss") {
      notify.close(id)
    } else if (outcome === "keep") {
      // The caller replaces it.
    } else if ("success" in outcome) {
      const { success, ...options } = outcome
      notify.done(success, { ...options, id })
    } else {
      const { failure, ...context } = outcome
      reportError(failure, { ...context, id })
    }

    await after?.(answer)

    return answer
  } catch (error) {
    if (!failed) {
      notify.close(id)

      throw error
    }

    const { description, track: trackFailure, ...report } = failed
    trackFailure?.(error, Math.round(performance.now() - began))
    reportError(error, { ...report, id, description: description?.(error) })

    return undefined
  }
}
