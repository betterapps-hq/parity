import { scriptRunning } from "@parity-app/project"

/** The bundler a Next.js dev server compiles with. */
export type NextBundler = "turbopack" | "webpack"

/** Runs Next's dev server: `next dev`, not `next build` or `next start`. */
const nextDev = /(?:^|[\s;&|(])next\s+dev\b/

/** The project's script that runs `next dev`, as its name and command, if one does. */
export function nextDevScript(
  scripts: Record<string, string> | undefined
): [name: string, command: string] | undefined {
  return scriptRunning(scripts, nextDev)
}

/**
 * The bundler `next dev` runs with that command, on that version of Next. Next.js 16 runs Turbopack unless it's passed
 * `--webpack`; 15 and earlier run webpack unless they're passed `--turbopack` or `--turbo`. Without a script, Next's
 * default for its version.
 */
export function nextBundler(command: string | undefined, version: string): NextBundler {
  if (command && /(?:^|\s)--webpack\b/.test(command)) {
    return "webpack"
  }

  if (command && /(?:^|\s)--turbo(?:pack)?\b/.test(command)) {
    return "turbopack"
  }

  return Number.parseInt(version, 10) >= 16 ? "turbopack" : "webpack"
}
