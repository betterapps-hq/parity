import { rmSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { accountPerson, signInProvider } from "../shared/account.ts"

/**
 * One account kept between launches: its refresh token, and who it signs in so Parity can show them before refreshing.
 * An account whose session WorkOS ended keeps who it was and how they signed in, with no token, so it can be signed in
 * to again.
 */
export const storedAccount = z.strictObject({
  refreshToken: z.string().min(1).optional(),
  person: accountPerson,
  provider: signInProvider
})

export type StoredAccount = z.infer<typeof storedAccount>

/** Every account kept, in the order they were added, and the one Parity was last in, to start in it. */
export const storedAccounts = z.strictObject({
  current: z.string().optional(),
  accounts: z.array(storedAccount)
})

export type StoredAccounts = z.infer<typeof storedAccounts>

/** The part of Electron's `safeStorage` the store uses, so tests can stand in for the keychain. */
export interface Encryption {
  isAsyncEncryptionAvailable(): Promise<boolean>
  /** Linux only: which keyring encrypts, or `basic_text` when there's none and it would be plain text. */
  getSelectedStorageBackend?(): string
  encryptStringAsync(text: string): Promise<Buffer>
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}

export interface SessionStore {
  /** Whether accounts can be kept between launches: false where encrypting would fall back to plain text. */
  persistent(): Promise<boolean>
  read(): Promise<StoredAccounts | undefined>
  /**
   * Changes what's kept, starting from what's in the file now, since other copies of Parity share it and each refresh
   * replaces a token. With no account left, the file goes. Says whether the accounts could be kept.
   */
  update(change: (kept: StoredAccounts) => StoredAccounts): Promise<boolean>
  clear(): void
}

/**
 * Refresh tokens, kept in one file encrypted with the system's keychain through Electron's `safeStorage`, never in a
 * project or local storage (proposals/sign-in.md, "What's kept where"). Where `safeStorage` would only obscure them, on
 * Linux without a keyring, nothing is written, and the person stays signed in until Parity quits.
 */
export function sessionStore(file: string, encryption: Encryption, platform: NodeJS.Platform): SessionStore {
  const persistent = async () => {
    if (!(await encryption.isAsyncEncryptionAvailable())) {
      return false
    }

    if (platform !== "linux") {
      return true
    }

    const backend = encryption.getSelectedStorageBackend?.()

    return backend !== undefined && backend !== "basic_text" && backend !== "unknown"
  }

  const clear = () => rmSync(file, { force: true })

  const write = async (kept: StoredAccounts) => {
    if (kept.accounts.length === 0) {
      clear()

      return
    }

    await writeFile(file, await encryption.encryptStringAsync(JSON.stringify(kept)), { mode: 0o600 })
  }

  const read = async () => {
    if (!(await persistent())) {
      return undefined
    }

    let encrypted: Buffer

    try {
      encrypted = await readFile(file)
    } catch {
      return undefined
    }

    try {
      const { result, shouldReEncrypt } = await encryption.decryptStringAsync(encrypted)
      const kept = storedAccounts.parse(JSON.parse(result))

      // The keychain's key was rotated: write it again with the new one.
      if (shouldReEncrypt) {
        await write(kept)
      }

      return kept
    } catch {
      // Unreadable, as after the keychain changed or from a build that kept one account: sign in again.
      clear()

      return undefined
    }
  }

  return {
    persistent,
    read,
    async update(change) {
      if (!(await persistent())) {
        return false
      }

      await write(change((await read()) ?? { accounts: [] }))

      return true
    },
    clear
  }
}

/** What's kept with `account` in its place, or added at the end. */
export function withAccount(kept: StoredAccounts, account: StoredAccount): StoredAccounts {
  const { email } = account.person

  const accounts = kept.accounts.some((each) => each.person.email === email)
    ? kept.accounts.map((each) => (each.person.email === email ? account : each))
    : [...kept.accounts, account]

  return { ...kept, accounts }
}

/** What's kept without the account signed in as `email`. */
export function withoutAccount(kept: StoredAccounts, email: string): StoredAccounts {
  const accounts = kept.accounts.filter((each) => each.person.email !== email)

  return kept.current === email ? { accounts } : { ...kept, accounts }
}
