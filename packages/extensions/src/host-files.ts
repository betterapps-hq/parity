import type { Disposable, Files } from "@parity-app/extension-api"
import type { HostServiceMethods } from "./protocol.ts"

/*
 * `parity.files`' reads and watches in an extension's host. Each watch lives in the extension's process under a number
 * the host gives it, and the service says a watched file changed by that number.
 */

type Send = <M extends keyof HostServiceMethods>(
  method: M,
  params: HostServiceMethods[M]["params"]
) => Promise<HostServiceMethods[M]["result"]>

/** What the host does with file reads and watches. */
export interface HostFiles {
  /** `files.read`, `files.list` and `files.watch`, logging a watch the service refuses. */
  api(send: Send, log: (text: string) => void): Pick<Files, "read" | "list" | "watch">
  /** A watched file changed. */
  changed(id: number): void
}

/** The host's side of an extension's file reads and watches. */
export function hostFiles(): HostFiles {
  const watches = new Map<number, () => void>()
  let next = 0

  return {
    api: (send, log) => ({
      async read(path) {
        const { text } = await send("files.read", { path })

        return text
      },
      async list(folder) {
        const { paths } = await send("files.list", { folder })

        return paths
      },
      watch(path, listener): Disposable {
        const id = next++
        watches.set(id, listener)
        send("files.watch", { id, path }).catch((cause: unknown) => {
          watches.delete(id)
          log(`Couldn't watch ${path}: ${cause instanceof Error ? cause.message : String(cause)}`)
        })

        return {
          dispose() {
            if (watches.delete(id)) {
              void send("files.unwatch", { id }).catch(() => undefined)
            }
          }
        }
      }
    }),
    changed(id) {
      watches.get(id)?.()
    }
  }
}
