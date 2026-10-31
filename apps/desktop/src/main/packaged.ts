/**
 * Whether the app runs as an installed build, reading its files from the package rather than beside its bundles.
 * Electron counts any program not named `electron` as packaged, and `pnpm dev` runs a copy of Electron named Parity,
 * so the dev runner, which sets `PARITY_DEV_RUNNER`, means it isn't.
 */
export function isPackaged(electronSaysPackaged: boolean, env: NodeJS.ProcessEnv): boolean {
  return electronSaysPackaged && !env.PARITY_DEV_RUNNER
}
