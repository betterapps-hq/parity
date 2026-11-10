import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { keyStore } from "./connector-keys.ts"
import type { Encryption, StoreProblem } from "./session-store.ts"

let folder = ""
let file = ""

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-keys-"))
  file = join(folder, "connector-keys")
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

/** A keychain that encodes the text as base64, so what's written is never the key as given. */
function keychain(backend = "gnome_libsecret"): Encryption {
  return {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => backend,
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

describe("keyStore", () => {
  it("keeps keys encrypted in one file, and reads them back in another copy", async () => {
    const keys = keyStore(file, keychain(), "win32")

    expect(await keys.set("mobbin", "secret-key")).toBe("saved")
    expect(readFileSync(file, "utf8")).not.toContain("secret-key")
    expect(await keyStore(file, keychain(), "win32").read()).toEqual({
      mobbin: { key: "secret-key", source: "saved" }
    })
  })

  it("starts each change from the file, so another copy's key is kept", async () => {
    const mine = keyStore(file, keychain(), "darwin")
    const other = keyStore(file, keychain(), "darwin")

    await mine.read()
    await other.set("unsplash", "u")
    await mine.set("mobbin", "m")

    expect(Object.keys(await mine.read()).sort()).toEqual(["mobbin", "unsplash"])
  })

  it("removes the file when the last key is cleared", async () => {
    const keys = keyStore(file, keychain(), "win32")

    await keys.set("mobbin", "m")
    await keys.clear("mobbin")

    expect(existsSync(file)).toBe(false)
    expect(await keys.read()).toEqual({})
  })

  it("keeps a key only until Parity quits where it would be written as plain text", async () => {
    const keys = keyStore(file, keychain("basic_text"), "linux")

    expect(await keys.set("mobbin", "m")).toBe("session")
    expect(existsSync(file)).toBe(false)
    expect(await keys.read()).toEqual({ mobbin: { key: "m", source: "session" } })

    await keys.clear("mobbin")
    expect(await keys.read()).toEqual({})
  })

  it("forgets a file it can't decrypt, and says so without what was in it", async () => {
    const problems: StoreProblem[] = []
    writeFileSync(file, "not encrypted by this keychain")

    const keys = keyStore(file, keychain(), "win32", (problem) => problems.push(problem))

    expect(await keys.read()).toEqual({})
    expect(existsSync(file)).toBe(false)
    expect(problems).toEqual([{ action: "read", stage: "decrypt", error: "Error" }])
  })
})
