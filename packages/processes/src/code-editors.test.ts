import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { batchCommandLine, codeEditors, commandPaths, editorsFor, exportLine } from "./code-editors.ts"

describe("the editors a choice tries", () => {
  it("tries every known editor in order for Automatic, one for a named editor, and none for the system's app", () => {
    expect(editorsFor("auto").map((editor) => editor.id)).toEqual(["vscode", "cursor", "windsurf", "zed"])
    expect(editorsFor("cursor").map((editor) => editor.id)).toEqual(["cursor"])
    expect(editorsFor("system")).toEqual([])
  })

  it("opens a file at a line in VS Code's way, and in Zed's", () => {
    const [vscode] = editorsFor("vscode")
    const [zed] = editorsFor("zed")
    expect(vscode!.args("D:/shop/src/button.tsx", 12)).toEqual(["--goto", "D:/shop/src/button.tsx:12"])
    expect(vscode!.args("D:/shop/src/button.tsx")).toEqual(["--goto", "D:/shop/src/button.tsx"])
    expect(zed!.args("/shop/src/button.tsx", 12)).toEqual(["/shop/src/button.tsx:12"])
    expect(codeEditors.every((editor) => editor.command === editor.command.toLowerCase())).toBe(true)
  })
})

describe("where a command can be on PATH", () => {
  it("looks in each folder with each of PATHEXT's extensions on Windows", () => {
    expect(commandPaths("code", { Path: "C:\\bin;C:\\tools", PATHEXT: ".EXE;.CMD" }, "win32")).toEqual([
      "C:\\bin\\code.exe",
      "C:\\bin\\code.cmd",
      "C:\\tools\\code.exe",
      "C:\\tools\\code.cmd"
    ])
  })

  it("looks for the bare command in each folder elsewhere, skipping empty entries", () => {
    expect(commandPaths("zed", { PATH: "/usr/local/bin/::/usr/bin" }, "darwin")).toEqual([
      "/usr/local/bin/zed",
      "/usr/bin/zed"
    ])
  })
})

describe("the command line that runs an editor's batch file", () => {
  it("escapes every character cmd.exe acts on, quotes and percents included", () => {
    expect(batchCommandLine(String.raw`C:\VS Code\code.cmd`, ["--goto", String.raw`D:\R&D\100%PATH%\a.tsx:3`])).toBe(
      String.raw`^"C:\VS^ Code\code.cmd^" ^"--goto^" ^"D:\R^&D\100^%PATH^%\a.tsx:3^"`
    )
  })

  it.runIf(process.platform === "win32")("passes paths through cmd.exe and a batch file as they're spelled", () => {
    const folder = mkdtempSync(join(tmpdir(), "parity editor "))

    try {
      // As VS Code's code.cmd passes its arguments on, with %*.
      const batch = join(folder, "echo (1).cmd")
      writeFileSync(batch, '@echo off\r\nnode -e "console.log(JSON.stringify(process.argv.slice(1)))" -- %*\r\n')
      const args = ["--goto", String.raw`D:\R&D (old)\100%PATH%\a!b^c;d, e.tsx:12`, "%USERNAME%"]
      const run = spawnSync(batchCommandLine(batch, args), { shell: true, encoding: "utf8" })

      expect(JSON.parse(run.stdout)).toEqual(args)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe("the line a component's export is on", () => {
  it("finds an exported function, constant or class", () => {
    const source = ["import * as React from 'react'", "", "export function Button() {", "  return null", "}"].join("\n")
    expect(exportLine(source, "Button")).toBe(3)
    expect(exportLine("const a = 1\nexport const Card = () => null\n", "Card")).toBe(2)
    expect(exportLine("export class Dialog {}\n", "Dialog")).toBe(1)
    expect(exportLine("export async function Loader() {}\n", "Loader")).toBe(1)
  })

  it("finds the declaration of one an export list names, as shadcn's files do", () => {
    const source = [
      "function Badge() {",
      "  return null",
      "}",
      "",
      "function badgeVariants() {}",
      "",
      "export { Badge, badgeVariants }"
    ].join("\n")

    expect(exportLine(source, "Badge")).toBe(1)
    expect(exportLine(source, "badgeVariants")).toBe(5)
  })

  it("finds the name in an export list over several lines when it isn't declared there", () => {
    const source = ["export {", "  Tabs,", "  TabsList,", "} from './tabs-primitive'"].join("\n")
    expect(exportLine(source, "TabsList")).toBe(3)
  })

  it("doesn't take a longer name for the one asked for", () => {
    const source = "export function ButtonGroup() {}\nexport function Button() {}\n"
    expect(exportLine(source, "Button")).toBe(2)
  })

  it("finds a default export, a declared one in type declarations, and nothing for a name it hasn't", () => {
    expect(exportLine("const x = 1\nexport default function Page() {}\n", "default")).toBe(2)
    expect(exportLine("export declare const Root: React.FC\n", "Root")).toBe(1)
    expect(exportLine("export function Button() {}\n", "Card")).toBeUndefined()
  })

  it("reads files with Windows line endings", () => {
    expect(exportLine("// a\r\nexport function Button() {}\r\n", "Button")).toBe(2)
  })
})
