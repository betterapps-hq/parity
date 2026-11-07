import { codedErrors } from "../shared/coded-errors.ts"
import type { Answer, ServiceMethod, ServiceMethods } from "../shared/protocol.ts"
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
  return settled(await (trace ? window.canvasHost.ask(method, params, trace) : window.canvasHost.ask(method, params)))
}

/** An answer's result, or its failure thrown, with checked details. */
export function settled<Result>(answer: Answer<Result>): Result {
  if ("error" in answer) throw codedErrors.decode(answer.error, answer.details)
  return answer.result
}

/**
 * A stand-in service's answers as the preload script gives them: what `answer` returns, or what it throws as data, with
 * a coded error's details. For stories and tests.
 */
export function preloadAnswers(
  answer: <M extends ServiceMethod>(method: M, params: ServiceMethods[M]["params"]) => unknown
): <M extends ServiceMethod>(
  method: M,
  params: ServiceMethods[M]["params"]
) => Promise<Answer<ServiceMethods[M]["result"]>> {
  return (method, params) => {
    const answered = (result: unknown) => ({ result: result as never })
    const failed = (error: unknown) => codedErrors.encode(error)
    // Asked at once, as the preload script sends at once, so a test sees the request before it awaits.
    try {
      return Promise.resolve(answer(method, params)).then(answered, failed)
    } catch (error) {
      return Promise.resolve(failed(error))
    }
  }
}
