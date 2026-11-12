import { describe, expect, it } from "vite-plus/test"
import type { AccountState } from "../shared/account.ts"
import { readStandIn, standInAccount } from "./stand-in-account.ts"

const ada = { email: "ada@example.com", name: "Ada Lovelace" }

describe("readStandIn", () => {
  it("reads who to sign in as", () => {
    expect(readStandIn('{"email":"ada@example.com","name":"Ada Lovelace"}')).toEqual(ada)
  })

  it("says what's wrong with anything else", () => {
    expect(() => readStandIn("ada")).toThrow("PARITY_SIGNED_IN_AS isn't JSON")
    expect(() => readStandIn('{"name":"Ada"}')).toThrow("PARITY_SIGNED_IN_AS's email")
    expect(() => readStandIn('{"email":"ada@example.com","token":"x"}')).toThrow("PARITY_SIGNED_IN_AS's value")
  })
})

describe("standInAccount", () => {
  it("starts signed in as them, and tells the window as Parity starts", async () => {
    const states: AccountState[] = []
    const account = standInAccount(ada, (state) => states.push(state))

    await account.restore()

    expect(account.state()).toEqual({
      account: { ...ada, untilQuit: false },
      accounts: [{ ...ada, provider: "authkit" }],
      attempt: null,
      ended: null
    })
    expect(states).toEqual([account.state()])
  })

  it("takes no sign-in link", async () => {
    const account = standInAccount(ada, () => undefined)

    expect(account.owns("parity://auth/callback?state=1")).toBe(false)
    expect(await account.takeLink("parity://auth/callback?state=1")).toBe("not-mine")
  })

  it("signs out, leaving nobody signed in, and only for its own email", async () => {
    const states: AccountState[] = []
    const account = standInAccount(ada, (state) => states.push(state))

    await account.signOut("grace@example.com")
    expect(account.state().account).not.toBeNull()

    await account.signOut("ada@example.com")
    expect(account.state()).toEqual({ account: null, accounts: [], attempt: null, ended: null })
    expect(states).toHaveLength(1)
  })
})
