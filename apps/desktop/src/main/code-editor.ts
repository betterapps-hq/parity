import { spawn } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { codeEditors, commandPaths, editorsFor, exportLine } from "@parity-app/core"
import { shell } from "electron"
import type { OpenInEditorRequest } from "../shared/protocol.ts"

/**
 * Where editors put their command when PATH doesn't say, as for an app the Dock started on macOS, whose PATH is only
 * the system's.
 */
const usualFolders: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ["/usr/local/bin", "/opt/homebrew/bin"],
  linux: ["/usr/local/bin", "/usr/bin", "/snap/bin"]
}

/**
 * Opens a file in the person's editor at a line, or the line its export is on (PAR-527): the editor they chose, or
 * with Automatic the first one installed, or the system's default app for the file when none is or they chose that.
 * Says which opened it.
 */
export async function openInEditor({
  file,
  export: name,
  line: at,
  editor
}: OpenInEditorRequest): Promise<{ opened: string }> {
  const line = at ?? (name ? exportLine(await readFile(file, "utf8").catch(() => ""), name) : undefined)
  const extra = usualFolders[process.platform] ?? []
  const env = { ...process.env, PATH: [process.env.PATH ?? process.env.Path ?? "", ...extra].join(pathSeparator()) }

  for (const candidate of editorsFor(editor)) {
    const command = await firstThere(commandPaths(candidate.command, env, process.platform))

    if (!command) {
      continue
    }

    await launch(command, candidate.args(file, line))

    return { opened: candidate.name }
  }

  const chosen = codeEditors.find((candidate) => candidate.id === editor)

  if (chosen) {
    throw new Error(
      `Couldn't find ${chosen.name}'s \`${chosen.command}\` command. Install it on your PATH from ${chosen.name}, or choose another editor in Settings.`
    )
  }

  const failed = await shell.openPath(file)

  if (failed) {
    throw new Error(failed)
  }

  return { opened: "your default app" }
}

function pathSeparator(): string {
  return process.platform === "win32" ? ";" : ":"
}

async function firstThere(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path)

      return path
    } catch {
      // Not in this folder.
    }
  }

  return undefined
}

/**
 * Starts the editor apart from Parity, so it stays open when Parity quits. On Windows an editor's command is a batch
 * file, which only a shell can run, so it and its arguments are quoted for one.
 */
function launch(command: string, args: string[]): Promise<void> {
  const batch = process.platform === "win32" && /\.(cmd|bat)$/i.test(command)
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

  const child = batch
    ? spawn(quote(command), args.map(quote), { shell: true, detached: true, stdio: "ignore", windowsHide: true })
    : spawn(command, args, { detached: true, stdio: "ignore" })

  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}
