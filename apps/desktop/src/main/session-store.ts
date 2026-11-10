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
export function sessionStore(
  file: string,
  encryption: Encryption,
  platform: NodeJS.Platform,
  failed: (problem: StoreProblem) => void = () => undefined
): SessionStore {
  const persistent = () => keepsSecrets(encryption, platform)

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
    } catch (error) {
      // No file is no account kept; anything else is worth knowing about, though the file stays.
      const thrown = thrownError.parse(error)

      if (thrown.code !== "ENOENT") {
        failed(storeProblem("read", thrown, "file"))
      }

      return undefined
    }

    let stage: ReadStage = "decrypt"

    try {
      const { result, shouldReEncrypt } = await encryption.decryptStringAsync(encrypted)
      stage = "json"
      const json: unknown = JSON.parse(result)
      stage = "schema"
      const kept = storedAccounts.parse(json)

      // The keychain's key was rotated: write it again with the new one.
      if (shouldReEncrypt) {
        stage = "reencrypt"
        await write(kept)
      }

      return kept
    } catch (error) {
      // Unreadable, as after the keychain changed or from a build that kept one account: sign in again.
      failed(storeProblem("read", thrownError.parse(error), stage))
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

/**
 * Whether `safeStorage` really encrypts here, so a secret can be written to a file: false where it would fall back to
 * plain text, on Linux without a keyring.
 */
export async function keepsSecrets(encryption: Encryption, platform: NodeJS.Platform): Promise<boolean> {
  if (!(await encryption.isAsyncEncryptionAvailable())) {
    return false
  }

  if (platform !== "linux") {
    return true
  }

  const backend = encryption.getSelectedStorageBackend?.()

  return backend !== undefined && backend !== "basic_text" && backend !== "unknown"
}

type ReadStage = "file" | "decrypt" | "json" | "schema" | "reencrypt"

/**
 * Why the kept accounts couldn't be read or written, for `account.storeFailed`: the error's name and system code, never
 * its message, which can quote what was decrypted.
 */
export interface StoreProblem {
  action: "read" | "write"
  stage?: ReadStage
  error: string
  code?: string
}

/** What a thrown error says about itself that's safe to record: its name and system code, not its message. */
export const thrownError = z.object({ name: z.string(), code: z.string().optional() }).catch({ name: "unknown" })

export type ThrownError = z.output<typeof thrownError>

/** A failure reading or writing the kept accounts, as `account.storeFailed` records it. */
export function storeProblem(
  action: StoreProblem["action"],
  { name, code }: ThrownError,
  stage?: ReadStage
): StoreProblem {
  return {
    action,
    ...(stage !== undefined && { stage }),
    error: name,
    ...(code !== undefined && { code })
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
