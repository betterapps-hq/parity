import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { parseData } from "@parity-app/core/schema"
import { afterAll, describe, expect, it } from "vite-plus/test"
import { z } from "zod"

const root = resolve(import.meta.dirname, "..")
const vp = join(root, "node_modules/vite-plus/bin/vp")

/** What oxlint's JSON output says of each problem, as far as these tests read it. */
const lintReport = z.object({ diagnostics: z.array(z.object({ code: z.string(), help: z.string().optional() })) })

type Diagnostic = z.infer<typeof lintReport>["diagnostics"][number]

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

  return parseData(lintReport, JSON.parse(result.stdout)).diagnostics
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
    writeFileSync(file, 'import { toast } from "sonner"\n\ntoast.success("Saved")\n\ntoast("Copied")\n')

    expect(lint(file)).toEqual([])
  })

  it("lets reportError's own module show the notification", () => {
    expect(lint(join(root, "apps/desktop/src/renderer/report-error.ts"))).toEqual([])
  })
})
