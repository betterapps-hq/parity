import { codedErrors } from "../shared/coded-errors.ts"
import type { Answer, ServiceMethod, ServiceMethods } from "../shared/protocol.ts"
import type { Attributes } from "./chrome/event-attributes.ts"
import { errorCode, track } from "./report-error.ts"
import { currentTraceHeaders } from "./tracing.ts"

/**
 * Asks the project service. A failure throws as it was thrown there: a `CodedError` keeps its code, field and
 * alternatives, which the bridge to the preload script would otherwise drop (PAR-580). It carries the action or
 * gesture it's asked in, so the service's work is in that trace (PAR-629).
 */
export async function request<M extends ServiceMethod>(
  method: M,
  params: ServiceMethods[M]["params"]
): Promise<ServiceMethods[M]["result"]> {
  const trace = currentTraceHeaders()

  try {
    return settled(await (trace ? window.canvasHost.ask(method, params, trace) : window.canvasHost.ask(method, params)))
  } catch (error) {
    const failed: Attributes<"ipc.failed"> = { method }
    const code = errorCode(error)

    if (code) {
      failed.code = code
    }

    track("ipc.failed", failed)
    throw error
  }
}

/** An answer's result, or its failure thrown, with checked details. */
export function settled<Result>(answer: Answer<Result>): Result {
  if ("error" in answer) {
    throw codedErrors.decode(answer.error, answer.details)
  }

  return answer.result
}

/**
 * A stand-in service's answers as the preload script gives them: what `answer` returns, or what it throws as data, with
 * a coded error's details. For stories and tests.
 */
export function preloadAnswers(
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- a stand-in service answers what its story or test needs, passed on unread as the preload script passes a reply
  answer: <M extends ServiceMethod>(method: M, params: ServiceMethods[M]["params"]) => unknown
): <M extends ServiceMethod>(
  method: M,
  params: ServiceMethods[M]["params"]
) => Promise<Answer<ServiceMethods[M]["result"]>> {
  return (method, params) => {
    const failed = (cause: unknown) => codedErrors.encode(cause)

    // Asked at once, as the preload script sends at once, so a test sees the request before it awaits.
    try {
      return Promise.resolve(answer(method, params)).then(
        // SAFETY: the stand-in answers each method as its story or test expects that method's result.
        (result) => ({ result: result as never }),
        failed
      )
    } catch (error) {
      return Promise.resolve(failed(error))
    }
  }
}
