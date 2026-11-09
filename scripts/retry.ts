// Runs a command again when it fails, up to 3 times in all, for CI steps that download Electron from GitHub's releases,
// which time out now and then with a 504 that a second try gets past (PAR-789).
// Usage:
//   node scripts/retry.ts <command> [args...]
import { spawnSync } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

/** How many times a command is run before its failure stands. */
const tries = 3

/**
 * Runs `run` until it returns 0, at most `tries` times, waiting `wait` milliseconds times the try's number between
 * them, and returns the last exit code.
 */
export async function retry(
  run: () => number,
  { wait = 15_000, onRetry }: { wait?: number; onRetry?: (status: number, attempt: number) => void } = {}
): Promise<number> {
  let status = 1

  for (let attempt = 1; attempt <= tries; attempt++) {
    status = run()

    if (status === 0 || attempt === tries) {
      break
    }

    onRetry?.(status, attempt)
    await sleep(wait * attempt)
  }

  return status
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)

  if (!command) {
    console.error("Usage: node scripts/retry.ts <command> [args...]")
    process.exit(2)
  }

  // Through the shell on Windows, where pnpm is a .cmd that can't be spawned on its own, as one line, quoted.
  const run =
    process.platform === "win32"
      ? () =>
          spawnSync([command, ...args].map((part) => (/[\s"&|<>^]/.test(part) ? `"${part}"` : part)).join(" "), {
            stdio: "inherit",
            shell: true
          }).status ?? 1
      : () => spawnSync(command, args, { stdio: "inherit" }).status ?? 1

  const status = await retry(run, {
    onRetry: (code, attempt) =>
      console.log(`::warning::${[command, ...args].join(" ")} failed (exit ${code}), try ${attempt} of ${tries}`)
  })

  process.exit(status)
}
