import type { PendingSignIn } from "./authorize.ts"

/**
 * What the link the browser hands back means for a pending sign-in:
 *
 * - `code`: WorkOS signed the person in; exchange the code with the pending verifier.
 * - `declined`: the person turned sign-in down at the provider or on AuthKit's page.
 * - `failed`: WorkOS couldn't sign them in, with its `error` code and its own description when it gave one.
 * - `refused`: the link isn't this sign-in's. `link` when it isn't the redirect URI, `state` when its `state` is missing
 *   or another one's, which another copy of Parity may have started.
 */
export type CallbackResult =
  | { kind: "code"; code: string }
  | { kind: "declined" }
  | { kind: "failed"; error: string; description?: string }
  | { kind: "refused"; reason: "link" | "state" }

/** Reads the link WorkOS sent the browser back to, for the sign-in that's waiting for it. */
export function readCallback(link: string, pending: PendingSignIn): CallbackResult {
  const url = URL.parse(link)
  const expected = new URL(pending.redirectUri)

  if (!url || url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname) {
    return { kind: "refused", reason: "link" }
  }

  const query = url.searchParams

  if (query.get("state") !== pending.state) {
    return { kind: "refused", reason: "state" }
  }

  const error = query.get("error")

  if (error === "access_denied") {
    return { kind: "declined" }
  }

  if (error) {
    const description = query.get("error_description")

    return description ? { kind: "failed", error, description } : { kind: "failed", error }
  }

  const code = query.get("code")

  return code ? { kind: "code", code } : { kind: "failed", error: "missing_code" }
}
