import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import {
  type CliTarget,
  cliFolder,
  cliLaunchers,
  cliMarker,
  pathHasFolder,
  pathWithFolder
} from "@parity-app/processes"
import type { CliInstall } from "../shared/protocol.ts"

const run = promisify(execFile)

/**
 * What the `parity` command runs: an installed app's CLI, which the build ships unpacked beside the service, or in
 * development the checkout's source, which Node runs as TypeScript.
 */
export function cliTarget(packaged: boolean): CliTarget {
  if (!packaged) {
    return { platform: process.platform, executable: process.execPath, entry: checkoutCli() }
  }

  const appImage = process.platform === "linux" ? process.env.APPIMAGE : undefined

  return {
    platform: process.platform,
    executable: appImage ?? process.execPath,
    entry: appImage ? undefined : join(process.resourcesPath, "app.asar.unpacked", "cli", "dist", "bin.mjs")
  }
}

function checkoutCli(): string {
  for (let folder = import.meta.dirname; dirname(folder) !== folder; folder = dirname(folder)) {
    const entry = join(folder, "packages", "cli", "src", "bin.ts")

    if (existsSync(entry)) {
      return entry
    }
  }

  throw new Error("The CLI's source isn't in a folder above the app")
}

/** Help > Install the Parity CLI (PAR-906): writes the launchers and makes sure their folder is on PATH. */
export async function installCli(target: CliTarget): Promise<CliInstall> {
  const folder = cliFolder({ platform: target.platform, env: process.env, home: homedir() })
  const launchers = cliLaunchers(target)

  if (target.platform === "darwin") {
    await writeWithAdmin(folder, launchers)

    return { folder, onPath: true, newTerminal: false }
  }

  await mkdir(folder, { recursive: true })

  for (const launcher of launchers) {
    await writeLauncher(join(folder, launcher.name), launcher.text)
  }

  if (target.platform === "win32") {
    return { folder, onPath: true, newTerminal: await addToUserPath(folder) }
  }

  return { folder, onPath: pathHasFolder(process.env.PATH ?? "", folder, target.platform), newTerminal: false }
}

/**
 * Points launchers this app wrote at it again, as an installed app starts, so moving or reinstalling it keeps the
 * command working. A file without Parity's marker is someone else's and stays.
 */
export async function refreshCli(target: CliTarget): Promise<void> {
  const folder = cliFolder({ platform: target.platform, env: process.env, home: homedir() })

  for (const launcher of cliLaunchers(target)) {
    const file = join(folder, launcher.name)
    const current = await readFile(file, "utf8").catch(() => undefined)

    if (current === undefined || current === launcher.text || !current.includes(cliMarker)) {
      continue
    }

    await writeLauncher(file, launcher.text).catch(() => undefined)
  }
}

async function writeLauncher(file: string, text: string): Promise<void> {
  await writeFile(file, text)
  await chmod(file, 0o755)
}

/** `/usr/local/bin` usually needs an administrator, so when writing fails macOS asks for one, as VS Code's does. */
async function writeWithAdmin(folder: string, launchers: { name: string; text: string }[]): Promise<void> {
  try {
    await mkdir(folder, { recursive: true })

    for (const launcher of launchers) {
      await writeLauncher(join(folder, launcher.name), launcher.text)
    }

    return
  } catch {
    // Asks for an administrator below.
  }

  const staging = await mkdtemp(join(tmpdir(), "parity-cli-"))

  try {
    const steps = [`mkdir -p ${shellQuote(folder)}`]

    for (const launcher of launchers) {
      const staged = join(staging, launcher.name)
      const installed = join(folder, launcher.name)
      await writeFile(staged, launcher.text)
      steps.push(`cp ${shellQuote(staged)} ${shellQuote(installed)}`, `chmod 755 ${shellQuote(installed)}`)
    }

    const script = `do shell script ${JSON.stringify(steps.join(" && "))} with administrator privileges`
    await run("osascript", ["-e", script])
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * Adds the folder to the person's own PATH, kept as written so variables in it stay variables, and tells running apps
 * it changed, so a terminal opened next has it. Says whether it changed.
 */
async function addToUserPath(folder: string): Promise<boolean> {
  // UTF-8, so a folder named outside the console's code page comes back as it is, and is written back unchanged.
  const { stdout } = await powershell(
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment').GetValue('Path', '', 'DoNotExpandEnvironmentNames')"
  )

  const current = stdout.replace(/\r?\n$/, "")

  if (current.includes("�")) {
    throw new Error("Parity couldn't read your PATH, so it didn't change it.")
  }

  const next = pathWithFolder(current, folder, "win32")

  if (next === undefined) {
    return false
  }

  await powershell(
    [
      "[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment').SetValue('Path', $env:PARITY_PATH, 'ExpandString')",
      "Add-Type -Namespace Parity -Name Settings -MemberDefinition '[DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);'",
      "$result = [UIntPtr]::Zero",
      "[void][Parity.Settings]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)"
    ].join("; "),
    { PARITY_PATH: next }
  )

  return true
}

function powershell(command: string, env: Record<string, string> = {}) {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    env: { ...process.env, ...env },
    windowsHide: true
  })
}
