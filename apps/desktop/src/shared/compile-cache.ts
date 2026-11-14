import { flushCompileCache } from "node:module"

/**
 * Writes what this process compiled to Node's compile cache once it has settled, so its next launch skips compiling
 * it (PAR-1083). The built app's `start.mjs` turns the cache on and passes it to the processes main starts; without
 * it, as in a development build, this does nothing. Node writes the cache as a process exits too, but a builder or
 * the service can be ended outright.
 */
export function keepCompiledCode(after = 15_000): void {
  setTimeout(() => flushCompileCache(), after).unref()
}
