import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { readTsconfig } from "@parity-app/project"
import { describe, expect, it } from "vite-plus/test"
import { guestRoutes } from "./guest-app.ts"
import { isProjectSourcePath, projectImports, projectModuleFolder, projectModulePage } from "./project-modules.ts"

describe("a page of the guest app's own for one of the project's modules", () => {
  it("renders a client module that imports the project's module whole, beside the guest's own pages", () => {
    const page = projectModulePage("src/components/Card.stories.tsx")
    const [module, route] = page.files

    expect(page.file.startsWith(`${projectModuleFolder}/src-components-Card-stories-`)).toBe(true)
    expect(page.file).toMatch(/-[0-9a-f]{8}\.tsx$/)
    expect(page.route).toBe(`${guestRoutes.guest}/modules/${page.file.slice(projectModuleFolder.length + 1, -4)}`)
    expect(module?.path).toBe(page.file)
    expect(module?.text).toContain('"use client"')
    expect(module?.text).toContain('import * as projectModule from "../../../../src/components/Card.stories.tsx"')
    expect(module?.text).toContain("export const parityModule = projectModule")
    expect(route?.path).toBe(`app/(parity)${page.route}/page.tsx`)
    expect(route?.text).toContain(
      `from "../../../../parity-modules/${page.file.slice(projectModuleFolder.length + 1, -4)}"`
    )
  })

  it("gives modules whose names read the same pages of their own", () => {
    expect(projectModulePage("src/a-b.tsx").file).not.toBe(projectModulePage("src/a/b.tsx").file)
  })

  it("is for the project's own modules, not packages', Next's output or other files", () => {
    expect(isProjectSourcePath("src/components/Card.tsx")).toBe(true)
    expect(isProjectSourcePath("lib/util.mjs")).toBe(true)
    expect(isProjectSourcePath("node_modules/ui/Card.js")).toBe(false)
    expect(isProjectSourcePath(".next/parity/app/guest.tsx")).toBe(false)
    expect(isProjectSourcePath("public/logo.png")).toBe(false)
  })
})

describe("what the project's modules import", () => {
  async function project(files: Record<string, string>) {
    const root = await mkdtemp(join(tmpdir(), "parity-project-imports-"))

    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), text)
    }

    return root
  }

  it("finds the components that reach a file, through relative imports and tsconfig aliases however deep", async () => {
    const root = await project({
      "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
      "src/lib/label.ts": 'export const label = "label"\n',
      "src/lib/index.ts": 'export { label } from "./label"\n',
      "src/components/Card.tsx": 'import { label } from "@/lib"\nimport "./Card.css"\n',
      "src/components/Card.css": '@import "./tokens.css";\n',
      "src/components/tokens.css": ":root {}\n",
      "src/components/Badge.tsx": 'import React from "react"\n',
      "src/app/page.tsx": 'import { Card } from "../components/Card"\n'
    })

    const imports = projectImports(root, readTsconfig(root))
    const components = ["src/app/page.tsx", "src/components/Card.tsx", "src/components/Badge.tsx"]

    expect(await imports.reaching(components, "src/lib/label.ts")).toEqual([
      "src/app/page.tsx",
      "src/components/Card.tsx"
    ])
    expect(await imports.reaching(components, "src/components/tokens.css")).toEqual([
      "src/app/page.tsx",
      "src/components/Card.tsx"
    ])
    expect(await imports.reaching(components, "src/components/Badge.tsx")).toEqual(["src/components/Badge.tsx"])
  })

  it("reads a file again once it changes", async () => {
    const root = await project({ "src/Card.tsx": "export {}\n", "src/label.ts": "export {}\n" })
    const imports = projectImports(root, readTsconfig(root))

    expect(await imports.reaching(["src/Card.tsx"], "src/label.ts")).toEqual([])

    await writeFile(join(root, "src/Card.tsx"), 'import "./label"\n')

    expect(await imports.reaching(["src/Card.tsx"], "src/label.ts")).toEqual([])

    imports.changed("src/Card.tsx")

    expect(await imports.reaching(["src/Card.tsx"], "src/label.ts")).toEqual(["src/Card.tsx"])
  })
})
