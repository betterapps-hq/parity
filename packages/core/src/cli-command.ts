/**
 * Help > Install the parity command (PAR-906) puts a `parity` command on the person's PATH that runs the CLI shipped
 * inside the app, with the app's own Electron as Node. It's always the app's version, needs no Node or npm, and starts
 * about a second and a half faster than `npx @parity-app/cli`, which resolves the package on every call.
 */

/** A file the command is made of, written into the command's folder. */
export interface CliLauncher {
  name: string
  text: string
}

/** What a launcher runs: the app's executable, as Node, on the CLI's entry. */
export interface CliTarget {
  platform: NodeJS.Platform
  /** The app's executable, or on Linux the AppImage, which mounts somewhere new each run. */
  executable: string
  /**
   * The CLI's `bin.mjs`. Undefined for an AppImage, whose files move with each mount: the launcher finds the CLI beside
   * the executable Node runs as.
   */
  entry: string | undefined
}

/** The first line after the interpreter's, which marks a launcher as Parity's, so the app only rewrites its own. */
export const cliMarker =
  "Written by Parity (Help > Install the parity command). It runs the CLI that ships with the app."

/** Where the command goes: a folder of Parity's own on Windows, which joins PATH, and one already on it elsewhere. */
export function cliFolder({
  platform,
  env,
  home
}: {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
}): string {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? `${home.replace(/[\\/]+$/, "")}\\AppData\\Local`

    return `${local.replace(/[\\/]+$/, "")}\\Parity\\bin`
  }

  if (platform === "darwin") {
    return "/usr/local/bin"
  }

  return `${home.replace(/\/+$/, "")}/.local/bin`
}

/**
 * The launchers for a system. Windows gets `parity.cmd`, for PowerShell and Command Prompt, and a `parity` shell script
 * for Git Bash, which doesn't run `.cmd` files by their bare name.
 */
export function cliLaunchers(target: CliTarget): CliLauncher[] {
  if (target.platform !== "win32") {
    return [{ name: "parity", text: shellLauncher(target) }]
  }

  return [
    { name: "parity.cmd", text: cmdLauncher(target) },
    { name: "parity", text: shellLauncher(target) }
  ]
}

function cmdLauncher({ executable, entry }: CliTarget): string {
  return [
    "@echo off",
    `rem ${cliMarker}`,
    "setlocal",
    'set "ELECTRON_RUN_AS_NODE=1"',
    `${cmdQuote(executable)} ${cmdQuote(entry ?? "")} %*`,
    ""
  ].join("\r\n")
}

function shellLauncher({ platform, executable, entry }: CliTarget): string {
  const slashes = (path: string) => (platform === "win32" ? path.replaceAll("\\", "/") : path)

  // `node -e` puts the arguments after the script at process.argv[1], so `parity` stands in for the script's path.
  const run =
    entry === undefined
      ? `${shellQuote(executable)} -e ${shellQuote(appImageEntry)} parity "$@"`
      : `${shellQuote(slashes(executable))} ${shellQuote(slashes(entry))} "$@"`

  return ["#!/bin/sh", `# ${cliMarker}`, `ELECTRON_RUN_AS_NODE=1 exec ${run}`, ""].join("\n")
}

/** Loads the CLI from the mounted AppImage, beside the executable Node runs as. */
const appImageEntry =
  'const { dirname, join } = require("node:path"); ' +
  'import(join(dirname(process.execPath), "resources/app.asar.unpacked/cli/dist/bin.mjs"))'

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** Command Prompt reads `%` in a script as a variable, even inside quotes; paths can't contain `"`. */
function cmdQuote(value: string): string {
  return `"${value.replaceAll("%", "%%")}"`
}

/** Whether a PATH value lists the folder, ignoring case on Windows and a trailing separator. */
export function pathHasFolder(path: string, folder: string, platform: NodeJS.Platform): boolean {
  const windows = platform === "win32"

  const normal = (entry: string) => {
    const trimmed = entry.trim().replace(windows ? /[\\/]+$/ : /\/+$/, "")

    return windows ? trimmed.toLowerCase() : trimmed
  }

  return path.split(windows ? ";" : ":").some((entry) => normal(entry) === normal(folder))
}

/** The person's PATH with the folder added at the end, or undefined when it's there already. */
export function pathWithFolder(path: string, folder: string, platform: NodeJS.Platform): string | undefined {
  if (pathHasFolder(path, folder, platform)) {
    return undefined
  }

  const separator = platform === "win32" ? ";" : ":"
  const kept = path.endsWith(separator) ? path.slice(0, -1) : path

  return kept === "" ? folder : `${kept}${separator}${folder}`
}
