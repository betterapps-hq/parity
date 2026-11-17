// Generated from src/shared/built-in-extensions.ts. After changing that list, run
// `pnpm exec vp test run apps/desktop/src/shared/built-in-extensions.test.ts -u` to write it again.

/** Internal extensions' window modules, by extension id, each loading its chunk when its extension activates. */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- the window looks modules up by any extension id
export const windowModules: Record<string, () => Promise<object>> = {
  "@parity-app/extension-multiplayer": () => import("@parity-app/extension-multiplayer/window")
}
