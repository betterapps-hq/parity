import { type AccountPerson, accountPerson, type AccountState } from "../shared/account.ts"
import type { Account } from "./account.ts"

/**
 * Who a copy run from source starts signed in as, from `PARITY_SIGNED_IN_AS`: JSON such as
 * `{"email":"ada@example.com","name":"Ada Lovelace"}`. Throws, naming what's wrong, for anything else, so a test run
 * with a bad one fails as it starts.
 */
export function readStandIn(text: string): AccountPerson {
  let json: unknown

  try {
    json = JSON.parse(text)
  } catch {
    throw new TypeError("PARITY_SIGNED_IN_AS isn't JSON")
  }

  const parsed = accountPerson.safeParse(json)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new TypeError(`PARITY_SIGNED_IN_AS's ${issue?.path.join(".") || "value"}: ${issue?.message ?? "invalid"}`)
  }

  return parsed.data
}

/**
 * Someone signed in without WorkOS (PAR-1008), for the end-to-end tests and `pnpm perf`, which need a copy that's past
 * the sign-in screen and can't sign in through a browser. It holds no tokens, so nothing that needs Parity's service
 * works as them. Signing out leaves nobody signed in, as it does for a real account, and nothing signs back in.
 */
export function standInAccount(person: AccountPerson, changed: (state: AccountState) => void): Account {
  let signedIn = true

  const state = (): AccountState => ({
    account: signedIn ? { ...person, untilQuit: false } : null,
    accounts: signedIn ? [{ ...person, provider: "authkit" }] : [],
    attempt: null,
    ended: null
  })

  return {
    state,
    restore: async () => changed(state()),
    // No token, so Parity's service answers a search as it would for someone signed out (PAR-131).
    accessToken: async () => undefined,
    signIn: async () => undefined,
    reopen: async () => undefined,
    cancel: () => undefined,
    async signOut(email) {
      if (signedIn && email === person.email) {
        signedIn = false
        changed(state())
      }
    },
    use: async () => undefined,
    switchOrganization: async () => undefined,
    owns: () => false,
    takeLink: async () => "not-mine"
  }
}
