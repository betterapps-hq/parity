import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { afterAll, describe, expect, it } from "vite-plus/test"

const root = resolve(import.meta.dirname, "..")
const vp = join(root, "node_modules/vite-plus/bin/vp")

interface Diagnostic {
  code: string
  help?: string
}

/**
 * Lints files with the workspace's settings in `vite.config.ts`, returning what it reported. JSON, since in CI oxlint
 * otherwise writes GitHub annotations, which leave out the help.
 */
function lint(...files: string[]): Diagnostic[] {
  const result = spawnSync(
    process.execPath,
    [vp, "lint", "--format", "json", ...files.map((file) => relative(root, file))],
    { cwd: root, encoding: "utf8" }
  )
  return (JSON.parse(result.stdout) as { diagnostics: Diagnostic[] }).diagnostics
}

describe("error notifications go through reportError (PAR-644)", () => {
  const folder = mkdtempSync(join(root, "scripts", "lint-probe-"))
  afterAll(() => rmSync(folder, { recursive: true, force: true }))

  it("refuses toast.error, naming reportError", () => {
    const file = join(folder, "probe.ts")
    writeFileSync(file, 'import { toast } from "sonner"\n\ntoast.error("Couldn\'t save")\n')

    expect(lint(file)).toEqual([
      expect.objectContaining({
        code: "eslint(no-restricted-properties)",
        help: expect.stringContaining("reportError")
      })
    ])
  })

  it("allows the other notifications", () => {
    const file = join(folder, "other.ts")
    writeFileSync(file, 'import { toast } from "sonner"\n\ntoast.success("Saved")\ntoast("Copied")\n')

    expect(lint(file)).toEqual([])
  })

  it("lets reportError's own module show the notification", () => {
    expect(lint(join(root, "apps/desktop/src/renderer/report-error.ts"))).toEqual([])
  })
})
