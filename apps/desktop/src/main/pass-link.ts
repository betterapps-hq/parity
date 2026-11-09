import type { Fetch } from "@parity-app/account"
import type { CopyEntry } from "@parity-app/agent/routing"
import { passedLinkAnswer } from "../shared/account.ts"

/** The link in a launch's arguments, when the system started this process to hand it a sign-in. */
export function launchLink(argv: readonly string[]): string | undefined {
  return argv.find((argument) => argument.toLowerCase().startsWith("parity://auth/"))
}

/**
 * Passes a link the browser handed back to the copy of Parity whose sign-in it is. Each running copy has an entry in
 * the agent registry; each one's local service is asked in turn, and the one waiting for the link's `state` takes it.
 * Only the copy that started sign-in has the PKCE verifier, so no other copy can use the code. Says whether one took it.
 */
export async function passLink(
  link: string,
  copies: readonly CopyEntry[],
  self: number,
  fetch: Fetch
): Promise<boolean> {
  for (const copy of copies) {
    if (copy.app === self) {
      continue
    }

    try {
      const response = await fetch(new URL("/auth/link", copy.url).href, {
        method: "POST",
        headers: { authorization: `Bearer ${copy.token}`, "content-type": "application/json" },
        body: JSON.stringify({ link }),
        signal: AbortSignal.timeout(5000)
      })

      if (passedLinkAnswer.safeParse(await response.json()).data?.taken) {
        return true
      }
    } catch {
      // A copy that quit, or one from before sign-in, which has no such route.
    }
  }

  return false
}
