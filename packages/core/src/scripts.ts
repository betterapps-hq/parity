/**
 * The first package.json script that runs a command, as `[name, command]`. Scripts named `dev`, `start` and `serve`
 * are tried first, since they're the ones that start a dev server.
 */
export function scriptRunning(
  scripts: Record<string, string> | undefined,
  command: RegExp
): [name: string, command: string] | undefined {
  const entries = Object.entries(scripts ?? {})
  const first = ["dev", "start", "serve"]
  entries.sort(([a], [b]) => rank(first, a) - rank(first, b))
  return entries.find(([, text]) => command.test(text))
}

function rank(first: string[], name: string): number {
  const index = first.indexOf(name)
  return index === -1 ? first.length : index
}

/** A command-line option's value: `-p 6006`, `--port 6006` or `--port=6006`. */
export function commandOption(command: string, names: string[]): string | undefined {
  for (const name of names) {
    const match = new RegExp(`(?:^|\\s)${name}(?:=|\\s+)(\\S+)`).exec(command)
    if (match) return match[1]!.replaceAll(/^["']|["']$/g, "")
  }
  return undefined
}
