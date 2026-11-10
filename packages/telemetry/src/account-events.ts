import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * Signing in, refreshing, signing out and the kept accounts (PAR-807). None of these carries a token or an email: they
 * describe an account by its provider alone and count the accounts.
 */

const provider = z.enum(["GoogleOAuth", "GitHubOAuth", "MicrosoftOAuth", "authkit"]).describe("How they signed in")
const accounts = z.number().int().nonnegative().describe("The accounts signed in or listed afterwards")
const current = z.boolean().describe("Whether it was the account the person was in")

/** What WorkOS answered, without its message, which can name the account. */
const answer = {
  status: z.number().int().optional().describe("The HTTP status WorkOS answered with, when it answered"),
  code: z.string().optional().describe("WorkOS's or the browser's error code, when it gave one")
}

export const accountSignedIn = defineEvent(
  "account.signedIn",
  z.object({
    provider,
    again: z.boolean().describe("Whether it signed in to an account already listed, as after its session ended"),
    kept: z.boolean().describe("Whether it's kept between launches, false where the system has no keyring"),
    accounts
  }),
  { level: "info", sentBy: ["main"], when: "Someone signs in to an account." }
)

export const accountSignInProblem = defineEvent(
  "account.signInProblem",
  z.object({
    provider,
    problem: z
      .enum(["canceled", "failed", "refused", "single-sign-on", "choose-organization", "browser"])
      .describe(
        "Why: canceled in the browser, failed, turned down by WorkOS, sent to single sign-on, asked to choose an organization, or the browser didn't open"
      ),
    ...answer
  }),
  { level: "warn", sentBy: ["main"], when: "A sign-in ends without a session, or its browser doesn't open." }
)

const organization = z.boolean().describe("Whether it moved the account to another organization")

export const accountRefreshed = defineEvent(
  "account.refreshed",
  z.object({
    organization,
    retries: z.number().int().nonnegative().describe("The tries that failed before this one")
  }),
  { level: "info", sentBy: ["main"], when: "An account's session is refreshed." }
)

export const accountRefreshFailed = defineEvent(
  "account.refreshFailed",
  z.object({
    reason: z
      .enum(["unavailable", "refused", "superseded"])
      .describe(
        "Why: WorkOS didn't answer, WorkOS turned it down, or another copy of Parity refreshed with the same token first"
      ),
    organization,
    failures: z.number().int().nonnegative().describe("The refreshes in a row that failed, this one included"),
    ...answer
  }),
  { level: "warn", sentBy: ["main"], when: "A refresh fails. Parity tries again unless WorkOS turned it down." }
)

export const accountSessionEnded = defineEvent(
  "account.sessionEnded",
  z.object({
    reason: z.enum(["refused", "elsewhere"]).describe("Why: WorkOS turned down its refresh, or another copy ended it"),
    current
  }),
  { level: "warn", sentBy: ["main"], when: "An account's session ends without the person signing out." }
)

export const accountSignedOut = defineEvent(
  "account.signedOut",
  z.object({
    reason: z.enum(["person", "elsewhere"]).describe("Who signed out: the person here, or another copy of Parity"),
    current,
    ended: z.boolean().describe("Whether its session had already ended, so this only removed it from the list"),
    accounts
  }),
  { level: "info", sentBy: ["main"], when: "An account is signed out of, or removed after its session ended." }
)

export const accountStoreFailed = defineEvent(
  "account.storeFailed",
  z.object({
    action: z.enum(["read", "write"]).describe("Whether Parity was reading the kept accounts or writing them"),
    stage: z
      .enum(["file", "decrypt", "json", "schema", "reencrypt"])
      .optional()
      .describe(
        "Where reading failed: decrypting, parsing, checking, or writing it again with the keychain's new key. The file is cleared, signing every account out"
      ),
    error: z.string().describe("The error's name, never its message, which can hold what was decrypted"),
    code: z.string().optional().describe("The system error code, as `EPERM`, when there is one")
  }),
  { level: "warn", sentBy: ["main"], when: "The file that keeps accounts between launches can't be read or written." }
)

export const accountStateFailed = defineEvent(
  "account.stateFailed",
  z.object({
    stage: z.enum(["ask", "check"]).describe("Whether asking main failed, or its answer didn't match the schema"),
    message: z.string().describe("What went wrong, without the answer itself"),
    pointer: z.string().optional().describe("Where the answer didn't match, as a JSON pointer")
  }),
  { level: "warn", sentBy: ["renderer"], when: "A window can't find out who's signed in." }
)

export const accountEvents = [
  accountSignedIn,
  accountSignInProblem,
  accountRefreshed,
  accountRefreshFailed,
  accountSessionEnded,
  accountSignedOut,
  accountStoreFailed,
  accountStateFailed
] as const
