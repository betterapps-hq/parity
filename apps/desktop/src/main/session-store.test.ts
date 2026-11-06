import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { type Encryption, sessionStore, type StoredSession } from "./session-store.ts"

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
      if (!result.startsWith("{")) throw new Error("Not this keychain's")
      return { result, shouldReEncrypt: false }
    }
  }
}

const session: StoredSession = {
  refreshToken: "refresh-1",
  person: { email: "ada@example.com", name: "Ada Lovelace", organizationId: "org_1", role: "admin" },
  provider: "GitHubOAuth"
}

describe("sessionStore", () => {
  it("keeps the session encrypted, reads it back and forgets it", async () => {
    const store = sessionStore(file, keychain(), "win32")
    expect(await store.save(session)).toBe(true)
    expect(readFileSync(file, "utf8")).not.toContain("refresh-1")
    expect(await sessionStore(file, keychain(), "win32").read()).toEqual(session)
    store.clear()
    expect(existsSync(file)).toBe(false)
    expect(await store.read()).toBeUndefined()
  })

  it("keeps nothing on Linux without a keyring, where it would be plain text", async () => {
    const store = sessionStore(file, keychain("basic_text"), "linux")
    expect(await store.persistent()).toBe(false)
    expect(await store.save(session)).toBe(false)
    expect(existsSync(file)).toBe(false)
    expect(await sessionStore(file, keychain("kwallet5"), "linux").persistent()).toBe(true)
  })

  it("keeps nothing when the system can't encrypt at all", async () => {
    expect(await sessionStore(file, keychain(undefined, false), "darwin").save(session)).toBe(false)
  })

  it("forgets a file it can't read, as after the keychain changed", async () => {
    writeFileSync(file, "not what the keychain wrote")
    expect(await sessionStore(file, keychain(), "win32").read()).toBeUndefined()
    expect(existsSync(file)).toBe(false)
  })
})
