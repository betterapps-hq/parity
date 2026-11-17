// Generated from src/shared/built-in-extensions.ts. After changing that list, run
// `pnpm exec vp test run apps/desktop/src/shared/built-in-extensions.test.ts -u` to write it again.

/** Internal extensions' window modules, by extension id, each loading its chunk when its extension activates. */
export const windowModules = new Map<string, () => Promise<object>>([
  ["@parity-app/extension-agent-presence", () => import("@parity-app/extension-agent-presence/window")],
  ["@parity-app/extension-multiplayer", () => import("@parity-app/extension-multiplayer/window")]
])
