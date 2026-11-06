// Reads components with the TypeScript checker off the service's main thread: it can take seconds on a large project.
import { parentPort } from "node:worker_threads"
import { createChannel, type Method, nodePort } from "@parity-app/channel"
import { type CheckRequest, type CheckResult, programCache, type PropsRequest, reactFinder } from "@parity-app/code"
import type { ComponentInfo } from "@parity-app/core"

/**
 * What's asked of the worker. `known` comes with a project's first request to a worker started again after one that
 * stopped while idle: the app's files that one's program had read, so this one's reads them too. `lockfiles` are the
 * project's lockfiles as `findLockfiles` finds them now, relative to the root.
 */
export interface CheckerMethods {
  props: { params: PropsRequest; result: Record<string, ComponentInfo> }
  check: { params: CheckRequest; result: CheckResult }
  close: { params: { root: string }; result: undefined }
}

if (parentPort) {
  // React's finder, the one renderer so far.
  const programs = programCache(reactFinder)
  createChannel<CheckerMethods, Record<never, Method>>({
    handlers: {
      props: (params) => programs.props(params),
      check: (params) => programs.check(params),
      close: ({ root }) => programs.close(root)
    }
  }).connect(nodePort(parentPort))
}
