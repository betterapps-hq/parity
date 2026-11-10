import { rmSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { type Encryption, keepsSecrets, type StoreProblem, storeProblem, thrownError } from "./session-store.ts"

/** The keys kept, by connector id. */
const storedKeys = z.record(z.string(), z.string().min(1))

/** A key, and whether it's `saved` in the file or kept only for this `session`. */
export interface KeptKey {
  key: string
  source: "saved" | "session"
}

export interface KeyStore {
  /** Every key, by connector id: the ones in the file, and the ones kept only until Parity quits. */
  read(): Promise<Record<string, KeptKey>>
  /** Keeps a key: `saved` in the file, or `session`, in memory until Parity quits, where it couldn't be encrypted. */
  set(connector: string, key: string): Promise<"saved" | "session">
  /** Forgets a connector's key. */
  clear(connector: string): Promise<void>
}

/**
 * Connectors' API keys, kept in one file encrypted with the system's keychain through Electron's `safeStorage`, never
 * in a project, local storage or a window (PAR-829), as refresh tokens are. Where `safeStorage` would only obscure them,
 * on Linux without a keyring, nothing is written, and a key lasts until Parity quits.
 *
 * Other copies of Parity share the file, so each change starts from what's in it now. What's read is kept, so a search
 * doesn't decrypt the file each time; a key another copy changes is picked up when this one next changes a key or
 * starts.
 */
export function keyStore(
  file: string,
  encryption: Encryption,
  platform: NodeJS.Platform,
  failed: (problem: StoreProblem) => void = () => undefined
): KeyStore {
  const session = new Map<string, string>()
  let kept: Promise<Record<string, string>> | undefined

  const readFileKeys = async (): Promise<Record<string, string>> => {
    if (!(await keepsSecrets(encryption, platform))) {
      return {}
    }

    let encrypted: Buffer

    try {
      encrypted = await readFile(file)
    } catch (error) {
      const thrown = thrownError.parse(error)

      if (thrown.code !== "ENOENT") {
        failed(storeProblem("read", thrown, "file"))
      }

      return {}
    }

    try {
      const { result, shouldReEncrypt } = await encryption.decryptStringAsync(encrypted)
      const keys = storedKeys.parse(JSON.parse(result))

      if (shouldReEncrypt) {
        await write(keys)
      }

      return keys
    } catch (error) {
      // Unreadable, as after the keychain changed: the keys have to be added again.
      failed(storeProblem("read", thrownError.parse(error), "decrypt"))
      rmSync(file, { force: true })

      return {}
    }
  }

  const write = async (keys: Record<string, string>) => {
    if (Object.keys(keys).length === 0) {
      rmSync(file, { force: true })

      return
    }

    await writeFile(file, await encryption.encryptStringAsync(JSON.stringify(keys)), { mode: 0o600 })
  }

  /** Changes the file's keys, starting from what's in it now. */
  const change = async (update: (keys: Record<string, string>) => Record<string, string>) => {
    const next = update(await readFileKeys())

    try {
      await write(next)
    } catch (error) {
      failed(storeProblem("write", thrownError.parse(error)))
      throw error
    }

    kept = Promise.resolve(next)
  }

  return {
    async read() {
      kept ??= readFileKeys()
      const saved = Object.entries(await kept).map(([id, key]) => [id, { key, source: "saved" }] as const)
      const held = [...session].map(([id, key]) => [id, { key, source: "session" }] as const)

      return Object.fromEntries([...saved, ...held])
    },
    async set(connector, key) {
      if (!(await keepsSecrets(encryption, platform))) {
        session.set(connector, key)

        return "session"
      }

      session.delete(connector)
      await change((keys) => ({ ...keys, [connector]: key }))

      return "saved"
    },
    async clear(connector) {
      session.delete(connector)

      if (await keepsSecrets(encryption, platform)) {
        await change(({ [connector]: _gone, ...rest }) => rest)
      }
    }
  }
}
