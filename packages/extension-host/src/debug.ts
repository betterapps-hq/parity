/*
 * `PARITY_EXTENSIONS_DEBUG` (docs/extensions.md, "Debugging extensions"): with it set, every call core makes into a
 * window module, and every call the module makes back, goes to the extension's log tab and the local copy with how long
 * it took. `1` (or `true`, `all`, `*`) traces every extension; otherwise it names extensions by id or prefix, separated
 * by commas, as `multiplayer` or `@parity-app/extension-multiplayer,agentPresence`. Unset, empty or `0`, nothing is
 * traced.
 */

/** Which extensions' calls are traced, from `PARITY_EXTENSIONS_DEBUG`'s value. */
export function extensionsDebug(value: string | undefined): (extension: { id: string; prefix: string }) => boolean {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")

  if (names.length === 0 || (names.length === 1 && ["0", "false", "off"].includes(names[0]?.toLowerCase() ?? ""))) {
    return () => false
  }

  if (names.some((name) => ["1", "true", "all", "*"].includes(name.toLowerCase()))) {
    return () => true
  }

  return ({ id, prefix }) => names.includes(id) || names.includes(prefix)
}

/** A call between core and a window module, as `PARITY_EXTENSIONS_DEBUG` traces it. */
export interface TracedCall {
  /** `in` when core called the module; `out` when the module called core or its Node half. */
  direction: "in" | "out"
  /** What was called, as `selection.onChange`, `command:multiplayer.follow`, `node.join` or `host.leave`. */
  api: string
  durationMs: number
  outcome: "ok" | "error"
}

/** A traced call as a line in the extension's log: `in selection.onChange 0.4 ms`, with `failed` when it threw. */
export function describeCall({ direction, api, durationMs, outcome }: TracedCall): string {
  const took = durationMs < 10 ? durationMs.toFixed(1) : String(Math.round(durationMs))

  return `${direction} ${api} ${took} ms${outcome === "error" ? ", failed" : ""}`
}
