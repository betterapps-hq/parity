/**
 * Opening a component's code in the person's editor (PAR-527): which editors Parity knows, the command that opens a
 * file at a line in each, where on PATH that command can be, and the line a component's export is on.
 */

export type CodeEditorId = "vscode" | "cursor" | "windsurf" | "zed"

/** What the person chose in Settings: an editor, the first one installed, or the system's default app for the file. */
export type CodeEditorChoice = CodeEditorId | "auto" | "system"

export interface CodeEditor {
  id: CodeEditorId
  /** As Settings lists it. */
  name: string
  /** The command its installer puts on PATH. */
  command: string
  /** The arguments that open a file at a line. */
  args(file: string, line?: number): string[]
}

/** VS Code and its forks take `--goto file:line`; a new window isn't opened when one already has the folder. */
const goto = (file: string, line?: number) => ["--goto", line ? `${file}:${line}` : file]

/** In the order Automatic tries them. */
export const codeEditors: readonly CodeEditor[] = [
  { id: "vscode", name: "VS Code", command: "code", args: goto },
  { id: "cursor", name: "Cursor", command: "cursor", args: goto },
  { id: "windsurf", name: "Windsurf", command: "windsurf", args: goto },
  { id: "zed", name: "Zed", command: "zed", args: (file, line) => [line ? `${file}:${line}` : file] }
]

/** The editors a choice tries, in order; none means the system's default app. */
export function editorsFor(choice: CodeEditorChoice): readonly CodeEditor[] {
  if (choice === "system") {
    return []
  }

  if (choice === "auto") {
    return codeEditors
  }

  return codeEditors.filter((editor) => editor.id === choice)
}

/**
 * Every path a command could be at on PATH, in the order a shell looks: each folder in turn, and on Windows each of
 * PATHEXT's extensions there, as `code` is `code.cmd`.
 */
export function commandPaths(
  command: string,
  env: { PATH?: string; Path?: string; PATHEXT?: string },
  /** As Node's `process.platform` says. */
  platform: string
): string[] {
  const windows = platform === "win32"
  const folders = (env.PATH ?? env.Path ?? "").split(windows ? ";" : ":").filter(Boolean)
  const separator = windows ? "\\" : "/"
  const join = (folder: string, file: string) => folder.replace(/[\\/]+$/, "") + separator + file
  const extensions = windows ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""]

  return folders.flatMap((folder) => extensions.map((extension) => join(folder, command + extension.toLowerCase())))
}

/** What `cmd.exe` reads as more than a character, including `%`, which it expands even between quotes. */
const cmdSpecial = /([()\][%!^"`<>&|;, *?])/g

/**
 * The command line that runs a batch file, such as VS Code's `code.cmd`, with these arguments through `cmd.exe`, which
 * only a shell can on Windows. Each is quoted for the program and every character `cmd.exe` would act on, quotes
 * included, is escaped with `^`, so a folder named `100%PATH%` or `R&D` reaches the editor as it's spelled. Windows file
 * names can't hold `"`, so the arguments, a path and a line, need no escaping for the program beyond their quotes.
 */
export function batchCommandLine(command: string, args: readonly string[]): string {
  return [command, ...args].map((value) => `"${value}"`.replaceAll(cmdSpecial, "^$1")).join(" ")
}

/**
 * The line, from 1, where a module declares or lists an export: `export function Button`, `export const Button`,
 * `function Button` that a later `export { Button }` names, or the `export { … Button … }` itself, and `export default`
 * for `default`. Undefined when it can't be found, as for one re-exported from another file.
 */
export function exportLine(source: string, name: string): number | undefined {
  const lines = source.split(/\r?\n/)
  const word = name.replace(/[$]/g, "\\$")

  const at = (pattern: RegExp) => {
    const index = lines.findIndex((line) => pattern.test(line))

    return index === -1 ? undefined : index + 1
  }

  if (name === "default") {
    return at(/^\s*export\s+default\b/)
  }

  const declares = `(?:async\\s+)?(?:function\\*?|const|let|var|class|interface|type|enum)\\s+${word}\\b`

  return (
    at(new RegExp(`^\\s*export\\s+(?:declare\\s+)?${declares}`)) ??
    // Declared without `export` and listed in an `export { … }`: the declaration is what's worth reading.
    (at(new RegExp(`^\\s*export\\s*\\{[^}]*\\b${word}\\b`)) && at(new RegExp(`^\\s*(?:declare\\s+)?${declares}`))) ??
    at(new RegExp(`^\\s*export\\s*\\{[^}]*\\b${word}\\b`)) ??
    // A list that spans lines: the line naming it, after an `export {` that hasn't closed.
    multilineExport(lines, word)
  )
}

function multilineExport(lines: string[], word: string): number | undefined {
  let open = false

  for (const [index, line] of lines.entries()) {
    if (/^\s*export\s*\{/.test(line) && !line.includes("}")) {
      open = true
    } else if (open && new RegExp(`\\b${word}\\b`).test(line)) {
      return index + 1
    }

    if (open && line.includes("}")) {
      open = false
    }
  }

  return undefined
}
