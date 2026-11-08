import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { afterAll, describe, expect, it } from "vite-plus/test"

const root = resolve(import.meta.dirname, "..")
const vp = join(root, "node_modules/vite-plus/bin/vp")

/** Lints files with the workspace's settings in `vite.config.ts`, returning what it reported and whether it passed. */
function lint(...files: string[]): { output: string; passed: boolean } {
  const result = spawnSync(process.execPath, [vp, "lint", ...files.map((file) => relative(root, file))], {
    cwd: root,
    encoding: "utf8"
  })
  return { output: result.stdout + result.stderr, passed: result.status === 0 }
}

describe("error notifications go through reportError (PAR-644)", () => {
  const folder = mkdtempSync(join(root, "scripts", "lint-probe-"))
  afterAll(() => rmSync(folder, { recursive: true, force: true }))

  it("refuses toast.error, naming reportError", () => {
    const file = join(folder, "probe.ts")
    writeFileSync(file, 'import { toast } from "sonner"\n\ntoast.error("Couldn\'t save")\n')

    const { output, passed } = lint(file)

    expect(passed).toBe(false)
    expect(output).toContain("no-restricted-properties")
    expect(output).toContain("Use reportError")
  })

  it("allows the other notifications", () => {
    const file = join(folder, "other.ts")
    writeFileSync(file, 'import { toast } from "sonner"\n\ntoast.success("Saved")\ntoast("Copied")\n')

    expect(lint(file)).toEqual({ output: expect.any(String), passed: true })
  })

  it("lets reportError's own module show the notification", () => {
    expect(lint(join(root, "apps/desktop/src/renderer/report-error.ts")).passed).toBe(true)
  })
})
