import { rmSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { accountPerson, signInProvider } from "../shared/account.ts"

/** What's kept between launches: the refresh token, and who it signs in so Parity can show them before refreshing. */
export const storedSession = z.strictObject({
  refreshToken: z.string().min(1),
  person: accountPerson,
  provider: signInProvider
})
export type StoredSession = z.infer<typeof storedSession>

/** The part of Electron's `safeStorage` the store uses, so tests can stand in for the keychain. */
export interface Encryption {
  isAsyncEncryptionAvailable(): Promise<boolean>
  /** Linux only: which keyring encrypts, or `basic_text` when there's none and it would be plain text. */
  getSelectedStorageBackend?(): string
  encryptStringAsync(text: string): Promise<Buffer>
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}

export interface SessionStore {
  /** Whether a session can be kept between launches: false where encrypting would fall back to plain text. */
  persistent(): Promise<boolean>
  read(): Promise<StoredSession | undefined>
  /** Keeps the session, and says whether it could. */
  save(session: StoredSession): Promise<boolean>
  clear(): void
}

/**
 * The refresh token, kept in one file encrypted with the system's keychain through Electron's `safeStorage`, never in a
 * project or local storage (proposals/sign-in.md, "What's kept where"). Where `safeStorage` would only obscure it, on
 * Linux without a keyring, nothing is written, and the person stays signed in until Parity quits.
 */
export function sessionStore(file: string, encryption: Encryption, platform: NodeJS.Platform): SessionStore {
  const persistent = async () => {
    if (!(await encryption.isAsyncEncryptionAvailable())) return false
    if (platform !== "linux") return true
    const backend = encryption.getSelectedStorageBackend?.()
    return backend !== undefined && backend !== "basic_text" && backend !== "unknown"
  }
  const clear = () => rmSync(file, { force: true })
  const save = async (session: StoredSession) => {
    if (!(await persistent())) return false
    await writeFile(file, await encryption.encryptStringAsync(JSON.stringify(session)), { mode: 0o600 })
    return true
  }
  return {
    persistent,
    async read() {
      if (!(await persistent())) return undefined
      let encrypted: Buffer
      try {
        encrypted = await readFile(file)
      } catch {
        return undefined
      }
      try {
        const { result, shouldReEncrypt } = await encryption.decryptStringAsync(encrypted)
        const session = storedSession.parse(JSON.parse(result))
        // The keychain's key was rotated: write it again with the new one.
        if (shouldReEncrypt) await save(session)
        return session
      } catch {
        // Unreadable, as after the keychain changed: the person signs in again.
        clear()
        return undefined
      }
    },
    save,
    clear
  }
}
