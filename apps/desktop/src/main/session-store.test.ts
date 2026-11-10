import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import {
  type Encryption,
  type StoreProblem,
  type StoredAccount,
  type StoredAccounts,
  sessionStore,
  withAccount,
  withoutAccount
} from "./session-store.ts"

let folder = ""
let file = ""

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-session-"))
  file = join(folder, "account")
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

/** A keychain that encodes the text as base64, so what's written is never the token as given. */
function keychain(backend?: string, available = true): Encryption {
  return {
    isAsyncEncryptionAvailable: async () => available,
    getSelectedStorageBackend: () => backend ?? "gnome_libsecret",
    encryptStringAsync: async (text) => Buffer.from(Buffer.from(text).toString("base64")),
    decryptStringAsync: async (encrypted) => {
      const result = Buffer.from(encrypted.toString(), "base64").toString()

      if (!result.startsWith("{")) {
        throw new Error("Not this keychain's")
      }

      return { result, shouldReEncrypt: false }
    }
  }
}

const ada: StoredAccount = {
  refreshToken: "refresh-1",
  person: { email: "ada@example.com", name: "Ada Lovelace", organizationId: "org_1", role: "admin" },
  provider: "GitHubOAuth"
}

const work: StoredAccount = {
  refreshToken: "refresh-2",
  person: { email: "ada@contoso.com" },
  provider: "MicrosoftOAuth"
}

describe("sessionStore", () => {
  it("keeps the accounts encrypted, reads them back and forgets them", async () => {
    const store = sessionStore(file, keychain(), "win32")
    expect(await store.update((kept) => ({ current: "ada@example.com", ...withAccount(kept, ada) }))).toBe(true)
    expect(await store.update((kept) => withAccount(kept, work))).toBe(true)
    expect(readFileSync(file, "utf8")).not.toContain("refresh-1")
    expect(await sessionStore(file, keychain(), "win32").read()).toEqual({
      current: "ada@example.com",
      accounts: [ada, work]
    })
    store.clear()
    expect(existsSync(file)).toBe(false)
    expect(await store.read()).toBeUndefined()
  })

  it("removes the file once no account is left", async () => {
    const store = sessionStore(file, keychain(), "win32")
    await store.update((kept) => withAccount(kept, ada))
    await store.update((kept) => withoutAccount(kept, ada.person.email))
    expect(existsSync(file)).toBe(false)
  })

  it("keeps nothing on Linux without a keyring, where it would be plain text", async () => {
    const store = sessionStore(file, keychain("basic_text"), "linux")
    expect(await store.persistent()).toBe(false)
    expect(await store.update((kept) => withAccount(kept, ada))).toBe(false)
    expect(existsSync(file)).toBe(false)
    expect(await sessionStore(file, keychain("kwallet5"), "linux").persistent()).toBe(true)
  })

  it("keeps nothing when the system can't encrypt at all", async () => {
    expect(await sessionStore(file, keychain(undefined, false), "darwin").update((kept) => kept)).toBe(false)
  })

  it("forgets a file it can't read, as after the keychain changed or from a build that kept one account", async () => {
    const problems: StoreProblem[] = []
    const store = sessionStore(file, keychain(), "win32", (problem) => problems.push(problem))
    writeFileSync(file, "not what the keychain wrote")
    expect(await store.read()).toBeUndefined()
    expect(existsSync(file)).toBe(false)
    writeFileSync(file, Buffer.from(Buffer.from(JSON.stringify(ada)).toString("base64")))
    expect(await store.read()).toBeUndefined()
    expect(existsSync(file)).toBe(false)
    writeFileSync(file, Buffer.from(Buffer.from("{ not json").toString("base64")))
    expect(await store.read()).toBeUndefined()
    // Each says where reading failed and the error's name, never what was decrypted.
    expect(problems).toEqual([
      { action: "read", stage: "decrypt", error: "Error" },
      { action: "read", stage: "schema", error: "ZodError" },
      { action: "read", stage: "json", error: "SyntaxError" }
    ])
  })

  it("says nothing when there's no file, and keeps one it can't open, saying why", async () => {
    const problems: StoreProblem[] = []
    expect(await sessionStore(file, keychain(), "win32", (problem) => problems.push(problem)).read()).toBeUndefined()
    expect(problems).toEqual([])
    mkdirSync(file)
    expect(await sessionStore(file, keychain(), "win32", (problem) => problems.push(problem)).read()).toBeUndefined()
    expect(problems).toEqual([{ action: "read", stage: "file", error: "Error", code: "EISDIR" }])
    expect(existsSync(file)).toBe(true)
  })
})

describe("withAccount and withoutAccount", () => {
  const kept: StoredAccounts = { current: "ada@contoso.com", accounts: [ada, work] }

  it("replaces an account in its place, and adds a new one at the end", () => {
    const signedInAgain = { ...ada, refreshToken: "refresh-3" }
    expect(withAccount(kept, signedInAgain).accounts).toEqual([signedInAgain, work])
    const third = { ...work, person: { email: "ada@hey.com" } }
    expect(withAccount(kept, third).accounts).toEqual([ada, work, third])
  })

  it("forgets which account Parity was in only when that one goes", () => {
    expect(withoutAccount(kept, "ada@example.com")).toEqual({ current: "ada@contoso.com", accounts: [work] })
    expect(withoutAccount(kept, "ada@contoso.com")).toEqual({ accounts: [ada] })
  })
})
