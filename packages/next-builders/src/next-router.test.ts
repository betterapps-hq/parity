import type { ProjectConfig } from "@parity-app/core"
import { guestModule } from "@parity-app/project"
import { describe, expect, it } from "vite-plus/test"
import { guestAppFiles } from "./guest-app.ts"
import { nextRouterDecorator, nextRouterFile, nextRouterSource, nextRouterSpecifier } from "./next-router.ts"

const config: ProjectConfig = {
  styles: [],
  components: {},
  documents: [],
  libraries: [
    {
      id: "ui",
      kind: "components",
      name: "UI",
      package: "@acme/ui",
      importName: "@acme/ui",
      stylesImported: false,
      decorators: [{ wrap: { import: "@acme/ui", component: "TooltipProvider" } }]
    }
  ]
}

describe("Next's router on the canvas", () => {
  it("is a module of the guest app's own, beside the guest module, giving Next's own contexts", () => {
    const files = guestAppFiles({
      root: "D:/work/app",
      next: "D:/work/app/node_modules/next",
      origin: "http://127.0.0.1:4000",
      guestSource: "",
      styles: [],
      packageStyles: []
    })

    expect(files.find((file) => file.path === nextRouterFile)?.text).toBe(nextRouterSource)
    expect(nextRouterSource).toMatch(/^\/\/ Written by Parity's Next\.js builder each time it starts\.\n"use client"/)

    for (const context of [
      "AppRouterContext",
      "PathnameContext",
      "SearchParamsContext",
      "PathParamsContext",
      "RouterContext"
    ]) {
      expect(nextRouterSource).toContain(`<${context}.Provider`)
    }

    expect(nextRouterSource).toContain('from "next/dist/shared/lib/app-router-context.shared-runtime"')
  })

  it("wraps every frame, outside the libraries' decorators, with its module loaded beside theirs", () => {
    const { source } = guestModule(config, {
      renderer: "./runtime",
      projectPath: (path) => path,
      styles: "bundled",
      decorators: [nextRouterDecorator]
    })

    const list = /list: (\[.*\]),/.exec(source)?.[1]

    expect(JSON.parse(list ?? "[]")).toEqual([
      { library: "next", decorator: { wrap: { import: nextRouterSpecifier, component: "ParityNextRouter" } } },
      { library: "ui", decorator: { wrap: { import: "@acme/ui", component: "TooltipProvider" } } }
    ])
    expect(source).toContain(`import(${JSON.stringify(nextRouterSpecifier)})`)
    expect(source).toContain(`${JSON.stringify(nextRouterSpecifier)}: modules[`)
  })
})
