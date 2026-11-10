import type { z } from "zod"
import {
  type Access,
  type CheckedRequest,
  checkRequest,
  type ConnectorInfo,
  type Problem,
  type ProblemAnswer,
  type SearchRequest
} from "./connector.ts"

/*
 * What every adapter does around its own mapping: check the search and the key before sending anything, send it, and
 * turn a failed, slow or unreadable answer into a problem in the source's name. An adapter writes only its URL, its
 * request, its answer's schema and what its failures mean.
 */

/** A problem answer. */
export function refusal(code: Problem["code"], message: string): ProblemAnswer {
  return { problem: { code, message } }
}

/**
 * A search checked against what the connector takes, with its key: a problem naming the field at fault or asking for a
 * key, or the search with its defaults and the key to send.
 */
export function prepare(
  info: ConnectorInfo,
  request: SearchRequest,
  access: Access
): ProblemAnswer | { request: CheckedRequest; key: string } {
  const checked = checkRequest(info, request)

  if ("problem" in checked) {
    return checked
  }

  if (!access.key) {
    const name = info.apiKey?.name ?? "key"

    return refusal("no-key", `Add ${article(info.name)} ${info.name} ${name} to search ${info.name}.`)
  }

  return { request: checked.request, key: access.key }
}

export interface JsonRequest<T> {
  /** The source's name, for the problems this writes. */
  source: string
  url: string
  /** Everything but the signal, which comes from `access`. */
  init: RequestInit
  /** What a successful answer must be. */
  schema: z.ZodType<T>
  /** What a failure the source answered with means, from its status, headers and body. */
  refused(response: Response, body: string): ProblemAnswer
}

/**
 * Sends a request and reads its JSON answer. A fetch that fails or is stopped, a failure the source answers with, and
 * an answer the schema doesn't read are each a problem, so the adapter never catches anything itself.
 */
export async function requestJson<T>(access: Access, request: JsonRequest<T>): Promise<ProblemAnswer | { data: T }> {
  const init: RequestInit = { ...request.init }

  if (access.signal) {
    init.signal = access.signal
  }

  let response: Response

  try {
    response = await access.fetch(request.url, init)
  } catch (error) {
    const stopped = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")

    return refusal(
      "unavailable",
      stopped
        ? `${request.source} took too long to answer. Try again.`
        : `Couldn't reach ${request.source}. Check your connection and try again.`
    )
  }

  if (!response.ok) {
    return request.refused(response, await response.text().catch(() => ""))
  }

  const parsed = request.schema.safeParse(await response.json().catch(() => undefined))

  if (!parsed.success) {
    return refusal("unavailable", `${request.source} answered with something Parity couldn't read. Try again.`)
  }

  return { data: parsed.data }
}

/** Sends a request whose answer doesn't matter, as a report of a use. A failure is let go. */
export async function notify(access: Access, url: string, init: RequestInit): Promise<void> {
  const sent: RequestInit = { ...init }

  if (access.signal) {
    sent.signal = access.signal
  }

  try {
    await access.fetch(url, sent)
  } catch {
    // The source's count, not something the person waits on.
  }
}

/** Reads JSON text with a schema, or nothing when it isn't JSON or doesn't match: for what a failure's body says. */
export function readJson<T>(text: string, schema: z.ZodType<T>): T | undefined {
  try {
    return schema.safeParse(JSON.parse(text)).data
  } catch {
    return undefined
  }
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}
