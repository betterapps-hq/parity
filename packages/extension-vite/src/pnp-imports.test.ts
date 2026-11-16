import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { type PnpProject, pnpProject } from "@parity-app/project"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { importsOutsidePnp, outsideImport, resolveOutsidePnp } from "./pnp-imports.ts"

/**
 * A Plug'n'Play project in `app`, beside Parity's guest in `parity`, whose packages are in its own `node_modules`. The
 * stand-in for Yarn's runtime owns only the app's folder, as the real one does.
 */
let root: string
let project: PnpProject

const at = (...path: string[]) => join(root, ...path)
const posix = (path: string) => path.replaceAll("\\", "/")

function write(path: string, content: string): void {
  mkdirSync(dirname(at(path)), { recursive: true })
  writeFileSync(at(path), content)
}

// The native call gives the long name of a folder Windows shortens (RUNNER~1), as the resolver returns it.
beforeAll(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "parity-pnp-imports-")))
  write("app/package.json", JSON.stringify({ name: "app" }))
  write(
    "app/.pnp.cjs",
    `const path = require("node:path")
module.exports = {
  setup() {},
  findPackageLocator: (location) =>
    path.relative(__dirname, path.resolve(location)).startsWith("..") ? null : { name: "app", reference: "workspace:." },
  resolveToUnqualified() { throw new Error("Not in this project") }
}
`
  )
  write(
    "parity/node_modules/@acme/values/package.json",
    JSON.stringify({
      name: "@acme/values",
      exports: { ".": "./index.js", "./evaluate": { browser: "./evaluate.browser.js", node: "./evaluate.node.js" } }
    })
  )
  write("parity/node_modules/@acme/values/index.js", "export {}\n")
  write("parity/node_modules/@acme/values/evaluate.browser.js", "export {}\n")
  write("parity/node_modules/@acme/values/evaluate.node.js", "export {}\n")
  write("parity/guest.ts", "")
  project = pnpProject(at("app"))!
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe("imports from outside a Plug'n'Play project", () => {
  const guest = () => posix(at("parity", "guest.ts"))

  async function resolved(id: string, importer: string | undefined): Promise<string | undefined> {
    const outside = outsideImport(project, id, importer)

    return outside && resolveOutsidePnp(outside)
  }

  it("resolves a package Parity's guest imports from beside the guest, as a browser imports it", async () => {
    expect(await resolved("@acme/values", guest())).toBe(
      posix(at("parity", "node_modules", "@acme", "values", "index.js"))
    )
    expect(await resolved("@acme/values/evaluate", `${guest()}?v=1`)).toBe(
      posix(at("parity", "node_modules", "@acme", "values", "evaluate.browser.js"))
    )
  })

  it("leaves the project's own files, relative imports and virtual modules to Vite", () => {
    expect(outsideImport(project, "@acme/values", posix(at("app", "src", "main.tsx")))).toBeUndefined()
    expect(outsideImport(project, "./guest.ts", guest())).toBeUndefined()
    expect(outsideImport(project, "node:path", guest())).toBeUndefined()
    expect(outsideImport(project, "@acme/values", "\0canvas-guest")).toBeUndefined()
  })

  it("names the package of an import from outside, for runtime packages to resolve from the project", () => {
    expect(outsideImport(project, "react-dom/client", guest())).toEqual({
      name: "react-dom",
      subpath: "./client",
      file: guest()
    })
  })

  it("adds no plugin for a project installed with node_modules", () => {
    expect(importsOutsidePnp(at("parity"), [])).toBeUndefined()
    expect(importsOutsidePnp(at("app"), [])?.name).toBe("canvas:imports-outside-pnp")
  })
})
