import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { totalmem } from "node:os"
import { Worker } from "node:worker_threads"
import type { CheckResult } from "@parity-app/code"
import type { ComponentInfo, ComponentSource } from "@parity-app/core"
import { findLockfiles } from "@parity-app/project"
import { logNote } from "../shared/log.ts"
import { environment } from "./environment.ts"
import type { CheckerMethods } from "./props-worker.ts"
import { recordFromWorker, reportWorkerError } from "./telemetry.ts"
import { type WorkerClient, workerClient } from "./worker-client.ts"

const workerUrl = new URL("./props-worker.mjs", import.meta.url)

/** The checker's own version, from its code, so results an earlier one saved aren't used. */
export const checkerVersion = (() => {
  try {
    return createHash("sha256").update(readFileSync(workerUrl)).digest("hex")
  } catch {
    return "unbuilt"
  }
})()

/**
 * How long the type checker keeps its projects' programs with nothing asked of it: long enough that someone editing the
 * app's code keeps a warm one. Stopping returns all of them (the example project's took the service from 279 to 134
 * MB, and Copacker's is 1.26 GB), and the next request builds its project's program again, about a second more on the
 * example. `PARITY_CHECKER_IDLE_MS` changes it, for measuring.
 */
export const checkerIdleMs = environment().PARITY_CHECKER_IDLE_MS ?? 5 * 60_000

/** Props and the component check, read by TypeScript's checker in a worker thread, one request at a time. */
export interface TypeChecker {
  /** Infers every component's props. */
  inferComponents: (
    root: string,
    components: Record<string, ComponentSource>,
    /** The app's files the type checker reads next, read now too, so both use one program. */
    files?: string[]
  ) => Promise<Record<string, ComponentInfo>>
  /** Asks which of the app's files' exports are components, and why it left out the others, from the same program. */
  checkComponents: (root: string, files: string[]) => Promise<CheckResult>
  /**
   * Lets go of a closed project's program, which can hold a couple of gigabytes. With no project open, the worker
   * stops, returning all of it.
   */
  closeChecker: (root: string, lastProject: boolean) => void
}

/**
 * The type checker on a worker that can stop between requests. Each project's program reads the files earlier requests
 * asked for as well as its own, so a worker started again is given them, and builds the program the last one had.
 * Each request carries the project's lockfiles as they're found now, so the worker sees one appear or change and reads
 * installed packages' declarations again.
 */
export function typeChecker(
  client: WorkerClient<CheckerMethods>,
  lockfiles: (root: string) => Promise<string[]> = findLockfiles
): TypeChecker {
  /** The app's files each open project's program was asked to read. */
  const read = new Map<string, Set<string>>()
  /** The projects the running worker has had a request for, so it already has their files. */
  const primed = new Set<string>()
  /** How many times each project was closed, so a request made before a close isn't sent after it. */
  const closes = new Map<string, number>()

  const ask = async <M extends "props" | "check">(
    method: M,
    root: string,
    params: Omit<CheckerMethods[M]["params"], "root" | "lockfiles" | "known">,
    files: string[]
  ): Promise<CheckerMethods[M]["result"]> => {
    const closed = closes.get(root) ?? 0
    const locks = await lockfiles(root)

    if ((closes.get(root) ?? 0) !== closed) {
      throw new Error("The project closed")
    }

    if (!client.running) {
      primed.clear()
    }

    const known = primed.has(root) ? [] : [...(read.get(root) ?? [])]
    primed.add(root)
    const kept = read.get(root) ?? new Set<string>()

    for (const file of files) {
      kept.add(file)
    }

    read.set(root, kept)

    const sent = { ...params, root, lockfiles: locks }

    // SAFETY: `params` is `M`'s own params less the three fields filled in here; TypeScript can't see that `Omit` and
    // the fields put back make the whole type again for a generic `M`.
    return client.request(method, (known.length > 0 ? { ...sent, known } : sent) as CheckerMethods[M]["params"])
  }

  return {
    async inferComponents(root, components, files = []) {
      const started = Date.now()
      const result = (await ask("props", root, { components, files }, files)) ?? {}
      logNote(`[service] props for ${Object.keys(result).length} components in ${Date.now() - started}ms`)

      return result
    },
    async checkComponents(root, files) {
      const started = Date.now()
      const result = await ask("check", root, { files }, files)
      logNote(`[service] the type checker read ${files.length} files in ${Date.now() - started}ms`)

      return result
    },
    closeChecker(root, lastProject) {
      closes.set(root, (closes.get(root) ?? 0) + 1)
      read.delete(root)
      primed.delete(root)

      if (lastProject) {
        read.clear()
        client.stop(new Error("The project closed"))

        return
      }

      if (client.running) {
        void client.request("close", { root }).catch(() => undefined)
      }
    }
  }
}

/** The service's type checker, on a worker that stops when it has nothing to do. */
export const checker = typeChecker(
  workerClient<CheckerMethods>({
    // Half the computer's memory at most, so a project too big to check stops the worker rather than the computer.
    start: () => {
      const worker = new Worker(workerUrl, {
        resourceLimits: { maxOldGenerationSizeMb: Math.round(totalmem() / 2 ** 20 / 2) }
      })

      // The worker's events come beside its channel's messages (PAR-627).
      worker.on("message", recordFromWorker)

      return worker
    },
    idleMs: checkerIdleMs,
    failed: (error: Error & { code?: string }) => {
      reportWorkerError(error)

      return error.code === "ERR_WORKER_OUT_OF_MEMORY"
        ? new Error("The type checker ran out of memory. Components are as the parse found them.", { cause: error })
        : error
    },
    stopped: () =>
      logNote(
        `[service] the type checker stopped after ${checkerIdleMs / 1000}s with nothing to do, freeing its memory`
      )
  })
)
