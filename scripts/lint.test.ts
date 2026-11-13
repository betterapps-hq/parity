import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { parseData } from "@parity-app/core/schema"
import { afterAll, describe, expect, it } from "vite-plus/test"
import { z } from "zod"

const root = resolve(import.meta.dirname, "..")
const vp = join(root, "node_modules/vite-plus/bin/vp")

/** What oxlint's JSON output says of each problem, as far as these tests read it. */
const lintReport = z.object({
  diagnostics: z.array(z.object({ code: z.string(), message: z.string(), help: z.string().optional() }))
})

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

describe("shown keys come from the keymap (PAR-1041)", () => {
  const renderer = join(root, "apps/desktop/src/renderer")
  const folder = mkdtempSync(join(renderer, "lint-probe-"))
  const sketches = mkdtempSync(join(renderer, "explorations", "lint-probe-"))
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true })
    rmSync(sketches, { recursive: true, force: true })
  })

  const written = 'import { formatKeys } from "../chrome/keys.ts"\n\nexport const keys = formatKeys("Ctrl T")\n'

  it("refuses keys written out for formatKeys, naming shortcutOf", () => {
    const file = join(folder, "probe.tsx")
    writeFileSync(file, `${written}\nexport const exit = formatKeys(\`Alt F4\`)\n`)

    expect(lint(file)).toEqual([
      expect.objectContaining({ code: "parity(shortcut-from-keymap)", message: expect.stringContaining("shortcutOf") }),
      expect.objectContaining({ code: "parity(shortcut-from-keymap)" })
    ])
  })

  it("allows keys read from somewhere", () => {
    const file = join(folder, "read.tsx")
    writeFileSync(
      file,
      'import { formatKeys } from "../chrome/keys.ts"\n\nexport const show = (keys: string) => formatKeys(keys)\n'
    )

    expect(lint(file)).toEqual([])
  })

  it("lets explorations and stories write keys out", () => {
    const sketch = join(sketches, "sketch.tsx")
    const story = join(folder, "probe.stories.tsx")
    writeFileSync(sketch, written.replace("../chrome", "../../chrome"))
    writeFileSync(story, written)

    expect(lint(sketch, story)).toEqual([])
  })
})
